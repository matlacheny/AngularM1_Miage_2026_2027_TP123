/** Membre tel qu'il apparaît dans l'escadrille (jamais d'email). */
export interface Member {
  id: string;
  name: string;
  location: string;
  bio: string;
}

export type RelationStatus = 'self' | 'friend' | 'outgoing' | 'incoming' | 'none';

/** Relation du lecteur envers un membre ; `requestId` identifie le lien. */
export interface Relation {
  status: RelationStatus;
  requestId: string | null;
}

export interface FriendRequest {
  requestId: string;
  user: Member;
  createdAt: string;
}

/** Réponse de `GET /api/friends`. */
export interface Squadron {
  friends: (Member & { since: string })[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
}

/** Résultat de recherche de membres (`GET /api/users?q=`). */
export interface MemberResult extends Member {
  relation: Relation;
}
