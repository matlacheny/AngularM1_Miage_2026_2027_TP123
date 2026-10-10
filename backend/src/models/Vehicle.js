import mongoose from "mongoose";
import aggregatePaginate from "mongoose-aggregate-paginate-v2";
import { CATEGORIES } from "../wikipedia.js";

/*
 * Fiche véhicule, créée par un utilisateur puis enrichie et validée via
 * Wikipédia/Wikidata. Une seule fiche par élément Wikidata (wikidataId unique).
 */
const schema = new mongoose.Schema(
  {
    wikidataId: { type: String, required: true, unique: true, match: /^Q\d+$/ },
    name: { type: String, required: true, trim: true },
    category: { type: String, required: true, enum: CATEGORIES },
    countries: [{ type: String }],
    summary: { type: String, default: "" },
    imageUrl: { type: String, default: null },
    wikipediaUrl: { type: String, required: true },
    // Noms normalisés déjà saisis pour cette fiche ("rafale", "dassault rafale") :
    // une nouvelle saisie identique est servie sans rappeler Wikipédia.
    aliases: { type: [String], index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

schema.index({ category: 1, name: 1 });
schema.plugin(aggregatePaginate);

schema.methods.toPublic = function () {
  return {
    id: this.id,
    wikidataId: this.wikidataId,
    name: this.name,
    category: this.category,
    countries: this.countries ?? [],
    summary: this.summary,
    imageUrl: this.imageUrl,
    wikipediaUrl: this.wikipediaUrl,
    createdAt: this.createdAt,
  };
};

export const Vehicle = mongoose.model("Vehicle", schema);
