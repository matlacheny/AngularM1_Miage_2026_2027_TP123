import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { CATEGORIES, CATEGORY_LABELS, Vehicle, VehicleCategory } from '../../shared/models/vehicle.model';
import { VehicleService } from '../../shared/services/vehicle.service';

/** Catalogue des fiches véhicules : recherche, filtre par catégorie et création. */
@Component({
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './vehicles-page.html',
  styleUrl: './vehicles-page.css',
})
export class VehiclesPageComponent {
  private readonly service = inject(VehicleService);
  private readonly router = inject(Router);

  readonly categories = CATEGORIES;
  readonly labels = CATEGORY_LABELS;

  readonly vehicles = signal<Vehicle[]>([]);
  readonly page = signal(1);
  readonly pages = signal(1);
  readonly category = signal<VehicleCategory | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');

  readonly search = new FormControl('', { nonNullable: true });
  readonly newName = new FormControl('', { nonNullable: true });
  readonly creating = signal(false);
  readonly createError = signal('');

  constructor() {
    this.load();
    this.search.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(inject(DestroyRef)))
      .subscribe(() => {
        this.page.set(1);
        this.load();
      });
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.service.search(this.search.value.trim(), this.category() ?? undefined, this.page()).subscribe({
      next: (response) => {
        this.vehicles.set(response.docs);
        this.pages.set(Math.max(1, response.totalPages));
        this.loading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        console.error('[VehiclesPage] Chargement impossible', error);
        this.error.set(error.error?.message ?? 'Impossible de charger les fiches.');
        this.loading.set(false);
      },
    });
  }

  filter(category: VehicleCategory | null): void {
    this.category.set(category);
    this.page.set(1);
    this.load();
  }

  go(page: number): void {
    if (page < 1 || page > this.pages()) return;
    this.page.set(page);
    this.load();
  }

  /** Crée la fiche (validée par Wikipédia côté serveur) puis l'ouvre. */
  create(): void {
    const name = this.newName.value.trim();
    if (name.length < 2 || this.creating()) return;

    this.creating.set(true);
    this.createError.set('');
    this.service.create(name).subscribe({
      next: (vehicle) => {
        this.creating.set(false);
        this.newName.setValue('');
        void this.router.navigate(['/vehicles', vehicle.id]);
      },
      error: (error: HttpErrorResponse) => {
        console.error('[VehiclesPage] Création impossible', error.status);
        this.creating.set(false);
        this.createError.set(error.error?.message ?? 'Impossible de créer la fiche.');
      },
    });
  }
}
