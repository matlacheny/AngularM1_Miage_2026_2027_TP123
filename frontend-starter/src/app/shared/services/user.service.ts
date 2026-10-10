import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs';
import { User, UserProfile } from '../models/user.model';
import { AuthService } from './auth.service';

/** Profils publics et véhicules préférés. */
@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  profile(id: string) {
    return this.http.get<UserProfile>(`/api/users/${id}`);
  }

  /** Ajoute ou retire un favori ; l'utilisateur connecté est mis à jour. */
  setFavorite(vehicleId: string, favorite: boolean) {
    const url = `/api/users/me/favorites/${vehicleId}`;
    const request = favorite ? this.http.put<User>(url, {}) : this.http.delete<User>(url);
    return request.pipe(tap((user) => this.auth.currentUser.set(user)));
  }
}
