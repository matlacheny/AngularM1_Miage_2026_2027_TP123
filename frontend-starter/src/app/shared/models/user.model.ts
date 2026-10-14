import { Member, Relation } from './friend.model';
import { Origin, VehicleCategory } from './vehicle.model';

/** Utilisateur connecté (`/api/users/me`) : seul cet objet contient l'email. */
export interface User {
  id: string;
  name: string;
  email: string;
  bio?: string;
  location?: string;
  favoriteVehicleIds?: string[];
  createdAt: string;
}

/** Profil public (`/api/users/:id`). */
export interface UserProfile {
  id: string;
  name: string;
  bio: string;
  location: string;
  createdAt: string;
  postCount: number;
  friendCount: number;
  /** Relation du lecteur envers ce membre (self sur son propre profil). */
  relation: Relation;
  /** Amis en commun (ou toute l'escadrille sur son propre profil), 12 au plus. */
  mutualFriendCount: number;
  mutualFriends: Member[];
  favorites: { id: string; name: string; category: VehicleCategory; countries: string[]; origins: Origin[] }[];
}
