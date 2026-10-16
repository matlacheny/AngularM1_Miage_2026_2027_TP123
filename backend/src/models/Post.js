import mongoose from "mongoose";
import aggregatePaginate from "mongoose-aggregate-paginate-v2";
import { VISIBILITIES } from "../access.js";

export const TITLE_MAX = 120;

/**
 * Intitulé d'un post : celui choisi, sinon le titre du média, sinon la
 * première ligne du texte. Sert à la publication et au backfill.
 */
export function postTitle(title, mediaTitle, text = "") {
  const firstLine = String(text).trim().split("\n")[0];
  return (String(title ?? "").trim() || String(mediaTitle ?? "").trim() || firstLine.trim()).slice(0, TITLE_MAX);
}

/*
 * Un post est ce que l'utilisateur publie dans le fil : un texte, et/ou un
 * média (son, photo, vidéo) de son hangar, éventuellement rattaché à une
 * fiche véhicule. Le champ s'appelle `ownerId` comme pour les médias, pour
 * réutiliser telles quelles les règles d'accès (canAccess / accessFilter).
 */
const schema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    // Intitulé, cherché par la recherche ; par défaut celui du média (voir postTitle).
    title: { type: String, trim: true, maxlength: TITLE_MAX, default: "" },
    text: { type: String, trim: true, maxlength: 2000, default: "" },
    mediaId: { type: mongoose.Schema.Types.ObjectId, ref: "Media", default: null },
    vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle", default: null, index: true },
    visibility: { type: String, enum: VISIBILITIES, default: "public" },
    sharedWith: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    // Utilisateurs qui aiment le post : $addToSet garantit un seul J'aime par personne.
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    // Compteur dénormalisé, incrémenté à chaque commentaire (évite un count par carte).
    commentCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

// Fil : posts visibles les plus récents.
schema.index({ visibility: 1, createdAt: -1 });
schema.index({ ownerId: 1, createdAt: -1 });
schema.plugin(aggregatePaginate);

/**
 * Pipeline commun du fil et d'un post seul : auteur (nom), média, véhicule,
 * nombre de J'aime et « est-ce que j'aime ». La liste des J'aime ne sort jamais.
 *
 * Tout filtre doit être dans `match` : aggregatePaginate (1.1.5) déplace
 * chaque $match avant les $lookup, donc un filtre sur un champ joint (ex.
 * "media.kind") ne trouverait plus rien.
 */
export function publicPostPipeline(match, viewerId) {
  const project = (fields) => [{ $project: { _id: 0, id: { $toString: "$_id" }, ...fields } }];
  return [
    { $match: match },
    { $sort: { createdAt: -1 } },
    { $lookup: { from: "users", localField: "ownerId", foreignField: "_id", as: "owner", pipeline: project({ name: 1 }) } },
    {
      $lookup: {
        from: "media",
        localField: "mediaId",
        foreignField: "_id",
        as: "media",
        pipeline: project({ kind: 1, title: 1, mimeType: 1 }),
      },
    },
    {
      $lookup: {
        from: "vehicles",
        localField: "vehicleId",
        foreignField: "_id",
        as: "vehicle",
        pipeline: project({ name: 1, category: 1 }),
      },
    },
    {
      $addFields: {
        id: { $toString: "$_id" },
        ownerId: { $toString: "$ownerId" },
        owner: { $ifNull: [{ $first: "$owner" }, null] },
        media: { $ifNull: [{ $first: "$media" }, null] },
        vehicle: { $ifNull: [{ $first: "$vehicle" }, null] },
        likeCount: { $size: "$likes" },
        likedByMe: { $in: [viewerId, "$likes"] },
      },
    },
    { $project: { _id: 0, __v: 0, likes: 0, sharedWith: 0, mediaId: 0, vehicleId: 0, updatedAt: 0 } },
  ];
}

export const Post = mongoose.model("Post", schema);
