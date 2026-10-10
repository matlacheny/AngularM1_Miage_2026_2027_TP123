import mongoose from "mongoose";
import aggregatePaginate from "mongoose-aggregate-paginate-v2";

/** Commentaire d'un post. Visible par quiconque peut voir le post. */
const schema = new mongoose.Schema(
  {
    postId: { type: mongoose.Schema.Types.ObjectId, ref: "Post", required: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, required: true, trim: true, minlength: 1, maxlength: 1000 },
  },
  { timestamps: true },
);

// Commentaires d'un post, du plus ancien au plus récent.
schema.index({ postId: 1, createdAt: 1 });
schema.plugin(aggregatePaginate);

/** Commentaires d'un post avec le nom de leur auteur. */
export function publicCommentPipeline(postId) {
  return [
    { $match: { postId } },
    { $sort: { createdAt: 1 } },
    {
      $lookup: {
        from: "users",
        localField: "ownerId",
        foreignField: "_id",
        as: "owner",
        pipeline: [{ $project: { _id: 0, id: { $toString: "$_id" }, name: 1 } }],
      },
    },
    {
      $addFields: {
        id: { $toString: "$_id" },
        postId: { $toString: "$postId" },
        ownerId: { $toString: "$ownerId" },
        owner: { $ifNull: [{ $first: "$owner" }, null] },
      },
    },
    { $project: { _id: 0, __v: 0, updatedAt: 0 } },
  ];
}

export const Comment = mongoose.model("Comment", schema);
