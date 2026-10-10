import mongoose from "mongoose";
import { Vehicle } from "../src/models/Vehicle.js";
import { wikipedia } from "../src/wikipedia.js";

/*
 * Complète les fiches créées avant l'ajout des drapeaux : pour chaque fiche
 * sans `origins`, interroge Wikidata (une requête SPARQL par lot de 20) et
 * enregistre pays, codes ISO et drapeaux.
 *
 * Usage : cd backend && npm run backfill:origins
 */

const BATCH = 20;

async function main() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI manque dans backend/.env");
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("[backfill] Connecté à MongoDB");

  const vehicles = await Vehicle.find({ $or: [{ origins: { $exists: false } }, { origins: { $size: 0 } }] });
  console.log(`[backfill] ${vehicles.length} fiche(s) sans drapeau`);

  for (let i = 0; i < vehicles.length; i += BATCH) {
    const batch = vehicles.slice(i, i + BATCH);
    const classes = await wikipedia.classifyVehicles(batch.map((v) => v.wikidataId));

    for (const vehicle of batch) {
      const entry = classes.get(vehicle.wikidataId);
      if (!entry?.origins.length) {
        console.warn(`[backfill] Aucun pays d'origine pour ${vehicle.name} (${vehicle.wikidataId})`);
        continue;
      }
      vehicle.origins = entry.origins;
      vehicle.countries = entry.origins.map((o) => o.name);
      await vehicle.save();
      console.log(`[backfill] ${vehicle.name} : ${entry.origins.map((o) => o.name).join(", ")}`);
    }
  }
}

try {
  await main();
} catch (error) {
  console.error("[backfill] Échec", error);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
