import { Component, DestroyRef, ElementRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AvatarComponent } from '../../shared/components/avatar/avatar';
import { IconComponent } from '../../shared/components/icon/icon';
import { AppNotification } from '../../shared/models/notification.model';
import { NotificationService } from '../../shared/services/notification.service';
import { shortRelativeTime } from '../../shared/utils/format';

/** Rafraîchissement de la pastille pendant que la session est ouverte. */
const REFRESH_MS = 60_000;

/**
 * Cloche de la carte utilisateur : pastille des J'aime et commentaires non
 * lus, et panneau des interactions récentes sur mes posts. Ouvrir le panneau
 * recharge la liste puis marque tout comme lu.
 */
@Component({
  selector: 'app-notification-bell',
  imports: [RouterLink, AvatarComponent, IconComponent],
  templateUrl: './notification-bell.html',
  styleUrl: './notification-bell.css',
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'open.set(false)',
  },
})
export class NotificationBellComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly notifications = inject(NotificationService);

  readonly open = signal(false);
  readonly loading = signal(false);
  readonly error = signal('');

  constructor() {
    this.refresh();
    const timer = setInterval(() => this.refresh(), REFRESH_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  toggle(): void {
    this.open.update((open) => !open);
    if (!this.open()) return;
    this.loading.set(true);
    this.error.set('');
    this.notifications.load().subscribe({
      next: (list) => {
        this.loading.set(false);
        if (list.unreadCount) {
          this.notifications.markAllRead().subscribe({
            error: (error: unknown) => console.error('[NotificationBell] Marquage impossible', error),
          });
        }
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set('Notifications indisponibles pour le moment.');
        console.error('[NotificationBell] Chargement impossible', error);
      },
    });
  }

  /** Ferme le panneau quand on clique ailleurs. */
  onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.open.set(false);
  }

  label(n: AppNotification): string {
    return n.type === 'like' ? 'a aimé votre publication' : 'a commenté votre publication';
  }

  when(n: AppNotification): string {
    return shortRelativeTime(n.createdAt);
  }

  private refresh(): void {
    // Panneau ouvert : on ne remplace pas la liste que l'utilisateur lit.
    if (this.open()) return;
    this.notifications.load().subscribe({
      error: (error: unknown) => console.error('[NotificationBell] Notifications indisponibles', error),
    });
  }
}
