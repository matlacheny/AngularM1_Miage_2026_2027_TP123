import mongoose from "mongoose";
import { Media } from "../src/models/Media.js";
import { Post, postTitle } from "../src/models/Post.js";

/*
 * Donne un intitulé aux posts publiés avant l'ajout du champ `title` :
 * le titre de leur média, sinon la première ligne de leur texte (postTitle).
 * Les posts qui ont déjà un intitulé ne sont pas modifiés : relançable.
 *
 * Usage : cd backend && npm run backfill:post-titles [-- --dry-run]
 */

async function main() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI manque dans backend/.env");
  const dryRun = process.argv.includes("--dry-run");
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("[backfill] Connecté à MongoDB");

  const posts = await Post.find({ $or: [{ title: { $exists: false } }, { title: "" }] }, { text: 1, mediaId: 1 }).lean();
  const media = await Media.find({ _id: { $in: posts.map((p) => p.mediaId).filter(Boolean) } }, { title: 1 }).lean();
  const mediaTitles = new Map(media.map((m) => [String(m._id), m.title]));
  console.log(`[backfill] ${posts.length} post(s) sans intitulé`);

  const updates = [];
  for (const post of posts) {
    const title = postTitle("", mediaTitles.get(String(post.mediaId)), post.text);
    if (!title) {
      console.warn(`[backfill] Aucun intitulé possible pour le post ${post._id}`);
      continue;
    }
    // updateOne sans toucher à updatedAt : la date affichée du post ne change pas.
    updates.push({ updateOne: { filter: { _id: post._id }, update: { $set: { title } }, timestamps: false } });
  }

  if (dryRun) {
    for (const u of updates.slice(0, 10)) console.log(`[backfill] ${u.updateOne.filter._id} -> ${u.updateOne.update.$set.title}`);
    console.log(`[backfill] --dry-run : ${updates.length} post(s) seraient modifiés`);
    return;
  }
  if (updates.length) await Post.bulkWrite(updates);
  console.log(`[backfill] ${updates.length} post(s) mis à jour`);
}

try {
  await main();
} catch (error) {
  console.error("[backfill] Échec", error);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
