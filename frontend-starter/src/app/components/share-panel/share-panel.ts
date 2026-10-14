import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { AvatarComponent } from '../../shared/components/avatar/avatar';
import { IconComponent } from '../../shared/components/icon/icon';
import { Member } from '../../shared/models/friend.model';
import { FriendService } from '../../shared/services/friend.service';
import { MediaService } from '../../shared/services/media.service';

/**
 * Partage ciblé d'un média avec des membres de son escadrille.
 * « Partager » donne l'accès même à un média privé ; « Arrêter » le retire
 * immédiatement (les droits sont revérifiés à chaque lecture).
 */
@Component({
  selector: 'app-share-panel',
  imports: [RouterLink, AvatarComponent, IconComponent],
  template: `
    <div class="panel" aria-label="Partage du média">
      <p class="title">Partager avec mon escadrille</p>
      @if (loading()) {
        <p class="hint">Chargement…</p>
      } @else {
        @for (f of friends(); track f.id) {
          <div class="row">
            <app-avatar class="small" [name]="f.name" />
            <span class="name">{{ f.name }}</span>
            @if (isShared(f.id)) {
              <button type="button" class="secondary" [disabled]="busyId() !== null" (click)="toggle(f, false)">
                <app-icon name="check" /> Partagé · Arrêter
              </button>
            } @else {
              <button type="button" [disabled]="busyId() !== null" (click)="toggle(f, true)">Partager</button>
            }
          </div>
        } @empty {
          <p class="hint">Votre escadrille est vide. <a routerLink="/escadrille">Inviter des membres</a></p>
        }
      }
      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }
    </div>
  `,
  styles: `
    .panel { display: grid; gap: 0.5rem; padding: 0.8rem; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; }
    .title { margin: 0; font-size: 0.85rem; font-weight: 600; color: var(--muted); }
    .row { display: flex; align-items: center; gap: 0.6rem; }
    .small { --avatar-size: 1.9rem; }
    .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    button { padding: 0.35rem 0.7rem; font-size: 0.85rem; }
    .hint, .error { margin: 0; font-size: 0.85rem; }
  `,
})
export class SharePanelComponent {
  private readonly media = inject(MediaService);
  private readonly friendService = inject(FriendService);

  readonly mediaId = input.required<string>();

  readonly friends = signal<Member[]>([]);
  readonly sharedIds = signal<string[]>([]);
  readonly loading = signal(true);
  readonly busyId = signal<string | null>(null);
  readonly error = signal('');
  private readonly shared = computed(() => new Set(this.sharedIds()));

  constructor() {
    effect(() => {
      const id = this.mediaId();
      untracked(() => this.load(id));
    });
  }

  private load(id: string): void {
    this.loading.set(true);
    forkJoin([this.friendService.squadron(), this.media.shares(id)]).subscribe({
      next: ([squadron, shares]) => {
        this.friends.set(squadron.friends);
        this.sharedIds.set(shares.map((s) => s.id));
        this.loading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        console.error('[SharePanel] Chargement impossible', error.status);
        this.error.set(error.error?.message ?? 'Impossible de charger les partages.');
        this.loading.set(false);
      },
    });
  }

  isShared(userId: string): boolean {
    return this.shared().has(userId);
  }

  toggle(friend: Member, share: boolean): void {
    if (this.busyId()) return;
    this.busyId.set(friend.id);
    this.error.set('');
    this.media.setShare(this.mediaId(), friend.id, share).subscribe({
      next: (shares) => {
        this.sharedIds.set(shares.map((s) => s.id));
        this.busyId.set(null);
      },
      error: (error: HttpErrorResponse) => {
        console.error('[SharePanel] Partage impossible', error.status);
        this.error.set(error.error?.message ?? 'Partage impossible.');
        this.busyId.set(null);
      },
    });
  }
}
