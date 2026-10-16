import { Component, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { IconComponent } from '../../shared/components/icon/icon';
import { VehicleVisualComponent } from '../../shared/components/vehicle-visual/vehicle-visual';
import { KIND_LABELS, MediaKind } from '../../shared/models/media.model';
import { Post } from '../../shared/models/post.model';
import { CATEGORY_LABELS, Vehicle } from '../../shared/models/vehicle.model';
import { PostService } from '../../shared/services/post.service';
import { VehicleService } from '../../shared/services/vehicle.service';
import { PostCardComponent } from '../post-card/post-card';

export const VEHICLE_RESULTS = 4;
export const POST_RESULTS = 10;
const KINDS: readonly MediaKind[] = ['audio', 'image', 'video'];

/**
 * Recherche (TP4, étape 4) : les fiches véhicules correspondantes, puis les
 * posts avec un fichier dont le véhicule ou l'auteur correspond (pas le texte du post). La recherche vit dans l'URL (`?q=&kind=`) : le lien
 * se partage et le bouton retour fonctionne. Sans texte, la page liste les
 * derniers fichiers publiés.
 */
@Component({
  imports: [ReactiveFormsModule, RouterLink, IconComponent, VehicleVisualComponent, PostCardComponent],
  templateUrl: './search-page.html',
  styleUrl: './search-page.css',
})
export class SearchPageComponent {
  private readonly postService = inject(PostService);
  private readonly vehicleService = inject(VehicleService);
  private readonly router = inject(Router);

  /** Paramètres `?q=` et `?kind=` de l'URL (withComponentInputBinding). */
  readonly q = input<string>();
  readonly kind = input<string>();

  readonly kinds = KINDS;
  readonly kindLabels = KIND_LABELS;
  readonly categoryLabels = CATEGORY_LABELS;

  readonly search = new FormControl('', { nonNullable: true });

  /** Recherche réellement affichée (celle de l'URL, nettoyée). */
  readonly term = signal('');
  readonly activeKind = signal<MediaKind | null>(null);

  readonly vehicles = signal<Vehicle[]>([]);
  readonly vehicleTotal = signal(0);
  readonly posts = signal<Post[]>([]);
  readonly postTotal = signal(0);
  readonly page = signal(1);
  readonly hasMore = signal(false);
  readonly loading = signal(false);
  readonly error = signal('');

  /** Incrémenté à chaque nouvelle recherche : une réponse plus ancienne est ignorée. */
  private generation = 0;

  constructor() {
    // URL → champ et résultats.
    effect(() => {
      const term = (this.q() ?? '').trim();
      const kind = KINDS.find((k) => k === this.kind()) ?? null;
      untracked(() => {
        if (term !== this.search.value.trim()) this.search.setValue(term, { emitEvent: false });
        this.term.set(term);
        this.activeKind.set(kind);
        this.run();
      });
    });

    // Saisie → URL (remplace l'entrée d'historique pour ne pas empiler chaque frappe).
    this.search.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(inject(DestroyRef)))
      .subscribe((value) => this.navigate(value.trim(), this.activeKind(), true));
  }

  setKind(kind: MediaKind | null): void {
    if (kind !== this.activeKind()) this.navigate(this.term(), kind, false);
  }

  more(): void {
    if (!this.loading() && this.hasMore()) this.loadPosts(this.page() + 1, this.generation);
  }

  onDeleted(id: string): void {
    this.posts.update((list) => list.filter((p) => p.id !== id));
    this.postTotal.update((n) => Math.max(0, n - 1));
  }

  private navigate(q: string, kind: MediaKind | null, replaceUrl: boolean): void {
    const queryParams: Record<string, string> = {};
    if (q) queryParams['q'] = q;
    if (kind) queryParams['kind'] = kind;
    void this.router.navigate(['/search'], { queryParams, replaceUrl });
  }

  /** Nouvelle recherche : fiches véhicules (si texte) et première page de posts. */
  private run(): void {
    const generation = ++this.generation;
    this.vehicles.set([]);
    this.vehicleTotal.set(0);
    if (this.term()) {
      this.vehicleService.search(this.term(), undefined, 1, VEHICLE_RESULTS).subscribe({
        next: (response) => {
          if (generation !== this.generation) return;
          this.vehicles.set(response.docs);
          this.vehicleTotal.set(response.totalDocs);
        },
        error: (error: HttpErrorResponse) => console.error('[SearchPage] Fiches indisponibles', error.status),
      });
    }
    this.loadPosts(1, generation);
  }

  private loadPosts(page: number, generation: number): void {
    this.loading.set(true);
    this.error.set('');
    const filters = { q: this.term(), kind: this.activeKind() ?? undefined, media: true };
    this.postService.feed(page, POST_RESULTS, false, filters).subscribe({
      next: (response) => {
        if (generation !== this.generation) return;
        this.posts.update((list) => (page === 1 ? response.docs : [...list, ...response.docs]));
        this.postTotal.set(response.totalDocs);
        this.page.set(page);
        this.hasMore.set(response.page < response.totalPages);
        this.loading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        if (generation !== this.generation) return;
        console.error('[SearchPage] Recherche impossible', error.status);
        this.error.set(error.error?.message ?? 'Impossible de lancer la recherche.');
        this.loading.set(false);
      },
    });
  }
}
