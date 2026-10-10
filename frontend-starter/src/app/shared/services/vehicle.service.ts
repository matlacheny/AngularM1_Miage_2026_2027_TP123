import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Page } from '../models/page.model';
import { Media, MediaKind } from '../models/media.model';
import { Vehicle, VehicleCategory, VehicleSort } from '../models/vehicle.model';

/** Opérations HTTP sur les fiches véhicules. */
@Injectable({ providedIn: 'root' })
export class VehicleService {
  private readonly http = inject(HttpClient);

  /** Recherche parmi les fiches déjà créées (aucun appel à Wikipédia). */
  search(q = '', category?: VehicleCategory, page = 1, limit = 12, sort?: VehicleSort) {
    const params: Record<string, string | number> = { page, limit };
    if (sort) params['sort'] = sort;
    if (q) params['q'] = q;
    if (category) params['category'] = category;
    return this.http.get<Page<Vehicle>>('/api/vehicles', { params });
  }

  /**
   * Crée (ou retrouve) la fiche correspondant à un nom saisi. Le backend
   * interroge Wikipédia : 422 si ce n'est pas un véhicule, 503 si Wikipédia
   * est indisponible.
   */
  create(name: string) {
    return this.http.post<Vehicle>('/api/vehicles', { name });
  }

  /** Variante qui expose le statut : 201 = fiche créée, 200 = fiche déjà existante. */
  createWithStatus(name: string) {
    return this.http.post<Vehicle>('/api/vehicles', { name }, { observe: 'response' });
  }

  get(id: string) {
    return this.http.get<Vehicle>(`/api/vehicles/${id}`);
  }

  /**
   * Médias de la fiche que l'utilisateur connecté a le droit de voir.
   * `kind` : un type ('audio') ou plusieurs (['image', 'video']).
   */
  media(id: string, kind?: MediaKind | MediaKind[], page = 1, limit = 12) {
    const params: Record<string, string | number> = { page, limit };
    const kinds = Array.isArray(kind) ? kind : kind ? [kind] : [];
    if (kinds.length) params['kind'] = kinds.join(',');
    return this.http.get<Page<Media>>(`/api/vehicles/${id}/media`, { params });
  }
}
