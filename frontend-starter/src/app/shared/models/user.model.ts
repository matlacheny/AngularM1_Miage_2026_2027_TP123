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
  favorites: { id: string; name: string; category: VehicleCategory; countries: string[]; origins: Origin[] }[];
}
