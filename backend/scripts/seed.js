import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { User } from "../src/models/User.js";
import { Vehicle } from "../src/models/Vehicle.js";
import { Media, SIZE_LIMITS } from "../src/models/Media.js";
import { Post } from "../src/models/Post.js";
import { Comment } from "../src/models/Comment.js";
import { Friendship, pairKey } from "../src/models/Friendship.js";
import { UPLOADS } from "../src/uploads.js";
import { WikiUnavailableError, normalizeName, wikipedia } from "../src/wikipedia.js";

/*
 * Données de démonstration RÉELLES :
 *  - ~100 fiches véhicules résolues via Wikipédia/Wikidata (résumé, photo, pays, drapeau),
 *    exactement comme une création depuis l'application ;
 *  - photos, vidéos et sons réels de Wikimedia Commons (licences libres), téléchargés
 *    dans data/uploads et publiés en posts avec auteur et licence cités ;
 *  - 20 comptes, escadrilles, J'aime et commentaires, dates réalistes sur 6 mois.
 *
 * Usage : cd backend && npm run seed      (mot de passe des comptes : Afterburner2026!)
 * Relançable : supprime d'abord ses propres données (comptes @afterburner.seed, leurs
 * médias et fichiers, fiches « seed »). Les réponses Wikimedia sont mises en cache dans
 * data/uploads/.seed-cache.json pour ne pas solliciter les API à chaque exécution.
 */

const DOMAIN = "afterburner.seed";
const PASSWORD = "Afterburner2026!";
const UA = process.env.WIKI_USER_AGENT || "Afterburner/1.0 (projet etudiant MIAGE)";
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const CACHE_FILE = path.join(UPLOADS, ".seed-cache.json");
const DAY = 24 * 60 * 60 * 1000;
const TARGET_POSTS = 200;
const MAX_VIDEOS = 30;
const MAX_AUDIO = 30;
const MAX_VIDEO_BYTES = 25 * 1024 * 1024;

// Pseudo-aléatoire déterministe.
let state = 20261010;
const rand = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 0x100000000);
const pick = (list) => list[Math.floor(rand() * list.length)];
const sample = (list, n) => [...list].sort(() => rand() - 0.5).slice(0, n);
const between = (min, max) => min + Math.floor(rand() * (max - min + 1));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...args) => console.log("[seed]", ...args);

// Requêtes de recherche Wikipédia (le résolveur garde le premier résultat qui est un véhicule).
const VEHICLES = [
  "Dassault Rafale", "Dassault Mirage 2000", "Dassault Mirage III", "Dassault Mirage F1", "Dassault Mirage IV",
  "Dassault Super Étendard", "Dassault Mystère IV", "Dassault Ouragan", "Alpha Jet", "Transall C-160",
  "Breguet Atlantic", "Dewoitine D.520", "Morane-Saulnier MS.406", "Fouga CM.170 Magister", "Airbus A400M Atlas",
  "Eurocopter EC665 Tigre", "NHIndustries NH90", "Aérospatiale Gazelle", "Aérospatiale Puma", "Eurocopter AS532 Cougar",
  "Aérospatiale Alouette III", "Eurocopter EC725 Caracal", "Aérospatiale Super Frelon", "Char Leclerc", "AMX-30",
  "AMX-13", "Char B1", "Renault FT", "AMX-10 RC", "AMX-10P", "Véhicule blindé de combat d'infanterie",
  "Véhicule de l'avant blindé", "Panhard EBR", "Panhard AML", "EBRC Jaguar", "VBMR Griffon",
  "General Dynamics F-16 Fighting Falcon", "McDonnell Douglas F-15 Eagle", "Grumman F-14 Tomcat", "McDonnell Douglas F/A-18 Hornet",
  "Lockheed Martin F-22 Raptor", "Lockheed Martin F-35 Lightning II", "McDonnell Douglas F-4 Phantom II", "Fairchild A-10 Thunderbolt II",
  "Boeing B-52 Stratofortress", "Northrop Grumman B-2 Spirit", "Lockheed SR-71 Blackbird", "North American P-51 Mustang",
  "North American F-86 Sabre", "Lockheed C-130 Hercules", "Lockheed F-117 Nighthawk", "Boeing AH-64 Apache",
  "Sikorsky UH-60 Black Hawk", "Boeing CH-47 Chinook", "Bell AH-1 Cobra", "Bell UH-1 Iroquois", "M1 Abrams",
  "M4 Sherman", "M60 Patton", "M26 Pershing", "M2 Bradley", "Stryker véhicule blindé", "M113 véhicule blindé",
  "Eurofighter Typhoon", "Supermarine Spitfire", "Hawker Hurricane", "Avro Lancaster", "Hawker Siddeley Harrier",
  "BAE Systems Hawk", "Avro Vulcan", "de Havilland DH.98 Mosquito", "Panavia Tornado", "Westland Lynx",
  "AgustaWestland AW101", "Challenger 2", "Centurion char", "Chieftain char", "Churchill char",
  "Messerschmitt Bf 109", "Focke-Wulf Fw 190", "Messerschmitt Me 262", "Junkers Ju 87", "Leopard 1", "Leopard 2",
  "Tigre char Tiger I", "Panther char", "Boxer véhicule blindé", "Marder véhicule de combat d'infanterie",
  "Mikoyan-Gourevitch MiG-21", "Mikoyan-Gourevitch MiG-29", "Soukhoï Su-27", "Soukhoï Su-57", "Mil Mi-24", "T-34", "T-72",
  "T-90", "BMP-1", "B1 Centauro", "Saab JAS 39 Gripen", "Merkava", "Mitsubishi A6M Zero", "Saab 35 Draken",
];

// Recherches de sons plus générales (les sons d'un véhicule précis sont rares sur Commons).
const AUDIO_QUERIES = ["Work With Sounds aircraft", "jet aircraft flyby", "military jet takeoff", "helicopter flyby",
  "tank engine", "propeller aircraft engine", "Saab Draken", "afterburner jet"];

const USERS = [
  ["Lucas Bernard", "Salon-de-Provence", "Photographe amateur, je suis les meetings aériens du sud de la France."],
  ["Sarah Nguyen", "Pau", "Passionnée d'hélicoptères, ALAT forever."],
  ["Hugo Petit", "Mourmelon", "Spécialiste blindés, maquettiste à mes heures."],
  ["Camille Martin", "Cognac", "Photographe aéro, toujours en bord de piste."],
  ["Thomas Leroy", "Saint-Auban", "Pilote planeur et fan de chasseurs."],
  ["Inès Moreau", "Orange", "Spotteuse à Orange-Caritat."],
  ["Nathan Roux", "Saumur", "Maquettiste, habitué du musée des Blindés."],
  ["Léa Fontaine", "Istres", "J'enregistre les postcombustions au décollage."],
  ["Maxime Girard", "Nancy", "Ancien mécano Mirage 2000."],
  ["Chloé Lambert", "Le Bourget", "Bénévole au musée de l'Air et de l'Espace."],
  ["Antoine Faure", "Brest", "Aéronavale, Super Étendard dans le cœur."],
  ["Manon Rousseau", "Toulouse", "Ingénieure, fan des avions de transport."],
  ["Julien Blanc", "Lyon", "Sons de moteurs en haute qualité."],
  ["Emma Guerin", "Dijon", "Je photographie les défilés du 14 Juillet."],
  ["Paul Mercier", "Metz", "Collectionneur d'histoire militaire."],
  ["Clara Dupuis", "Avord", "Spotteuse de transport et ravitailleurs."],
  ["Alexandre Lefèvre", "Mont-de-Marsan", "Fan de Rafale et de ses démonstrations."],
  ["Sophie André", "Valence", "Hélicos de combat et vidéos au ralenti."],
  ["Romain Chevalier", "Châlons", "Passionné de chars de la Seconde Guerre mondiale."],
  ["Laura Garnier", "Cazaux", "Photos de meetings et de tours de piste."],
];

const INTROS = {
  image: ["Superbe photo de {v} trouvée sur Commons.", "{v} sous son meilleur angle.", "Un cliché de {v} à partager avec l'escadrille.", "Archive : {v}."],
  video: ["Vidéo : {v} en action.", "À regarder avec le son : {v}.", "Images de {v}, impressionnant."],
  audio: ["Montez le son : {v}.", "Enregistrement : {v}.", "Le bruit qu'on adore : {v}."],
};
const COMMENTS = ["Superbe !", "Magnifique 👏", "Le son est incroyable", "J'y étais aussi !", "Quelle machine…", "Merci du partage",
  "On voit bien les détails", "Rien de tel en vrai", "Ça donne envie d'y aller", "Une légende"];

// --- Cache et appels réseau ---------------------------------------------------

let cache = {};
async function cached(key, compute) {
  if (key in cache) return cache[key];
  cache[key] = await compute();
  await fs.writeFile(CACHE_FILE, JSON.stringify(cache));
  return cache[key];
}

/** Appel avec attente et nouvelles tentatives si Wikimedia limite le débit. */
async function politely(fn, label) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const result = await fn();
      await sleep(1100);
      return result;
    } catch (error) {
      const wait = 15000 * attempt;
      log(`${label} : ${error.message} — nouvel essai dans ${wait / 1000} s`);
      await sleep(wait);
    }
  }
  log(`${label} : abandon`);
  return null;
}

async function commonsSearch(query, limit) {
  const params = new URLSearchParams({
    action: "query", format: "json", formatversion: "2", generator: "search", gsrnamespace: "6",
    gsrlimit: String(limit), gsrsearch: query, prop: "imageinfo",
    iiprop: "url|size|mime|mediatype|extmetadata", iiextmetadatafilter: "Artist|LicenseShortName", iiurlwidth: "1280",
  });
  const response = await fetch(`${COMMONS_API}?${params}`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Commons ${response.status}`);
  const data = await response.json();
  return (data.query?.pages ?? []).map((p) => {
    const info = p.imageinfo?.[0] ?? {};
    return {
      title: p.title,
      mediatype: info.mediatype,
      mime: info.mime,
      size: info.size,
      url: info.url,
      thumburl: info.thumburl,
      pageUrl: info.descriptionurl,
      artist: (info.extmetadata?.Artist?.value ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 80) || "auteur inconnu",
      license: info.extmetadata?.LicenseShortName?.value ?? "licence libre",
    };
  });
}

const AUDIO_MIME = { "application/ogg": "audio/ogg", "audio/ogg": "audio/ogg", "audio/wav": "audio/wav", "audio/x-wav": "audio/wav", "audio/mpeg": "audio/mpeg" };
const IMAGE_MIME = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** Transforme un résultat Commons en fichier téléchargeable accepté par l'application, ou null. */
function toDownload(file, kind) {
  if (kind === "image" && file.mediatype === "BITMAP" && file.thumburl) {
    const ext = file.thumburl.split("?")[0].split(".").pop().toLowerCase();
    return IMAGE_MIME[ext] ? { ...file, kind, src: file.thumburl, mime: IMAGE_MIME[ext], ext } : null;
  }
  if (kind === "video" && file.mediatype === "VIDEO" && file.mime === "video/webm" && file.size <= MAX_VIDEO_BYTES) {
    return { ...file, kind, src: file.url, mime: "video/webm", ext: "webm" };
  }
  if (kind === "audio" && file.mediatype === "AUDIO" && AUDIO_MIME[file.mime] && file.size <= 10 * 1024 * 1024 && !/^File:LL-/.test(file.title)) {
    const ext = file.url.split(".").pop().toLowerCase();
    return { ...file, kind, src: file.url, mime: AUDIO_MIME[file.mime], ext };
  }
  return null;
}

async function download(item) {
  const storedName = `${crypto.randomUUID()}.${item.ext}`;
  const response = await fetch(item.src, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`téléchargement ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > SIZE_LIMITS[item.kind]) throw new Error("fichier trop volumineux");
  await fs.writeFile(path.join(UPLOADS, storedName), buffer);
  return { storedName, size: buffer.length };
}

const cleanTitle = (title) => title.replace(/^File:/, "").replace(/\.[a-z0-9]+$/i, "").replace(/[_]+/g, " ").slice(0, 110);

function realisticDate(now) {
  const daysAgo = Math.floor(180 * rand() ** 1.8);
  const date = new Date(now - daysAgo * DAY);
  date.setHours(between(8, 21), between(0, 59), between(0, 59), 0);
  return date > now ? new Date(now - between(5, 120) * 60_000) : date;
}

// --- Étapes ---------------------------------------------------------------------

async function cleanup() {
  const ids = (await User.find({ email: new RegExp(`@${DOMAIN.replace(".", "\\.")}$`) }).select("_id").lean()).map((u) => u._id);
  const media = await Media.find({ ownerId: { $in: ids } }).select("+storedName").lean();
  for (const m of media) await fs.rm(path.join(UPLOADS, m.storedName), { force: true });
  const posts = await Post.find({ ownerId: { $in: ids } }).select("_id").lean();
  await Comment.deleteMany({ $or: [{ postId: { $in: posts.map((p) => p._id) } }, { ownerId: { $in: ids } }] });
  await Post.deleteMany({ ownerId: { $in: ids } });
  await Post.updateMany({}, { $pull: { likes: { $in: ids } } });
  await Media.deleteMany({ ownerId: { $in: ids } });
  await Friendship.deleteMany({ $or: [{ requesterId: { $in: ids } }, { recipientId: { $in: ids } }] });
  await Vehicle.deleteMany({ aliases: "seed:afterburner" });
  await User.deleteMany({ _id: { $in: ids } });
  log(`Données précédentes supprimées : ${ids.length} compte(s), ${posts.length} post(s), ${media.length} fichier(s)`);
}

/** Fiches réelles : même résolution Wikipédia/Wikidata que POST /api/vehicles. */
async function seedVehicles(now, creatorId) {
  const vehicles = [];
  const seen = new Set();
  for (const [i, query] of VEHICLES.entries()) {
    const resolved = await cached(`vehicle:${query}`, () =>
      politely(async () => {
        try {
          return (await wikipedia.resolveVehicle(query)) ?? false;
        } catch (error) {
          if (error instanceof WikiUnavailableError) throw error;
          return false;
        }
      }, `Wikipédia « ${query} »`),
    );
    if (!resolved || seen.has(resolved.wikidataId)) {
      log(`(${i + 1}/${VEHICLES.length}) « ${query} » ignoré`);
      continue;
    }
    seen.add(resolved.wikidataId);
    let vehicle = await Vehicle.findOne({ wikidataId: resolved.wikidataId });
    if (!vehicle) {
      const createdAt = new Date(now - between(190, 400) * DAY);
      const doc = {
        wikidataId: resolved.wikidataId, name: resolved.name, category: resolved.category,
        countries: resolved.countries, origins: resolved.origins ?? [], summary: resolved.summary,
        imageUrl: resolved.imageUrl ? resolved.imageUrl.replace(/\/\d+px-/, "/1280px-") : null,
        wikipediaUrl: resolved.wikipediaUrl,
        aliases: [...new Set([normalizeName(query), normalizeName(resolved.name), "seed:afterburner"])],
        createdBy: creatorId, createdAt, updatedAt: createdAt,
      };
      await Vehicle.collection.insertOne(doc);
      vehicle = doc;
    }
    vehicles.push({ _id: vehicle._id, name: vehicle.name ?? resolved.name, category: resolved.category });
    log(`(${i + 1}/${VEHICLES.length}) ${resolved.name} — ${resolved.category}, ${resolved.countries.join(", ") || "pays inconnu"}`);
  }
  return vehicles;
}

/** Médias Commons : photos et vidéos par véhicule, sons par recherches générales. */
async function collectMedia(vehicles) {
  const images = [];
  const videos = [];
  const audio = [];
  for (const v of vehicles) {
    const files = await cached(`commons:${v.name}`, () =>
      politely(async () => [
        ...(await commonsSearch(`${v.name} filetype:bitmap`, 4)),
        ...(await commonsSearch(`${v.name} filetype:video`, 2)),
      ], `Commons « ${v.name} »`),
    );
    for (const f of files ?? []) {
      const img = toDownload(f, "image");
      if (img) images.push({ ...img, vehicle: v });
      const vid = toDownload(f, "video");
      if (vid && videos.length < MAX_VIDEOS && !videos.some((x) => x.title === f.title)) videos.push({ ...vid, vehicle: v });
    }
  }
  for (const query of AUDIO_QUERIES) {
    const files = await cached(`audio:${query}`, () => politely(() => commonsSearch(`${query} filetype:audio`, 10), `Commons son « ${query} »`));
    for (const f of files ?? []) {
      const snd = toDownload(f, "audio");
      if (!snd || audio.length >= MAX_AUDIO || audio.some((x) => x.title === f.title)) continue;
      // Rattaché à une fiche seulement si le nom du fichier cite ce véhicule.
      const lower = f.title.toLowerCase();
      const vehicle = vehicles.find((x) => x.name.split(/\s+/).filter((w) => w.length > 3).some((w) => lower.includes(w.toLowerCase()))) ?? null;
      audio.push({ ...snd, vehicle });
    }
  }
  // Photos réparties entre les véhicules (tour par tour) pour compléter jusqu'à 200 posts.
  const byVehicle = new Map();
  for (const img of images) byVehicle.set(String(img.vehicle._id), [...(byVehicle.get(String(img.vehicle._id)) ?? []), img]);
  const spread = [];
  for (let round = 0; spread.length < images.length; round++) {
    let added = false;
    for (const list of byVehicle.values()) if (list[round]) (spread.push(list[round]), (added = true));
    if (!added) break;
  }
  const chosen = [...videos, ...audio, ...spread].slice(0, TARGET_POSTS);
  log(`Commons : ${videos.length} vidéo(s), ${audio.length} son(s), ${images.length} photo(s) trouvées ; ${chosen.length} retenues`);
  return chosen;
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI manque dans backend/.env");
  try {
    cache = JSON.parse(await fs.readFile(CACHE_FILE, "utf8"));
  } catch {
    cache = {};
  }
  await mongoose.connect(process.env.MONGODB_URI);
  log("Connecté à MongoDB");
  await cleanup();
  const now = Date.now();

  // Comptes
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const userDocs = USERS.map(([name, location, bio]) => {
    const createdAt = new Date(now - between(200, 600) * DAY);
    return { name, email: `${normalizeName(name).replace(/[^a-z]+/g, ".")}@${DOMAIN}`, passwordHash, location, bio, favoriteVehicleIds: [], createdAt, updatedAt: createdAt };
  });
  const users = Object.values((await User.collection.insertMany(userDocs)).insertedIds);
  log(`${users.length} comptes créés (mot de passe : ${PASSWORD})`);

  // Fiches réelles et favoris
  const vehicles = await seedVehicles(now, users[0]);
  for (const user of users) {
    await User.collection.updateOne({ _id: user }, { $set: { favoriteVehicleIds: sample(vehicles, between(1, 4)).map((v) => v._id) } });
  }

  // Escadrilles
  const links = new Map();
  const link = (a, b, status) => {
    const key = pairKey(a, b);
    if (String(a) === String(b) || links.has(key)) return;
    const createdAt = new Date(now - between(10, 190) * DAY);
    links.set(key, { requesterId: a, recipientId: b, status, pairKey: key, createdAt, updatedAt: createdAt });
  };
  for (const user of users) for (const other of sample(users, between(3, 6))) link(user, other, "accepted");
  for (let i = 0; i < 8; i++) link(pick(users), pick(users), "pending");
  const demo = await User.findOne({ email: "demo@example.com" }).select("_id").lean();
  if (demo) {
    for (const other of users.slice(0, 5)) link(demo._id, other, "accepted");
    link(users[7], demo._id, "pending");
  }
  await Friendship.collection.insertMany([...links.values()]);
  log(`${links.size} lien(s) d'escadrille`);

  // Médias réels et posts
  const items = await collectMedia(vehicles);
  const posts = [];
  const comments = [];
  let done = 0;
  for (const item of items) {
    let file;
    try {
      file = await download(item);
    } catch (error) {
      log(`Téléchargement ignoré (${item.title}) : ${error.message}`);
      continue;
    }
    await sleep(300);
    const owner = pick(users);
    const createdAt = realisticDate(now);
    const visibility = rand() < 0.8 ? "public" : rand() < 0.75 ? "friends" : "private";
    const mediaId = new mongoose.Types.ObjectId();
    const title = cleanTitle(item.title);
    await Media.collection.insertOne({
      _id: mediaId, ownerId: owner, kind: item.kind, title, originalName: item.title.replace(/^File:/, ""),
      storedName: file.storedName, mimeType: item.mime, size: file.size, visibility, sharedWith: [],
      vehicleId: item.vehicle?._id ?? null, createdAt, updatedAt: createdAt,
    });

    const subject = item.vehicle?.name ?? title;
    const credit = `Source : Wikimedia Commons — ${item.artist} (${item.license}) ${item.pageUrl ?? ""}`.trim();
    const postId = new mongoose.Types.ObjectId();
    const commentCount = visibility === "private" ? 0 : between(0, 5);
    for (let c = 0; c < commentCount; c++) {
      const at = new Date(Math.min(now, createdAt.getTime() + between(5, 3 * 24 * 60) * 60_000));
      comments.push({ postId, ownerId: pick(users), text: pick(COMMENTS), createdAt: at, updatedAt: at });
    }
    posts.push({
      _id: postId, ownerId: owner, text: `${pick(INTROS[item.kind]).replace("{v}", subject)}\n${credit}`,
      mediaId, vehicleId: item.vehicle?._id ?? null, visibility, sharedWith: [],
      likes: visibility === "private" ? [] : sample(users, between(0, 15)), commentCount, createdAt, updatedAt: createdAt,
    });
    if (++done % 20 === 0) log(`${done}/${items.length} médias téléchargés`);
  }
  if (posts.length) await Post.collection.insertMany(posts);
  if (comments.length) await Comment.collection.insertMany(comments);
  log(`${posts.length} posts (avec ${done} médias réels) et ${comments.length} commentaires créés`);
}

try {
  await main();
} catch (error) {
  console.error("[seed] Échec", error);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
