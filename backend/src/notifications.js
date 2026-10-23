import { Notification } from "./models/Notification.js";

/*
 * Écriture des notifications déclenchées par les J'aime et les commentaires.
 * Objet mutable : les tests le remplacent par une doublure (voir test/setup.js),
 * comme `friendships`. Une notification qui échoue est journalisée mais ne
 * fait jamais échouer le J'aime ou le commentaire qui l'a déclenchée.
 */
const safely = (label, run) => async (...args) => {
  try {
    await run(...args);
  } catch (error) {
    console.error(`[notifications] Échec : ${label}`, error);
  }
};

export const notifications = {
  /** J'aime de `actorId` sur `post` : une seule notification par personne et par post. */
  liked: safely("J'aime", async (post, actorId) => {
    if (String(post.ownerId) === String(actorId)) return;
    await Notification.updateOne(
      { type: "like", postId: post._id, actorId },
      { $setOnInsert: { recipientId: post.ownerId } },
      { upsert: true },
    );
  }),

  /** J'aime retiré : sa notification disparaît. */
  unliked: safely("retrait du J'aime", async (post, actorId) => {
    await Notification.deleteOne({ type: "like", postId: post._id, actorId });
  }),

  /** Commentaire sur le post d'un autre membre. */
  commented: safely("commentaire", async (post, comment) => {
    if (String(post.ownerId) === String(comment.ownerId)) return;
    await Notification.create({
      recipientId: post.ownerId,
      actorId: comment.ownerId,
      type: "comment",
      postId: post._id,
      commentId: comment._id,
      excerpt: String(comment.text ?? "").slice(0, 140),
    });
  }),

  /** Post supprimé : ses notifications aussi. */
  postDeleted: safely("suppression du post", async (postId) => {
    await Notification.deleteMany({ postId });
  }),
};
