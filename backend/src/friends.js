import { Friendship, pairKey } from "./models/Friendship.js";

/*
 * Accès aux liens d'escadrille utilisés par les règles de visibilité.
 * Objet mutable : les tests remplacent `friendships.idsOf` par une doublure
 * (voir test/setup.js), comme `wikipedia.resolveVehicle`.
 */
/** Identifiants (chaînes) des amis acceptés d'un utilisateur. */
export async function friendIdsOf(userId) {
  const links = await Friendship.find({
    status: "accepted",
    $or: [{ requesterId: userId }, { recipientId: userId }],
  })
    .select("requesterId recipientId")
    .lean();
  return new Set(links.map((l) => String(String(l.requesterId) === String(userId) ? l.recipientId : l.requesterId)));
}

export const friendships = {
  idsOf: friendIdsOf,

  /** Lien entre deux utilisateurs (invitation ou amitié), ou null. */
  async between(a, b) {
    return Friendship.findOne({ pairKey: pairKey(a, b) });
  },
};

/** Amis acceptés du lecteur : alimente canAccess / accessFilter partout. */
export function loadFriendIds(viewerId) {
  return friendships.idsOf(viewerId);
}

/**
 * Relation vue par `viewerId` envers `otherId` :
 * self | friend | outgoing (invitation envoyée) | incoming (reçue) | none.
 */
export async function relationTo(viewerId, otherId) {
  if (String(viewerId) === String(otherId)) return { status: "self", requestId: null };
  const link = await friendships.between(viewerId, otherId);
  if (!link) return { status: "none", requestId: null };
  if (link.status === "accepted") return { status: "friend", requestId: link.id };
  const outgoing = String(link.requesterId) === String(viewerId);
  return { status: outgoing ? "outgoing" : "incoming", requestId: link.id };
}
