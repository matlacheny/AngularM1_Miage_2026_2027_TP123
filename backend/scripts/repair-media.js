import mongoose from "mongoose";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { User } from "../src/models/User.js";
import { Vehicle } from "../src/models/Vehicle.js";
import { Media, SIZE_LIMITS } from "../src/models/Media.js";
import { Post } from "../src/models/Post.js";
import { Comment } from "../src/models/Comment.js";
import { UPLOADS } from "../src/uploads.js";
import { normalizeName, wikipedia } from "../src/wikipedia.js";
import { FREESOUND_SOUNDS, IMAGES, NEW_VEHICLES, RETAGGED_MEDIA, SOUNDS, VIDEO_SOUNDS, WRONG_MEDIA } from "./curated-media.js";
import { freesoundFiles } from "./freesound.js";
import { extractAudio, ffmpegAvailable } from "./video-audio.js";

/*
 * Corrige les données de démonstration sans tout régénérer :
 *  1. supprime les médias importés par erreur (WRONG_MEDIA), leurs posts,
 *     commentaires et fichiers ;
 *  2. crée les fiches manquantes (NEW_VEHICLES) et rattache les médias mal classés ;
 *  3. ajoute les photos et les sons vérifiés (IMAGES, SOUNDS, FREESOUND_SOUNDS, et la bande son
 *     des vidéos VIDEO_SOUNDS si ffmpeg est disponible), publiés en posts
 *     par les comptes de démonstration, avec l'auteur et la licence cités.
 *
 * Usage : cd backend && npm run repair-media
 * Relançable : un média déjà présent (même nom d'origine) n'est pas réimporté.
 */

const DOMAIN = "afterburner.seed";
const UA = process.env.WIKI_USER_AGENT || "Afterburner/1.0 (projet etudiant MIAGE)";
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const DAY = 24 * 60 * 60 * 1000;
const AUDIO_MIME = { "application/ogg": "audio/ogg", "audio/ogg": "audio/ogg", "audio/wav": "audio/wav", "audio/x-wav": "audio/wav", "audio/mpeg": "audio/mpeg" };
const IMAGE_MIME = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
const INTROS = {
  image: ["Superbe photo de {v} trouvée sur Commons.", "{v} sous son meilleur angle.", "Un cliché de {v} à partager avec l'escadrille."],
  audio: ["Montez le son : {v}.", "Enregistrement : {v}.", "Le bruit qu'on adore : {v}."],
};
const COMMENTS = ["Superbe !", "Le son est incroyable", "Quelle machine…", "Merci du partage", "Rien de tel en vrai", "Une légende"];

let state = 20261014;
const rand = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 0x100000000);
const pick = (list) => list[Math.floor(rand() * list.length)];
const sample = (list, n) => [...list].sort(() => rand() - 0.5).slice(0, n);
const between = (min, max) => min + Math.floor(rand() * (max - min + 1));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...args) => console.log("[repair]", ...args);

/** Informations Commons (URL, licence, auteur) des fichiers demandés, par titre. */
async function commonsInfo(titles) {
  const result = new Map();
  for (let i = 0; i < titles.length; i += 40) {
    const params = new URLSearchParams({
      action: "query", format: "json", formatversion: "2", titles: titles.slice(i, i + 40).join("|"), prop: "imageinfo",
      iiprop: "url|size|mime|mediatype|extmetadata", iiextmetadatafilter: "Artist|LicenseShortName", iiurlwidth: "1280",
    });
    for (let attempt = 1; ; attempt++) {
      const response = await fetch(`${COMMONS_API}?${params}`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30000) });
      const text = await response.text();
      if (response.ok && text.startsWith("{")) {
        const data = JSON.parse(text);
        // Commons normalise les titres (espaces, majuscules) : on revient au titre demandé.
        const original = new Map((data.query?.normalized ?? []).map((n) => [n.to, n.from]));
        for (const page of data.query?.pages ?? []) {
          const info = page.imageinfo?.[0];
          if (!info) continue;
          result.set(original.get(page.title) ?? page.title, {
            ...info,
            artist: (info.extmetadata?.Artist?.value ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 80) || "auteur inconnu",
            license: info.extmetadata?.LicenseShortName?.value ?? "licence libre",
          });
        }
        break;
      }
      if (attempt === 4) throw new Error(`Commons indisponible (${response.status})`);
      await sleep(10000 * attempt);
    }
  }
  return result;
}

async function download(url, kind, ext) {
  let response;
  // upload.wikimedia.org limite les téléchargements d'originaux (429) : on attend et on réessaie.
  for (let attempt = 1; attempt <= 5; attempt++) {
    response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(180000) });
    if (response.status !== 429) break;
    const wait = (Number(response.headers.get("retry-after")) || 30 * attempt) * 1000;
    log(`Commons limite les téléchargements, nouvel essai dans ${wait / 1000} s`);
    await sleep(wait);
  }
  if (!response.ok) throw new Error(`téléchargement ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > SIZE_LIMITS[kind]) throw new Error("fichier trop volumineux");
  const storedName = `${crypto.randomUUID()}.${ext}`;
  await fs.writeFile(path.join(UPLOADS, storedName), buffer);
  return { storedName, size: buffer.length };
}

function realisticDate(now) {
  const date = new Date(now - Math.floor(180 * rand() ** 1.8) * DAY);
  date.setHours(between(8, 21), between(0, 59), between(0, 59), 0);
  return date > now ? new Date(now - between(5, 120) * 60_000) : date;
}

async function removeWrongMedia() {
  const media = await Media.find({ originalName: { $in: WRONG_MEDIA } }).select("+storedName");
  const posts = await Post.find({ mediaId: { $in: media.map((m) => m._id) } }).select("_id");
  await Comment.deleteMany({ postId: { $in: posts.map((p) => p._id) } });
  await Post.deleteMany({ _id: { $in: posts.map((p) => p._id) } });
  await Media.deleteMany({ _id: { $in: media.map((m) => m._id) } });
  for (const m of media) await fs.rm(path.join(UPLOADS, m.storedName), { force: true });
  log(`${media.length} média(s) erroné(s) et ${posts.length} post(s) supprimés`);
}

async function ensureVehicles(creatorId, now) {
  for (const { query, name } of NEW_VEHICLES) {
    if (await Vehicle.exists({ name })) continue;
    const resolved = await wikipedia.resolveVehicle(query);
    if (!resolved || resolved.name !== name) {
      log(`Fiche « ${name} » non créée : la recherche « ${query} » donne ${resolved ? `« ${resolved.name} »` : "aucun véhicule"}`);
      continue;
    }
    if (await Vehicle.exists({ wikidataId: resolved.wikidataId })) continue;
    const createdAt = new Date(now - between(190, 400) * DAY);
    await Vehicle.collection.insertOne({
      wikidataId: resolved.wikidataId, name: resolved.name, category: resolved.category,
      countries: resolved.countries, origins: resolved.origins ?? [], summary: resolved.summary,
      imageUrl: resolved.imageUrl ? resolved.imageUrl.replace(/\/\d+px-/, "/1280px-") : null,
      wikipediaUrl: resolved.wikipediaUrl,
      aliases: [...new Set([normalizeName(query), normalizeName(resolved.name), "seed:afterburner"])],
      createdBy: creatorId, createdAt, updatedAt: createdAt,
    });
    log(`Fiche créée : ${resolved.name} (${resolved.wikidataId}, ${resolved.category})`);
  }
}

async function retag() {
  for (const { file, vehicle: name } of RETAGGED_MEDIA) {
    const vehicle = await Vehicle.findOne({ name });
    const media = await Media.findOne({ originalName: file });
    if (!vehicle || !media || String(media.vehicleId) === String(vehicle._id)) continue;
    const previous = await Vehicle.findById(media.vehicleId).select("name");
    media.vehicleId = vehicle._id;
    await media.save();
    for (const post of await Post.find({ mediaId: media._id })) {
      post.vehicleId = vehicle._id;
      if (previous?.name) post.text = post.text.replace(previous.name, vehicle.name);
      await post.save();
    }
    log(`« ${file} » rattaché à ${vehicle.name}`);
  }
}

/** Photos et sons Commons vérifiés, au format commun { originalName, src, mime, ext, artist, license, pageUrl… }. */
async function commonsDownloads(items) {
  const infos = await commonsInfo(items.map((i) => i.file));
  return items.flatMap((item) => {
    const info = infos.get(item.file);
    if (!info) return log(`Ignoré (fichier Commons introuvable) : ${item.file}`), [];
    const credit = { source: "Wikimedia Commons", artist: info.artist, license: info.license, pageUrl: info.descriptionurl };
    // Bande son d'une vidéo : extraite plus tard par ffmpeg, toujours en OGG.
    if (item.fromVideo) return [{ ...item, ...credit, originalName: videoSoundName(item.file), src: info.url, mime: "audio/ogg", ext: "ogg" }];
    const url = item.kind === "image" ? info.thumburl : info.url;
    const ext = url.split("?")[0].split(".").pop().toLowerCase();
    const mime = item.kind === "image" ? IMAGE_MIME[ext] : AUDIO_MIME[info.mime];
    if (!mime) return log(`Format refusé (${info.mime}) : ${item.file}`), [];
    return [{ ...item, ...credit, originalName: item.file.replace(/^File:/, ""), src: url, mime, ext }];
  });
}

/** « File:Eurofighter 9803.ogv » → « Eurofighter 9803 (son).ogg » : nom d'origine du son extrait. */
const videoSoundName = (file) => `${file.replace(/^File:/, "").replace(/\.[a-z0-9]+$/i, "")} (son).ogg`;
const originalNameOf = (item) => (item.fromVideo ? videoSoundName(item.file) : item.file.replace(/^File:/, ""));

async function addCurated(users, now) {
  const withFfmpeg = await ffmpegAvailable();
  if (!withFfmpeg) log("ffmpeg introuvable (FFMPEG_PATH) : bandes son des vidéos ignorées");
  const commons = [
    ...IMAGES.map((i) => ({ ...i, kind: "image" })),
    ...SOUNDS.map((s) => ({ ...s, kind: "audio" })),
    ...(withFfmpeg ? VIDEO_SOUNDS.map((s) => ({ ...s, kind: "audio", fromVideo: true })) : []),
  ];
  const names = [...commons.map(originalNameOf), ...FREESOUND_SOUNDS.map((s) => `freesound-${s.id}.ogg`)];
  const existing = new Set(await Media.distinct("originalName", { originalName: { $in: names } }));
  const todo = [
    ...(await commonsDownloads(commons.filter((i) => !existing.has(originalNameOf(i))))),
    ...(await freesoundFiles(FREESOUND_SOUNDS.filter((s) => !existing.has(`freesound-${s.id}.ogg`)))).map((f) => ({ ...f, source: "Freesound" })),
  ];
  if (!todo.length) return log("Photos et sons déjà présents");

  let added = 0;
  for (const item of todo) {
    const vehicle = await Vehicle.findOne({ name: item.vehicle }).select("name");
    if (!vehicle) {
      log(`Ignoré (fiche « ${item.vehicle} » absente) : ${item.originalName}`);
      continue;
    }
    let file;
    try {
      file = item.fromVideo
        ? await extractAudio(item.src, UPLOADS, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(300000) })
        : await download(item.src, item.kind, item.ext);
    } catch (error) {
      log(`Téléchargement ignoré (${item.originalName}) : ${error.message}`);
      continue;
    }

    const owner = pick(users);
    const createdAt = realisticDate(now);
    const title = item.title ?? item.originalName.replace(/\.[a-z0-9]+$/i, "").replace(/_+/g, " ").slice(0, 110);
    const mediaId = new mongoose.Types.ObjectId();
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
      _id: postId, ownerId: owner, title, text: `${pick(INTROS[item.kind]).replace("{v}", vehicle.name)}\n${credit}`,
      mediaId, vehicleId: vehicle._id, visibility: "public", sharedWith: [],
      likes: sample(users, between(0, 15)), commentCount, createdAt, updatedAt: createdAt,
    });
    if (comments.length) await Comment.collection.insertMany(comments);
    added++;
    log(`${item.kind === "audio" ? "Son" : "Photo"} ajouté(e) : ${title} → ${vehicle.name}`);
    await sleep(item.kind === "audio" && item.source !== "Freesound" ? 5000 : 1000); // ménage le serveur de fichiers de Commons
  }
  log(`${added} média(s) ajouté(s)`);
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI manque dans backend/.env");
  await mongoose.connect(process.env.MONGODB_URI);
  const users = (await User.find({ email: new RegExp(`@${DOMAIN.replace(".", "\\.")}$`) }).select("_id").lean()).map((u) => u._id);
  if (!users.length) throw new Error("Aucun compte de démonstration : lancez d'abord npm run seed");
  const now = Date.now();

  await removeWrongMedia();
  await ensureVehicles(users[0], now);
  await retag();
  await addCurated(users, now);
}

try {
  await main();
} catch (error) {
  console.error("[repair] Échec", error);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
