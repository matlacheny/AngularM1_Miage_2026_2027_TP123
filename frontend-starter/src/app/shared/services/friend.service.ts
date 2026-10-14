import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs';
import { MemberResult, Relation, Squadron } from '../models/friend.model';

/** Escadrille : amis, invitations et recherche de membres. */
@Injectable({ providedIn: 'root' })
export class FriendService {
  private readonly http = inject(HttpClient);

  /** Nombre d'invitations reçues (pastille du menu « Escadrille »). */
  readonly incomingCount = signal(0);

  squadron() {
    return this.http.get<Squadron>('/api/friends').pipe(tap((s) => this.incomingCount.set(s.incoming.length)));
  }

  search(q: string) {
    return this.http.get<MemberResult[]>('/api/users', { params: { q } });
  }

  invite(userId: string) {
    return this.http.post<Relation>('/api/friends/requests', { userId });
  }

  accept(requestId: string) {
    return this.http.post<Relation>(`/api/friends/requests/${requestId}/accept`, {});
  }

  /** Refuse une invitation reçue ou annule une invitation envoyée. */
  dismiss(requestId: string) {
    return this.http.delete<void>(`/api/friends/requests/${requestId}`);
  }

  /** Retire un ami (ses partages avec moi, et les miens avec lui, sont arrêtés). */
  remove(userId: string) {
    return this.http.delete<void>(`/api/friends/${userId}`);
  }
}
