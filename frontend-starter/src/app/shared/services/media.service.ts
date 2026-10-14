import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Page } from '../models/page.model';
import { Media, MediaKind, StreamUrl, Visibility } from '../models/media.model';

/** Opérations HTTP sur les médias (sons, photos, vidéos). */
@Injectable({ providedIn: 'root' })
export class MediaService {
  private readonly http = inject(HttpClient);

  /** Mes médias, éventuellement filtrés par catégorie. */
  list(page = 1, limit = 10, kind?: MediaKind) {
    const params: Record<string, string | number> = { page, limit };
    if (kind) params['kind'] = kind;
    return this.http.get<Page<Media>>('/api/media', { params });
  }

  upload(file: File, title: string, visibility: Visibility, vehicleId?: string) {
    const body = new FormData();
    body.append('file', file);
    body.append('title', title);
    body.append('visibility', visibility);
    if (vehicleId) body.append('vehicleId', vehicleId);
    return this.http.post<Media>('/api/media', body, {
      reportProgress: true,
      observe: 'events',
    });
  }

  /** `vehicleId: null` détache le média de sa fiche. */
  update(id: string, changes: { title?: string; visibility?: Visibility; vehicleId?: string | null }) {
    return this.http.patch<Media>(`/api/media/${id}`, changes);
  }

  /**
   * URL signée et temporaire, à placer directement dans `<video src>`,
   * `<audio src>` ou `<img src>`. Contrairement à un Blob, le navigateur
   * peut alors lire une vidéo progressivement (requêtes Range).
   */
  streamUrl(id: string) {
    return this.http.post<StreamUrl>(`/api/media/${id}/stream-url`, {});
  }

  /** Membres avec qui j'ai partagé ce média. */
  shares(id: string) {
    return this.http.get<{ id: string; name: string }[]>(`/api/media/${id}/shares`);
  }

  /** Partage avec un ami (true) ou arrête le partage (false). */
  setShare(id: string, userId: string, shared: boolean) {
    const url = `/api/media/${id}/shares/${userId}`;
    return shared
      ? this.http.put<{ id: string; name: string }[]>(url, {})
      : this.http.delete<{ id: string; name: string }[]>(url);
  }

  /** Médias que d'autres membres ont partagés avec moi. */
  sharedWithMe(page = 1, limit = 10) {
    return this.http.get<Page<Media>>('/api/media/shared-with-me', { params: { page, limit } });
  }

  delete(id: string) {
    return this.http.delete<void>(`/api/media/${id}`);
  }
}
