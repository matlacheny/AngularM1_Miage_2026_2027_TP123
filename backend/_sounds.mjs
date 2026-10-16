import mongoose from "mongoose";
import fs from "node:fs/promises";
import { keyTokens, mentions } from "./scripts/more-media.js";
import { licenseName } from "./scripts/freesound.js";
const KEY = process.env.FREESOUND_API_KEY;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
const vehicles = await db.collection("vehicles").aggregate([
  { $lookup: { from: "media", localField: "_id", foreignField: "vehicleId", as: "m" } },
  { $match: { "m.kind": { $ne: "audio" } } }, { $project: { name: 1, category: 1 } }, { $sort: { name: 1 } }]).toArray();
const out = {};
for (const v of vehicles) {
  const tokens = keyTokens(v.name);
  const variants = tokens.flatMap((t) => (t.includes("-") ? [`"${t.replace(/-/g, " ")}"`, t.replace(/-/g, "")] : [t]));
  const queries = [...new Set([tokens.join(" "), ...variants].filter(Boolean))].slice(0, 4);
  const seen = new Map();
  for (const q of queries) {
    const params = new URLSearchParams({ token: KEY, query: q, page_size: "30", filter: 'duration:[3 TO 400]',
      fields: "id,name,tags,description,username,license,duration,num_downloads,avg_rating" });
    const r = await fetch(`https://freesound.org/apiv2/search/text/?${params}`);
    const data = r.ok ? await r.json() : { results: [] };
    if (!r.ok) console.error(v.name, r.status);
    for (const s of data.results) if (licenseName(s.license) && !seen.has(s.id)) seen.set(s.id, s);
    await sleep(1100);
  }
  const hits = [...seen.values()].filter((s) => mentions(`${s.name} ${s.tags.join(" ")} ${s.description}`, tokens));
  out[v.name] = hits.map((s) => ({ id: s.id, name: s.name, user: s.username, lic: licenseName(s.license), dur: Math.round(s.duration), tags: s.tags.slice(0, 12).join(","), desc: s.description.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").slice(0, 260) }));
  console.log(`${v.name} : ${hits.length} candidat(s)`);
}
await fs.writeFile(process.argv[2], JSON.stringify(out, null, 1));
await mongoose.disconnect();
