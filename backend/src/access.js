/*
 * Règle d'accès unique aux médias. Toutes les routes qui lisent un média
 * (métadonnées, fichier, listes publiques) passent par cette fonction :
 * c'est le seul endroit à relire pour vérifier qui voit quoi.
 *
 * Fonction pure (aucun accès à MongoDB) : elle se teste unitairement.
 */

export const VISIBILITIES = ["private", "friends", "public"];

/**
 * @param {string} viewerId  identifiant issu du JWT (jamais du client)
 * @param {{ownerId: unknown, visibility: string, sharedWith?: unknown[]}} media
 * @param {Set<string>} friendIds  amis acceptés du lecteur (étape « escadrille »)
 * @returns {boolean}
 */
export function canAccess(viewerId, media, friendIds = new Set()) {
  if (!viewerId || !media) return false;

  const ownerId = String(media.ownerId);
  if (ownerId === String(viewerId)) return true;

  // Un partage explicite ouvre l'accès quelle que soit la visibilité.
  if ((media.sharedWith || []).some((id) => String(id) === String(viewerId))) return true;

  switch (media.visibility) {
    case "public":
      return true;
    case "friends":
      return friendIds.has(ownerId);
    default:
      return false;
  }
}

/**
 * Même règle que canAccess, traduite en filtre MongoDB pour les listes
 * (ex. médias d'une fiche véhicule). Les deux doivent rester équivalentes :
 * le test "accessFilter et canAccess concordent" le vérifie.
 *
 * @param {import("mongoose").Types.ObjectId} viewerId
 * @param {import("mongoose").Types.ObjectId[]} friendIds
 */
export function accessFilter(viewerId, friendIds = []) {
  return {
    $or: [
      { ownerId: viewerId },
      { sharedWith: viewerId },
      { visibility: "public" },
      { visibility: "friends", ownerId: { $in: friendIds } },
    ],
  };
}
