import mongoose from "mongoose";

export const NOTIFICATION_TYPES = ["like", "comment"];

/*
 * Interaction d'un membre (`actorId`) sur un post de `recipientId` : un J'aime
 * ou un commentaire. Un J'aime retiré supprime sa notification ; supprimer le
 * post supprime toutes les siennes. `read` passe à true quand le destinataire
 * ouvre la liste.
 */
const schema = new mongoose.Schema(
  {
    recipientId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    postId: { type: mongoose.Schema.Types.ObjectId, ref: "Post", required: true, index: true },
    commentId: { type: mongoose.Schema.Types.ObjectId, ref: "Comment", default: null },
    // Début du commentaire, affiché dans la liste.
    excerpt: { type: String, default: "", maxlength: 140 },
    read: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// Liste du destinataire, plus récentes d'abord, et comptage des non lues.
schema.index({ recipientId: 1, createdAt: -1 });
schema.index({ recipientId: 1, read: 1 });

/** Notifications d'un destinataire avec le nom de l'auteur et l'intitulé du post. */
export function publicNotificationPipeline(recipientId, limit) {
  const project = (fields) => [{ $project: { _id: 0, id: { $toString: "$_id" }, ...fields } }];
  return [
    { $match: { recipientId } },
    { $sort: { createdAt: -1 } },
    { $limit: limit },
    { $lookup: { from: "users", localField: "actorId", foreignField: "_id", as: "actor", pipeline: project({ name: 1 }) } },
    { $lookup: { from: "posts", localField: "postId", foreignField: "_id", as: "post", pipeline: project({ title: 1 }) } },
    {
      $addFields: {
        id: { $toString: "$_id" },
        actor: { $ifNull: [{ $first: "$actor" }, null] },
        post: { $ifNull: [{ $first: "$post" }, null] },
      },
    },
    { $project: { _id: 0, __v: 0, recipientId: 0, actorId: 0, postId: 0, commentId: 0, updatedAt: 0 } },
  ];
}

export const Notification = mongoose.model("Notification", schema);
