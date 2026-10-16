import { Component, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { IconComponent } from '../../shared/components/icon/icon';
import { VehicleVisualComponent } from '../../shared/components/vehicle-visual/vehicle-visual';
import {
  CATEGORIES,
  CATEGORY_LABELS,
  SORT_LABELS,
  Vehicle,
  VehicleCategory,
  VehicleSort,
} from '../../shared/models/vehicle.model';
import { VehicleService } from '../../shared/services/vehicle.service';

export const PAGE_SIZE = 8;

/** Catalogue des fiches : recherche, tri, filtre par catégorie, et état « aucune fiche ». */
@Component({
  imports: [ReactiveFormsModule, RouterLink, IconComponent, VehicleVisualComponent],
  templateUrl: './vehicles-page.html',
  styleUrl: './vehicles-page.css',
})
export class VehiclesPageComponent {
  private readonly service = inject(VehicleService);
  private readonly router = inject(Router);

  /** Paramètre `?q=` (recherche lancée depuis la barre latérale). */
  readonly q = input<string>();

  readonly categories = CATEGORIES;
  readonly labels = CATEGORY_LABELS;
  readonly sortLabels = SORT_LABELS;
  readonly sorts = Object.keys(SORT_LABELS) as VehicleSort[];

  readonly vehicles = signal<Vehicle[]>([]);
  readonly page = signal(1);
  readonly pages = signal(1);
  readonly category = signal<VehicleCategory | null>(null);
  readonly sort = signal<VehicleSort>('popular');
  readonly sortOpen = signal(false);
  readonly loading = signal(false);
  readonly error = signal('');

  /** Fiches proches proposées quand la recherche ne donne rien. */
  readonly suggestions = signal<Vehicle[]>([]);

  readonly search = new FormControl('', { nonNullable: true });

  constructor() {
    // ?q= dans l'URL → champ de recherche (déclenche le chargement ci-dessous).
    effect(() => {
      const q = this.q() ?? '';
      untracked(() => {
        if (q !== this.search.value) this.search.setValue(q);
      });
    });

    this.load();
    this.search.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(inject(DestroyRef)))
      .subscribe(() => {
        this.page.set(1);
        this.load();
      });
  }

  /** Terme de recherche courant, nettoyé. */
  term(): string {
    return this.search.value.trim();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.service.search(this.term(), this.category() ?? undefined, this.page(), PAGE_SIZE, this.sort()).subscribe({
      next: (response) => {
        this.vehicles.set(response.docs);
        this.pages.set(Math.max(1, response.totalPages));
        this.loading.set(false);
        this.suggestions.set([]);
        if (!response.docs.length && this.term()) this.loadSuggestions(this.term());
      },
      error: (error: HttpErrorResponse) => {
        console.error('[VehiclesPage] Chargement impossible', error);
        this.error.set(error.error?.message ?? 'Impossible de charger les fiches.');
        this.loading.set(false);
      },
    });
  }

  /** « Mirage 4000 » sans résultat → fiches qui contiennent « Mirage ». */
  private loadSuggestions(term: string): void {
    const firstWord = term.split(/\s+/)[0];
    if (firstWord.length < 2 || firstWord === term) return;
    this.service.search(firstWord, undefined, 1, 3).subscribe({
      next: (response) => this.suggestions.set(response.docs),
      error: (error: HttpErrorResponse) => console.error('[VehiclesPage] Suggestions indisponibles', error.status),
    });
  }

  filter(category: VehicleCategory | null): void {
    this.category.set(category);
    this.page.set(1);
    this.load();
  }

  chooseSort(sort: VehicleSort): void {
    this.sortOpen.set(false);
    if (sort === this.sort()) return;
    this.sort.set(sort);
    this.page.set(1);
    this.load();
  }

  go(page: number): void {
    if (page < 1 || page > this.pages()) return;
    this.page.set(page);
    this.load();
  }

  /** Rang affiché (#1, #2…) quand le catalogue est trié par popularité. */
  rank(index: number): number {
    return (this.page() - 1) * PAGE_SIZE + index + 1;
  }

  clearSearch(): void {
    this.search.setValue('');
    void this.router.navigate(['/vehicles']);
  }

  createFromSearch(): void {
    void this.router.navigate(['/vehicles/new'], { queryParams: { name: this.term() } });
  }
}
