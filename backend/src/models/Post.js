import mongoose from "mongoose";
import aggregatePaginate from "mongoose-aggregate-paginate-v2";
import { VISIBILITIES } from "../access.js";

/*
 * Un post est ce que l'utilisateur publie dans le fil : un texte, et/ou un
 * média (son, photo, vidéo) de son hangar, éventuellement rattaché à une
 * fiche véhicule. Le champ s'appelle `ownerId` comme pour les médias, pour
 * réutiliser telles quelles les règles d'accès (canAccess / accessFilter).
 */
const schema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
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
 * `mediaKind` ne garde que les posts dont le média est de ce type.
 */
export function publicPostPipeline(match, viewerId, mediaKind = null) {
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
    // Filtre par type de média (onglets Sons / Photos / Vidéos du profil).
    ...(mediaKind ? [{ $match: { "media.kind": mediaKind } }] : []),
    { $project: { _id: 0, __v: 0, likes: 0, sharedWith: 0, mediaId: 0, vehicleId: 0, updatedAt: 0 } },
  ];
}

export const Post = mongoose.model("Post", schema);
