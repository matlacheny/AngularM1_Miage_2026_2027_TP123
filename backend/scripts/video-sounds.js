import mongoose from "mongoose";
import path from "node:path";
import { Media } from "../src/models/Media.js";
import { Post } from "../src/models/Post.js";
import "../src/models/Vehicle.js"; // populate("vehicleId")
import { UPLOADS } from "../src/uploads.js";
import { audioFromFile, ffmpegAvailable } from "./video-audio.js";

/*
 * Donne un son aux fiches qui n'en ont pas : la bande son d'une de leurs vidéos
 * (base LOCALE de démonstration, comme more-media). Seules les vidéos de passage,
 * de démonstration ou de tir sont retenues : un documentaire n'offre qu'une voix
 * off et de la musique. La vidéo est lue sur le disque (data/uploads), sans
 * nouveau téléchargement ; une piste muette est refusée (video-audio.js).
 *
 * Usage : cd backend && npm run video-sounds [-- --dry-run]
 * Outil : FFMPEG_PATH, data/tools/ffmpeg.exe ou ffmpeg dans le PATH.
 * Relançable : une fiche qui a déjà un son est ignorée.
 */

// Le bruit de l'appareil domine : passage, démonstration, décollage, tir, moteur…
const SPOTTING = /fly ?by|fly ?past|low pass|\bpass(es|ing)?\b|display|\bdemo|take ?off|landing|air ?show|live.?fire|firing|start ?up|engine|afterburner|\bsound|roar|\bloud\b|in action|launch|aerobatic|aerial demonstration|test flight|crushes|off ?road|hover|slalom|\bloop\b|catapult|b-roll/i;
// Voix off, interviews, musique : pas le son du véhicule.
const NARRATED = /documentary|history|how (it|does|good|sweden|britain)|\bwhy\b|what is|inside|explained|engineering|the (best|most|rise|insane|world)|chats?\b|hatch|legacy|variant|story|origins|interview|reaction|review|told by|meet the|walkaround|\btour\b|development|maintenance|newsreel|announce|music/i;

// Films d'archive (années 1900-1940) : muets ou sonorisés après coup.
const ARCHIVE = /\b19[0-4]\d\b/;
// Écartées à la relecture : le bruit entendu n'est pas celui de la fiche.
const SKIPPED = new Set([
  "Rapid infiltration live-fire exercise with NATO Allies demonstrates HIMARS capabilities in Baltics (906251).webm", // A400M : tirs de roquettes HIMARS
]);

/** La bande son de cette vidéo est-elle le bruit du véhicule ? Titre de passage ou de démonstration, sans narration ni archive. */
export function isSpottingVideo(title) {
  return SPOTTING.test(title) && !NARRATED.test(title) && !ARCHIVE.test(title);
}

/** Ligne « Source : … » du post de la vidéo, reprise pour créditer la bande son. */
export function creditOf(text) {
  return String(text ?? "").split("\n").find((line) => line.startsWith("Source :")) ?? "";
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI manque dans backend/.env");
  if (!(await ffmpegAvailable())) throw new Error("ffmpeg introuvable (FFMPEG_PATH)");
  const dryRun = process.argv.includes("--dry-run");
  await mongoose.connect(process.env.MONGODB_URI);

  const withSound = new Set((await Media.distinct("vehicleId", { kind: "audio", vehicleId: { $ne: null } })).map(String));
  const videos = await Media.find({ kind: "video", vehicleId: { $ne: null } }).select("+storedName").populate("vehicleId", "name").sort({ createdAt: 1 }).lean();
  const byVehicle = new Map();
  for (const video of videos) {
    if (!video.vehicleId || withSound.has(String(video.vehicleId._id)) || SKIPPED.has(video.originalName) || !isSpottingVideo(video.title)) continue;
    if (!byVehicle.has(String(video.vehicleId._id))) byVehicle.set(String(video.vehicleId._id), []);
    byVehicle.get(String(video.vehicleId._id)).push(video);
  }
  console.log(`[video-sounds] ${byVehicle.size} fiche(s) sans son avec une vidéo de passage ou de démonstration`);

  let added = 0;
  for (const candidates of byVehicle.values()) {
    const vehicle = candidates[0].vehicleId;
    for (const video of candidates) {
      if (dryRun) {
        console.log(`[video-sounds] ${vehicle.name} ← ${video.title}`);
        break;
      }
      let file;
      try {
        file = await audioFromFile(path.join(UPLOADS, video.storedName), UPLOADS);
      } catch (error) {
        console.log(`[video-sounds] ${vehicle.name} : ${video.title} ignorée (${error.message})`);
        continue;
      }
      const source = await Post.findOne({ mediaId: video._id }).select("ownerId text visibility createdAt").lean();
      const createdAt = new Date(video.createdAt.getTime() + 60_000);
      const title = `Bande son : ${video.title}`.slice(0, 120);
      const mediaId = new mongoose.Types.ObjectId();
      await Media.collection.insertOne({
        _id: mediaId, ownerId: video.ownerId, kind: "audio", title, originalName: `bande-son-${video.originalName.replace(/\.[a-z0-9]+$/i, "")}.ogg`,
        storedName: file.storedName, mimeType: "audio/ogg", size: file.size, visibility: "public", sharedWith: [], vehicleId: vehicle._id, createdAt, updatedAt: createdAt,
      });
      await Post.collection.insertOne({
        _id: new mongoose.Types.ObjectId(), ownerId: video.ownerId, title, text: `Bande son de la vidéo « ${video.title} ».\n${creditOf(source?.text)}`.trim(),
        mediaId, vehicleId: vehicle._id, visibility: "public", sharedWith: [], likes: [], commentCount: 0, createdAt, updatedAt: createdAt,
      });
      added++;
      console.log(`[video-sounds] + ${vehicle.name} ← ${video.title}`);
      break;
    }
  }
  console.log(`[video-sounds] ${dryRun ? "[simulation] " : ""}${dryRun ? byVehicle.size : added} son(s) ${dryRun ? "prévu(s)" : "ajouté(s)"}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  try {
    await main();
  } catch (error) {
    console.error("[video-sounds] Échec", error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}
