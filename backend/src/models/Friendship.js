import mongoose from "mongoose";

/**
 * Clé unique d'une paire d'utilisateurs, indépendante du sens de la demande :
 * pairKey(a, b) === pairKey(b, a). Empêche deux liens entre les mêmes personnes.
 */
export function pairKey(a, b) {
  return [String(a), String(b)].sort().join(":");
}

/*
 * Lien d'escadrille entre deux membres : une invitation (`pending`) envoyée
 * par `requesterId` à `recipientId`, qui devient une amitié (`accepted`)
 * quand le destinataire l'accepte. Refuser, annuler ou retirer un ami
 * supprime le document.
 */
const schema = new mongoose.Schema(
  {
    requesterId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    recipientId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    status: { type: String, enum: ["pending", "accepted"], default: "pending" },
    pairKey: { type: String, required: true, unique: true },
  },
  { timestamps: true },
);

export const Friendship = mongoose.model("Friendship", schema);
