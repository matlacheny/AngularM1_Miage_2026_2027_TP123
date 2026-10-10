import mongoose from "mongoose";
import aggregatePaginate from "mongoose-aggregate-paginate-v2";
import { VISIBILITIES } from "../access.js";

const MB = 1024 * 1024;

/** Types MIME acceptés et catégorie de média correspondante. */
export const MEDIA_TYPES = new Map([
  ["audio/mpeg", "audio"],
  ["audio/wav", "audio"],
  ["audio/x-wav", "audio"],
  ["audio/ogg", "audio"],
  ["audio/mp4", "audio"],
  ["audio/x-m4a", "audio"],
  ["image/jpeg", "image"],
  ["image/png", "image"],
  ["image/webp", "image"],
  ["video/mp4", "video"],
  ["video/webm", "video"],
]);

/** Taille maximale par catégorie. La plus grande sert de limite à Multer. */
export const SIZE_LIMITS = { audio: 25 * MB, image: 10 * MB, video: 100 * MB };
export const MAX_UPLOAD_SIZE = Math.max(...Object.values(SIZE_LIMITS));

/** Retourne "audio" | "image" | "video", ou null si le type est refusé. */
export function mediaKind(mimeType) {
  return MEDIA_TYPES.get(mimeType) ?? null;
}

/*
 * Un média est un fichier brut (son, photo ou vidéo) et ses droits d'accès.
 * Le fichier reste sur le disque ; storedName n'est jamais exposé.
 */
const schema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    kind: { type: String, required: true, enum: ["audio", "image", "video"] },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    originalName: { type: String, required: true },
    storedName: { type: String, required: true, select: false },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true, min: 0 },
    visibility: { type: String, enum: VISIBILITIES, default: "private" },
    // Utilisateurs à qui le propriétaire a explicitement partagé ce média.
    sharedWith: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    // Fiche véhicule à laquelle le média est rattaché (facultatif).
    vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle", default: null, index: true },
  },
  { timestamps: true },
);

// Liste « mes médias » triée par date, éventuellement filtrée par catégorie.
schema.index({ ownerId: 1, createdAt: -1 });
// Futurs « derniers ajouts » publics.
schema.index({ visibility: 1, createdAt: -1 });

schema.plugin(aggregatePaginate);

/** Convertit un document en objet sûr pour le frontend. */
schema.methods.toPublic = function () {
  return {
    id: this.id,
    ownerId: String(this.ownerId),
    kind: this.kind,
    title: this.title,
    originalName: this.originalName,
    mimeType: this.mimeType,
    size: this.size,
    visibility: this.visibility,
    vehicle: publicVehicle(this.vehicleId),
    createdAt: this.createdAt,
  };
};

/** vehicleId peut être peuplé (populate) ou n'être qu'un ObjectId. */
function publicVehicle(vehicle) {
  if (!vehicle) return null;
  if (vehicle.name !== undefined) return { id: String(vehicle._id), name: vehicle.name };
  return { id: String(vehicle), name: null };
}

/**
 * Étapes d'agrégation communes aux listes de médias : tri par date, véhicule
 * joint ({id, name} ou null) et retrait des champs internes. Même forme JSON
 * que toPublic().
 */
export function publicMediaPipeline(match) {
  return [
    { $match: match },
    { $sort: { createdAt: -1 } },
    {
      $lookup: {
        from: "vehicles",
        localField: "vehicleId",
        foreignField: "_id",
        as: "vehicle",
        pipeline: [{ $project: { _id: 0, id: { $toString: "$_id" }, name: 1 } }],
      },
    },
    {
      $addFields: {
        id: { $toString: "$_id" },
        ownerId: { $toString: "$ownerId" },
        vehicle: { $ifNull: [{ $first: "$vehicle" }, null] },
      },
    },
    { $project: { _id: 0, __v: 0, storedName: 0, sharedWith: 0, vehicleId: 0, updatedAt: 0 } },
  ];
}

export const Media = mongoose.model("Media", schema);
