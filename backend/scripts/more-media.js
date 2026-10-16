import mongoose from "mongoose";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { User } from "../src/models/User.js";
import { Vehicle } from "../src/models/Vehicle.js";
import { Media, SIZE_LIMITS } from "../src/models/Media.js";
import { Post } from "../src/models/Post.js";
import { Comment } from "../src/models/Comment.js";
import { UPLOADS } from "../src/uploads.js";
import { normalizeName } from "../src/wikipedia.js";
import { WRONG_MEDIA } from "./curated-media.js";

/*
 * Complète chaque fiche véhicule jusqu'à N photos et M vidéos (base LOCALE uniquement :
 * les licences ne sont pas filtrées, ces fichiers ne doivent pas être publiés).
 *  - photos : images des articles Wikipédia en et fr (y compris les fichiers non libres
 *    d'en.wikipedia), puis la catégorie Commons du véhicule (Wikidata P373, sans ses
 *    sous-catégories : celle du Lynx contient le Wildcat, celle du Leopard 2 des ponts…) ;
 *  - vidéos : catégorie Commons et « dépeint » (P180), puis recherche YouTube (yt-dlp),
 *    réencodées en MP4 480p, 90 s au plus (ffmpeg).
 *    Les titres YouTube doivent citer le véhicule ; jeux vidéo, maquettes et compilations écartés.
 *
 * Usage : cd backend && npm run more-media [-- --images 10 --videos 3 --only "Leopard 2" --dry-run]
 * Outils : data/tools/yt-dlp.exe et data/tools/ffmpeg.exe, ou YTDLP_PATH / FFMPEG_PATH, ou le PATH.
 * Relançable : un média déjà présent (même nom d'origine) n'est pas réimporté ; les
 * recherches sont mises en cache dans data/uploads/.more-media-cache.json.
 */

const DOMAIN = "afterburner.seed";
const UA = process.env.WIKI_USER_AGENT || "Afterburner/1.0 (projet etudiant MIAGE)";
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const WIKIDATA_API = "https://www.wikidata.org/w/api.php";
const CACHE_FILE = path.join(UPLOADS, ".more-media-cache.json");
const DAY = 24 * 60 * 60 * 1000;
const CLIP_SECONDS = 90;
const IMAGE_MIME = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
const YOUTUBE_KEYWORD = { aircraft: "aircraft", helicopter: "helicopter", tank: "tank", armored: "armored vehicle" };

const tool = (env, file, fallback) => process.env[env] || (existsSync(path.resolve("data/tools", file)) ? path.resolve("data/tools", file) : fallback);
const YTDLP = tool("YTDLP_PATH", "yt-dlp.exe", "yt-dlp");
const FFMPEG = tool("FFMPEG_PATH", "ffmpeg.exe", "ffmpeg");

const INTROS = {
  image: ["{v} sous son meilleur angle.", "Un cliché de {v} à partager avec l'escadrille.", "Photo : {v}.", "Encore une belle photo de {v}."],
  video: ["Vidéo : {v} en action.", "À regarder avec le son : {v}.", "Images de {v}, impressionnant."],
};
const COMMENTS = ["Superbe !", "Magnifique 👏", "Quelle machine…", "Merci du partage", "On voit bien les détails", "Rien de tel en vrai", "Une légende"];

// Fichiers d'articles qui ne montrent pas le véhicule : cartes, drapeaux, logos, schémas…
const NOT_A_PHOTO = /flag|drapeau|logo|map|carte|icon|roundel|cocarde|insignia|insigne|emblem|blason|coat.of.arms|badge|patch|seal|diagram|schema|sch[ée]ma|3.?view|silhouette|line.?drawing|plan |cutaway|profile.drawing|signature|portrait|commons-|wiki|question.book|ambox|edit-clear|crystal|nuvola|disambig|stub/i;
// Vidéos YouTube écartées : jeux, simulateurs, maquettes, compilations.
const NOT_REAL = /war ?thunder|world of (tanks|warplanes|warships)|\bwot\b|\bdcs\b|arma ?3|battlefield|gameplay|simulat|msfs|flight sim|\bgame\b|\blego\b|\brc\b|model kit|scale model|maquette|\btoy\b|1\/(35|48|72|144)|top \d+|compilation|vs\.?\s|versus|animation|\bcgi\b|\b3d\b|but you.?re|\bmeme\b|\bpov\b/i;
// Mots trop courants pour identifier un véhicule dans un titre YouTube.
const GENERIC = new Set(["general", "dynamics", "dassault", "breguet", "dornier", "lockheed", "martin", "mcdonnell", "douglas", "boeing", "northrop", "grumman",
  "north", "american", "bell", "sikorsky", "airbus", "helicopters", "aerospatiale", "eurocopter", "mikoyan", "gurevich", "mil", "kamov", "tupolev", "ilyushin", "uralvagonzavod", "sukhoi", "saab", "bae", "systems",
  "hawker", "siddeley", "avro", "havilland", "westland", "agustawestland", "supermarine", "messerschmitt", "focke", "wulf", "junkers", "mitsubishi", "panhard",
  "renault", "fairchild", "republic", "fighting", "tank", "main", "battle", "armoured", "armored", "vehicle", "infantry", "fighting", "combat", "the", "and",
  "aircraft", "helicopter", "char", "type", "family", "series", "light", "heavy", "medium", "carrier", "personnel"]);

let state = 20261015;
const rand = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 0x100000000);
const pick = (list) => list[Math.floor(rand() * list.length)];
const sample = (list, n) => [...list].sort(() => rand() - 0.5).slice(0, n);
const between = (min, max) => min + Math.floor(rand() * (max - min + 1));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...args) => console.log("[more-media]", ...args);

function parseArgs(argv) {
  const value = (name, fallback) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
  };
  return { images: Number(value("images", 10)), videos: Number(value("videos", 3)), only: value("only", null), dryRun: argv.includes("--dry-run") };
}

// --- Cache et appels réseau ---------------------------------------------------

let cache = {};
async function cached(key, compute) {
  if (key in cache) return cache[key];
  const value = await compute();
  if (value !== null) {
    cache[key] = value;
    await fs.writeFile(CACHE_FILE, JSON.stringify(cache));
  }
  return value;
}

/** GET JSON avec nouvelles tentatives si Wikimedia limite le débit. Null après 4 échecs. */
async function getJson(url) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30000) });
      const text = await response.text();
      if (response.ok && text.startsWith("{")) {
        await sleep(500);
        return JSON.parse(text);
      }
      throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      log(`${new URL(url).host} : ${error.message} — nouvel essai dans ${10 * attempt} s`);
      await sleep(10000 * attempt);
    }
  }
  return null;
}

const plain = (html) => (html ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

/** Pages de fichiers d'une réponse `prop=imageinfo` → { title, mediatype, mime, size, width, height, url, thumburl, pageUrl, artist, license }. */
function filesOf(data) {
  return (data?.query?.pages ?? []).flatMap((p) => {
    const info = p.imageinfo?.[0];
    if (!info) return [];
    return [{
      title: p.title, mediatype: info.mediatype, mime: info.mime, size: info.size, width: info.width, height: info.height,
      url: info.url, thumburl: info.thumburl, pageUrl: info.descriptionurl,
      artist: plain(info.extmetadata?.Artist?.value).slice(0, 80) || "auteur inconnu",
      license: plain(info.extmetadata?.LicenseShortName?.value) || "licence inconnue",
    }];
  });
}

const IMAGEINFO = { prop: "imageinfo", iiprop: "url|size|mime|mediatype|extmetadata", iiextmetadatafilter: "Artist|LicenseShortName", iiurlwidth: "1280" };

/** Libellé anglais, catégorie Commons et articles fr/en de chaque élément Wikidata. */
async function wikidataInfo(qids) {
  const result = {};
  for (let i = 0; i < qids.length; i += 50) {
    const params = new URLSearchParams({
      action: "wbgetentities", format: "json", ids: qids.slice(i, i + 50).join("|"), props: "labels|claims|sitelinks",
      languages: "en|fr", sitefilter: "enwiki|frwiki",
    });
    const data = await getJson(`${WIKIDATA_API}?${params}`);
    for (const [qid, e] of Object.entries(data?.entities ?? {})) {
      result[qid] = {
        label: e.labels?.en?.value ?? e.labels?.fr?.value ?? null,
        commonsCategory: e.claims?.P373?.[0]?.mainsnak?.datavalue?.value ?? null,
        articles: [["en", e.sitelinks?.enwiki?.title], ["fr", e.sitelinks?.frwiki?.title]].filter(([, t]) => t),
      };
    }
  }
  return result;
}

/** Fichiers affichés dans un article Wikipédia (fichiers locaux non libres compris). */
async function articleFiles(lang, title) {
  const params = new URLSearchParams({ action: "query", format: "json", formatversion: "2", titles: title, generator: "images", gimlimit: "60", ...IMAGEINFO });
  const data = await getJson(`https://${lang}.wikipedia.org/w/api.php?${params}`);
  return data ? filesOf(data).map((f) => ({ ...f, source: `Wikipédia (${lang})` })) : null;
}

/** Recherche de fichiers Commons (CirrusSearch : incategory, deepcategory, haswbstatement…). */
async function commonsSearch(query, limit) {
  const params = new URLSearchParams({ action: "query", format: "json", formatversion: "2", generator: "search", gsrnamespace: "6", gsrlimit: String(limit), gsrsearch: query, ...IMAGEINFO });
  const data = await getJson(`${COMMONS_API}?${params}`);
  return data ? filesOf(data).map((f) => ({ ...f, source: "Wikimedia Commons" })) : null;
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(stdout) : reject(new Error(stderr.trim().split("\n").at(-1) || `${path.basename(command)} ${code}`))));
  });
}

async function available(command, args) {
  try {
    await run(command, args);
    return true;
  } catch {
    return false;
  }
}

/** Résultats d'une recherche YouTube : [{ id, title, channel, duration }]. */
async function youtubeSearch(query, limit) {
  try {
    const out = await run(YTDLP, ["--js-runtimes", "node", "--flat-playlist", "--no-warnings", "--print", "%(id)s\t%(duration)s\t%(channel)s\t%(title)s", `ytsearch${limit}:${query}`]);
    return out.trim().split("\n").filter(Boolean).map((line) => {
      const [id, duration, channel, ...title] = line.split("\t");
      return { id, duration: Number(duration) || 0, channel, title: title.join("\t") };
    });
  } catch (error) {
    log(`YouTube « ${query} » : ${error.message}`);
    return null;
  }
}

// --- Sélection ------------------------------------------------------------------

/** Mots qui identifient le véhicule dans un titre (« F-16 », « Falcon », « Leopard »…). */
export function keyTokens(label) {
  return normalizeName(label).split(/[\s/(),]+/).map((t) => t.replace(/[^a-z0-9-]/g, ""))
    .filter((t) => t && !GENERIC.has(t) && (t.length >= 3 || /\d/.test(t)) && !/^\d+$/.test(t));
}

/** Le titre cite-t-il le véhicule ? Comparaison sans accents, tirets ni espaces (« F16 » = « F-16 »). */
export function mentions(title, tokens) {
  const squash = (s) => normalizeName(s).replace(/[\s-]+/g, "");
  const haystack = squash(title);
  return tokens.some((t) => haystack.includes(squash(t)));
}

/** Vidéo YouTube acceptable : durée raisonnable, véhicule cité, pas un jeu ni une maquette. */
export function isRealVideo(video, tokens) {
  return video.duration >= 20 && video.duration <= 1800 && !NOT_REAL.test(video.title) && mentions(video.title, tokens);
}

/** Photo exploitable : bitmap assez grand, au format accepté, qui n'est ni carte, ni drapeau, ni logo. */
export function toImage(file) {
  if (file.mediatype !== "BITMAP" || !file.thumburl || file.width < 400 || file.height < 250 || NOT_A_PHOTO.test(file.title)) return null;
  const ext = file.thumburl.split("?")[0].split(".").pop().toLowerCase();
  return IMAGE_MIME[ext] ? { ...file, kind: "image", originalName: file.title.replace(/^(File|Fichier):/, ""), src: file.thumburl, mime: IMAGE_MIME[ext], ext } : null;
}

function toCommonsVideo(file, withFfmpeg) {
  if (file.mediatype !== "VIDEO" || NOT_A_PHOTO.test(file.title)) return null;
  // Sans ffmpeg, seul le WebM est accepté tel quel par l'application.
  if (!withFfmpeg && (file.mime !== "video/webm" || file.size > SIZE_LIMITS.video)) return null;
  return { ...file, kind: "video", originalName: file.title.replace(/^File:/, ""), src: file.url, mime: withFfmpeg ? "video/mp4" : "video/webm", ext: withFfmpeg ? "mp4" : "webm" };
}

/** Candidats photos d'une fiche, du plus au moins pertinent, sans doublon. */
async function imageCandidates(vehicle, info) {
  const lists = [];
  for (const [lang, title] of info.articles) lists.push(await cached(`article:${lang}:${title}`, () => articleFiles(lang, title)));
  if (info.commonsCategory) {
    const category = info.commonsCategory.replace(/"/g, "");
    lists.push(await cached(`incategory:${category}:bitmap`, () => commonsSearch(`incategory:"${category}" filetype:bitmap`, 40)));
  }
  lists.push(await cached(`P180:${vehicle.wikidataId}:bitmap`, () => commonsSearch(`haswbstatement:P180=${vehicle.wikidataId} filetype:bitmap`, 20)));
  return unique(lists.flat().filter(Boolean).map(toImage).filter(Boolean));
}

async function videoCandidates(vehicle, info, withFfmpeg) {
  const lists = [];
  if (info.commonsCategory) {
    const category = info.commonsCategory.replace(/"/g, "");
    lists.push(await cached(`incategory:${category}:video`, () => commonsSearch(`incategory:"${category}" filetype:video`, 15)));
  }
  lists.push(await cached(`P180:${vehicle.wikidataId}:video`, () => commonsSearch(`haswbstatement:P180=${vehicle.wikidataId} filetype:video`, 10)));
  const commons = lists.flat().filter(Boolean).map((f) => toCommonsVideo(f, withFfmpeg)).filter(Boolean);
  if (!withFfmpeg) return unique(commons);

  const tokens = keyTokens(info.label ?? vehicle.name);
  const query = `${info.label ?? vehicle.name} ${YOUTUBE_KEYWORD[vehicle.category] ?? ""}`.trim();
  const found = (await cached(`youtube:${query}`, () => youtubeSearch(query, 20))) ?? [];
  const youtube = found.filter((v) => isRealVideo(v, tokens)).map((v) => ({
    title: v.title, kind: "video", originalName: `youtube-${v.id}.mp4`, src: `https://www.youtube.com/watch?v=${v.id}`, youtubeId: v.id,
    mime: "video/mp4", ext: "mp4", source: "YouTube", artist: v.channel || "chaîne inconnue", license: "tous droits réservés", pageUrl: `https://www.youtube.com/watch?v=${v.id}`,
  }));
  // Une vidéo Commons d'abord, puis YouTube : plus de variété que Commons seul.
  return unique([...commons.slice(0, 1), ...youtube, ...commons.slice(1)]);
}

function unique(items) {
  const seen = new Set();
  const wrong = new Set(WRONG_MEDIA);
  return items.filter((i) => !wrong.has(i.originalName) && !seen.has(i.originalName) && seen.add(i.originalName));
}

// --- Téléchargements ------------------------------------------------------------

async function downloadImage(item) {
  let response;
  // upload.wikimedia.org limite les téléchargements (429) : on attend et on réessaie.
  for (let attempt = 1; attempt <= 5; attempt++) {
    response = await fetch(item.src, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(120000) });
    if (response.status !== 429) break;
    const wait = (Number(response.headers.get("retry-after")) || 30 * attempt) * 1000;
    log(`Wikimedia limite les téléchargements, nouvel essai dans ${wait / 1000} s`);
    await sleep(wait);
  }
  if (!response.ok) throw new Error(`téléchargement ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > SIZE_LIMITS.image) throw new Error("fichier trop volumineux");
  const storedName = `${crypto.randomUUID()}.${item.ext}`;
  await fs.writeFile(path.join(UPLOADS, storedName), buffer);
  return { storedName, size: buffer.length };
}

/** Vidéo Commons (sans ffmpeg : WebM d'origine) ou YouTube, ramenée à un MP4 480p de 90 s au plus. */
async function downloadVideo(item, withFfmpeg) {
  if (!withFfmpeg) return downloadImage({ ...item, ext: "webm" });
  const storedName = `${crypto.randomUUID()}.mp4`;
  const out = path.join(UPLOADS, storedName);
  const tmpDir = path.join(os.tmpdir(), `afterburner-${crypto.randomUUID()}`);
  await fs.mkdir(tmpDir, { recursive: true });
  try {
    let input = item.src;
    if (item.youtubeId) {
      await run(YTDLP, ["--js-runtimes", "node", "--no-warnings", "--no-playlist", "--ffmpeg-location", path.dirname(FFMPEG) === "." ? FFMPEG : path.dirname(FFMPEG),
        "-f", "bv*[height<=480][ext=mp4]+ba[ext=m4a]/b[height<=480][ext=mp4]/b[height<=720]", "--download-sections", `*0-${CLIP_SECONDS}`,
        "-o", path.join(tmpDir, "video.%(ext)s"), item.src]);
      input = path.join(tmpDir, (await fs.readdir(tmpDir))[0]);
    }
    // -user_agent : Commons refuse les clients sans User-Agent.
    const httpArgs = item.youtubeId ? [] : ["-user_agent", UA];
    await run(FFMPEG, ["-y", "-v", "error", ...httpArgs, "-i", input, "-t", String(CLIP_SECONDS), "-vf", "scale=-2:'min(480,ih)'",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", out]);
    const { size } = await fs.stat(out);
    if (size > SIZE_LIMITS.video) throw new Error("fichier trop volumineux");
    return { storedName, size };
  } catch (error) {
    await fs.rm(out, { force: true });
    throw error;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

function realisticDate(now) {
  const date = new Date(now - Math.floor(180 * rand() ** 1.8) * DAY);
  date.setHours(between(8, 21), between(0, 59), between(0, 59), 0);
  return date > now ? new Date(now - between(5, 120) * 60_000) : date;
}

const cleanTitle = (name) => name.replace(/\.[a-z0-9]+$/i, "").replace(/_+/g, " ").trim().slice(0, 110);

/** Enregistre le média et son post public (auteur, licence et lien cités). */
async function publish(item, file, vehicle, users, now) {
  const owner = pick(users);
  const createdAt = realisticDate(now);
  const mediaId = new mongoose.Types.ObjectId();
  const title = cleanTitle(item.youtubeId ? item.title : item.originalName) || vehicle.name;
  await Media.collection.insertOne({
    _id: mediaId, ownerId: owner, kind: item.kind, title, originalName: item.originalName, storedName: file.storedName,
    mimeType: item.mime, size: file.size, visibility: "public", sharedWith: [], vehicleId: vehicle._id, createdAt, updatedAt: createdAt,
  });
  const postId = new mongoose.Types.ObjectId();
  const commentCount = between(0, 4);
  const comments = Array.from({ length: commentCount }, () => {
    const at = new Date(Math.min(now, createdAt.getTime() + between(5, 3 * 24 * 60) * 60_000));
    return { postId, ownerId: pick(users), text: pick(COMMENTS), createdAt: at, updatedAt: at };
  });
  const credit = `Source : ${item.source} — ${item.artist} (${item.license}) ${item.pageUrl ?? ""}`.trim();
  await Post.collection.insertOne({
    _id: postId, ownerId: owner, text: `${pick(INTROS[item.kind]).replace("{v}", vehicle.name)}\n${credit}`,
    mediaId, vehicleId: vehicle._id, visibility: "public", sharedWith: [],
    likes: sample(users, between(0, 15)), commentCount, createdAt, updatedAt: createdAt,
  });
  if (comments.length) await Comment.collection.insertMany(comments);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI manque dans backend/.env");
  try {
    cache = JSON.parse(await fs.readFile(CACHE_FILE, "utf8"));
  } catch {
    cache = {};
  }
  await mongoose.connect(process.env.MONGODB_URI);
  const users = (await User.find({ email: new RegExp(`@${DOMAIN.replace(".", "\\.")}$`) }).select("_id").lean()).map((u) => u._id);
  if (!users.length) throw new Error("Aucun compte de démonstration : lancez d'abord npm run seed");
  const withFfmpeg = await available(FFMPEG, ["-version"]);
  const withYtdlp = withFfmpeg && (await available(YTDLP, ["--version"]));
  log(`ffmpeg : ${withFfmpeg ? FFMPEG : "absent (vidéos WebM de Commons seulement)"} ; yt-dlp : ${withYtdlp ? YTDLP : "absent (pas de YouTube)"}`);
  const now = Date.now();

  const filter = options.only ? { name: options.only } : {};
  const vehicles = await Vehicle.find(filter).select("name category wikidataId").sort({ name: 1 }).lean();
  const infos = await wikidataInfo(vehicles.map((v) => v.wikidataId));
  const existing = new Set(await Media.distinct("originalName", { vehicleId: { $ne: null } }));
  const totals = { image: 0, video: 0 };

  for (const [i, vehicle] of vehicles.entries()) {
    const info = infos[vehicle.wikidataId] ?? { label: vehicle.name, commonsCategory: null, articles: [] };
    const counts = Object.fromEntries((await Media.aggregate([{ $match: { vehicleId: vehicle._id } }, { $group: { _id: "$kind", n: { $sum: 1 } } }])).map((c) => [c._id, c.n]));
    const missing = { image: Math.max(0, options.images - (counts.image ?? 0)), video: Math.max(0, options.videos - (counts.video ?? 0)) };
    log(`(${i + 1}/${vehicles.length}) ${vehicle.name} : ${counts.image ?? 0} photo(s), ${counts.video ?? 0} vidéo(s)`);
    if (!missing.image && !missing.video) continue;

    const candidates = {
      image: missing.image ? (await imageCandidates(vehicle, info)).filter((c) => !existing.has(c.originalName)) : [],
      video: missing.video ? (await videoCandidates(vehicle, info, withYtdlp)).filter((c) => !existing.has(c.originalName)) : [],
    };
    for (const kind of ["image", "video"]) {
      let added = 0;
      for (const item of candidates[kind]) {
        if (added >= missing[kind]) break;
        if (options.dryRun) {
          log(`  [${kind}] ${item.source} : ${item.youtubeId ? item.title : item.originalName}`);
          added++;
          continue;
        }
        try {
          const file = kind === "image" ? await downloadImage(item) : await downloadVideo(item, withFfmpeg);
          await publish(item, file, vehicle, users, now);
          existing.add(item.originalName);
          added++;
          log(`  + ${kind === "image" ? "photo" : "vidéo"} (${item.source}) : ${item.youtubeId ? item.title : item.originalName}`);
        } catch (error) {
          log(`  ignoré (${item.originalName}) : ${error.message}`);
        }
        await sleep(kind === "image" ? 1000 : 2000);
      }
      totals[kind] += added;
      if (added < missing[kind]) log(`  ${kind === "image" ? "photos" : "vidéos"} : ${added}/${missing[kind]} trouvée(s)`);
    }
  }
  log(`${options.dryRun ? "[simulation] " : ""}${totals.image} photo(s) et ${totals.video} vidéo(s) ajoutée(s)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  try {
    await main();
  } catch (error) {
    console.error("[more-media] Échec", error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}
