import { Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { AvatarComponent } from '../../shared/components/avatar/avatar';
import { IconComponent } from '../../shared/components/icon/icon';
import { VehicleVisualComponent } from '../../shared/components/vehicle-visual/vehicle-visual';
import { KIND_LABELS, MediaKind } from '../../shared/models/media.model';
import { Post } from '../../shared/models/post.model';
import { CATEGORY_LABELS, Vehicle } from '../../shared/models/vehicle.model';
import { PostService } from '../../shared/services/post.service';
import { VehicleService } from '../../shared/services/vehicle.service';
import { shortRelativeTime } from '../../shared/utils/format';
import { PostCardComponent } from '../post-card/post-card';
import { PostComposerComponent } from '../post-composer/post-composer';

export const FEED_PAGE_SIZE = 10;
export const LATEST_FILES = 4;
/** Icône de chaque type de fichier (bloc « Derniers ajouts »). */
const KIND_ICONS: Readonly<Record<MediaKind, string>> = { audio: 'mic', image: 'image', video: 'video' };
const DAY = 24 * 60 * 60 * 1000;

/**
 * Accueil (maquette « Fil d'actualité ») : zone de publication, fil des
 * posts visibles, et colonne « Véhicules recommandés » / « Derniers ajouts » /
 * « Posts récents ».
 */
@Component({
  imports: [
    RouterLink,
    AvatarComponent,
    IconComponent,
    VehicleVisualComponent,
    PostCardComponent,
    PostComposerComponent,
  ],
  templateUrl: './feed-page.html',
  styleUrl: './feed-page.css',
})
export class FeedPageComponent {
  private readonly postService = inject(PostService);
  private readonly vehicleService = inject(VehicleService);

  readonly kindLabels = KIND_LABELS;
  readonly categoryLabels = CATEGORY_LABELS;

  /** Onglet du fil : tous les posts visibles, ou seulement ceux de l'escadrille. */
  readonly scope = signal<'all' | 'friends'>('all');
  readonly posts = signal<Post[]>([]);
  readonly page = signal(1);
  readonly hasMore = signal(false);
  readonly loading = signal(false);
  readonly error = signal('');

  readonly recommended = signal<Vehicle[]>([]);
  readonly recent = signal<Post[]>([]);
  /** Derniers fichiers publiés et visibles par moi (tout le réseau, pas seulement l'escadrille). */
  readonly latestFiles = signal<Post[]>([]);

  constructor() {
    this.loadPage(1);
    this.vehicleService.search('', undefined, 1, 4, 'popular').subscribe({
      next: (page) => this.recommended.set(page.docs),
      error: (error: HttpErrorResponse) => console.error('[FeedPage] Recommandations indisponibles', error.status),
    });
    this.loadRecent();
    this.loadLatestFiles();
  }

  /** Page 1 : remplace le fil ; pages suivantes : ajoute à la suite (« plus anciennes »). */
  loadPage(page: number): void {
    this.loading.set(true);
    this.error.set('');
    const filters = this.scope() === 'friends' ? { scope: 'friends' as const } : {};
    this.postService.feed(page, FEED_PAGE_SIZE, false, filters).subscribe({
      next: (response) => {
        this.posts.update((list) => (page === 1 ? response.docs : [...list, ...response.docs]));
        this.page.set(page);
        this.hasMore.set(response.page < response.totalPages);
        this.loading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        console.error('[FeedPage] Fil indisponible', error.status);
        this.error.set(error.error?.message ?? 'Impossible de charger le fil.');
        this.loading.set(false);
      },
    });
  }

  private loadRecent(): void {
    this.postService.feed(1, 4, false, { scope: 'friends' }).subscribe({
      next: (page) => this.recent.set(page.docs),
      error: (error: HttpErrorResponse) => console.error('[FeedPage] Posts récents indisponibles', error.status),
    });
  }

  private loadLatestFiles(): void {
    this.postService.feed(1, LATEST_FILES, false, { media: true }).subscribe({
      next: (page) => this.latestFiles.set(page.docs.filter((p) => p.media)),
      error: (error: HttpErrorResponse) => console.error('[FeedPage] Derniers ajouts indisponibles', error.status),
    });
  }

  setScope(scope: 'all' | 'friends'): void {
    if (scope === this.scope()) return;
    this.scope.set(scope);
    this.loadPage(1);
  }

  more(): void {
    if (!this.loading() && this.hasMore()) this.loadPage(this.page() + 1);
  }

  onPublished(post: Post): void {
    this.posts.update((list) => [post, ...list]);
    if (post.media) this.latestFiles.update((list) => [post, ...list].slice(0, LATEST_FILES));
  }

  onDeleted(id: string): void {
    this.posts.update((list) => list.filter((p) => p.id !== id));
    this.recent.update((list) => list.filter((p) => p.id !== id));
    this.latestFiles.update((list) => list.filter((p) => p.id !== id));
  }

  /** « Photo · Dassault Rafale », « Son », « Texte ». */
  summary(post: Post): string {
    const kind = post.media ? KIND_LABELS[post.media.kind] : 'Texte';
    return post.vehicle ? `${kind} · ${post.vehicle.name}` : kind;
  }

  kindIcon(post: Post): string {
    return post.media ? KIND_ICONS[post.media.kind] : 'image';
  }

  ago(post: Post): string {
    return shortRelativeTime(post.createdAt);
  }

  /** Moins de 24 h : l'heure est mise en avant en ambre, comme sur la maquette. */
  isFresh(post: Post): boolean {
    return Date.now() - new Date(post.createdAt).getTime() < DAY;
  }
}
