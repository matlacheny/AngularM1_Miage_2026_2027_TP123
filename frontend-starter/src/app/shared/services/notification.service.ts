import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs';
import { AppNotification, NotificationList } from '../models/notification.model';

/** Notifications : J'aime et commentaires reçus sur mes posts. */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly http = inject(HttpClient);

  /** Interactions récentes (panneau de la cloche). */
  readonly items = signal<AppNotification[]>([]);
  /** Nombre de non lues (pastille de la cloche). */
  readonly unreadCount = signal(0);

  load(limit = 20) {
    return this.http.get<NotificationList>('/api/notifications', { params: { limit } }).pipe(
      tap((list) => {
        this.items.set(list.items);
        this.unreadCount.set(list.unreadCount);
      }),
    );
  }

  /** Tout marquer comme lu : la pastille disparaît, la liste garde son surlignage jusqu'au prochain chargement. */
  markAllRead() {
    return this.http.post<void>('/api/notifications/read', {}).pipe(tap(() => this.unreadCount.set(0)));
  }
}
