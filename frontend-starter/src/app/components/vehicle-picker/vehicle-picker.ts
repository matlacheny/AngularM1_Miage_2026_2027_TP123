import { Component, DestroyRef, inject, model, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { CATEGORY_LABELS, Vehicle } from '../../shared/models/vehicle.model';
import { VehicleService } from '../../shared/services/vehicle.service';

/**
 * Choix d'une fiche véhicule : recherche parmi les fiches existantes et, si
 * besoin, création d'une nouvelle fiche validée par Wikipédia.
 * Usage : `<app-vehicle-picker [(selected)]="vehicle" />`.
 */
@Component({
  selector: 'app-vehicle-picker',
  imports: [ReactiveFormsModule],
  templateUrl: './vehicle-picker.html',
  styleUrl: './vehicle-picker.css',
})
export class VehiclePickerComponent {
  private readonly service = inject(VehicleService);

  readonly selected = model<Vehicle | null>(null);
  readonly labels = CATEGORY_LABELS;

  readonly query = new FormControl('', { nonNullable: true });
  readonly suggestions = signal<Vehicle[]>([]);
  readonly creating = signal(false);
  readonly error = signal('');

  constructor() {
    this.query.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(inject(DestroyRef)))
      .subscribe((q) => this.search(q.trim()));
  }

  search(q: string): void {
    this.error.set('');
    if (q.length < 2) {
      this.suggestions.set([]);
      return;
    }
    this.service.search(q, undefined, 1, 5).subscribe({
      next: (page) => this.suggestions.set(page.docs),
      error: (error: HttpErrorResponse) => {
        console.error('[VehiclePicker] Recherche impossible', error);
        this.suggestions.set([]);
      },
    });
  }

  choose(vehicle: Vehicle): void {
    this.selected.set(vehicle);
    this.suggestions.set([]);
    this.query.setValue('', { emitEvent: false });
  }

  clear(): void {
    this.selected.set(null);
  }

  /** Crée la fiche via Wikipédia (ou retrouve la fiche existante) puis la sélectionne. */
  create(): void {
    const name = this.query.value.trim();
    if (name.length < 2 || this.creating()) return;

    this.creating.set(true);
    this.error.set('');
    this.service.create(name).subscribe({
      next: (vehicle) => {
        this.creating.set(false);
        this.choose(vehicle);
      },
      error: (error: HttpErrorResponse) => {
        console.error('[VehiclePicker] Création de fiche impossible', error.status);
        this.creating.set(false);
        this.error.set(error.error?.message ?? 'Impossible de créer la fiche.');
      },
    });
  }
}
