import { Component, OnDestroy, effect, inject, input, signal, untracked } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { FlagBackdropComponent } from '../../shared/components/flag-backdrop/flag-backdrop';
import { IconComponent } from '../../shared/components/icon/icon';
import { CATEGORY_LABELS, Vehicle } from '../../shared/models/vehicle.model';
import { VehicleService } from '../../shared/services/vehicle.service';

/**
 * Parcours de création d'une fiche (maquettes « Nouvelle fiche ») :
 *   edit → confirm → loading → success | refused | unavailable
 */
export type CreateState = 'edit' | 'confirm' | 'loading' | 'success' | 'refused' | 'unavailable';

/** Étapes affichées pendant la recherche (le serveur les enchaîne en une requête). */
export const STEPS = [
  { title: 'Recherche de l’article Wikipédia', detail: 'À partir du nom saisi' },
  { title: 'Vérification de la catégorie', detail: 'Avion, hélicoptère, char ou blindé' },
  { title: 'Récupération des données Wikidata', detail: 'Pays d’origine, image et résumé' },
];

/** Durée d'affichage de chaque étape pendant l'attente. */
export const STEP_DELAY_MS = 900;

@Component({
  imports: [ReactiveFormsModule, RouterLink, IconComponent, FlagBackdropComponent],
  templateUrl: './vehicle-create-page.html',
  styleUrl: './vehicle-create-page.css',
})
export class VehicleCreatePageComponent implements OnDestroy {
  private readonly service = inject(VehicleService);

  /** Paramètre `?name=` (depuis le catalogue ou la recherche). */
  readonly name = input<string>();

  readonly labels = CATEGORY_LABELS;
  readonly steps = STEPS;

  readonly state = signal<CreateState>('edit');
  readonly nameControl = new FormControl('', { nonNullable: true });
  /** Étape en cours d'affichage pendant le chargement (0, 1 ou 2). */
  readonly step = signal(0);
  readonly vehicle = signal<Vehicle | null>(null);
  /** true si la fiche existait déjà (réponse 200 au lieu de 201). */
  readonly existing = signal(false);
  readonly message = signal('');

  private request?: Subscription;
  private timer?: ReturnType<typeof setInterval>;

  constructor() {
    effect(() => {
      const name = (this.name() ?? '').trim();
      untracked(() => {
        this.nameControl.setValue(name);
        this.state.set(name.length >= 2 ? 'confirm' : 'edit');
      });
    });
  }

  /** Nom tel qu'il sera envoyé. */
  current(): string {
    return this.nameControl.value.trim();
  }

  confirm(): void {
    if (this.current().length < 2) return;
    this.state.set('confirm');
  }

  editName(): void {
    this.state.set('edit');
  }

  create(): void {
    const name = this.current();
    if (name.length < 2 || this.state() === 'loading') return;

    this.state.set('loading');
    this.step.set(0);
    this.message.set('');
    this.timer = setInterval(() => this.step.update((s) => Math.min(s + 1, STEPS.length - 1)), STEP_DELAY_MS);

    this.request = this.service.createWithStatus(name).subscribe({
      next: (response) => {
        this.stopTimer();
        this.vehicle.set(response.body);
        this.existing.set(response.status === 200);
        this.state.set('success');
      },
      error: (error: HttpErrorResponse) => {
        this.stopTimer();
        console.error('[VehicleCreatePage] Création refusée', error.status);
        this.message.set(error.error?.message ?? 'La fiche n’a pas pu être créée.');
        this.state.set(error.status === 422 ? 'refused' : 'unavailable');
      },
    });
  }

  /** Annule l'attente : la requête est abandonnée côté navigateur. */
  cancel(): void {
    this.request?.unsubscribe();
    this.stopTimer();
    this.state.set('confirm');
  }

  /** État d'une étape pendant le chargement. */
  stepState(index: number): 'done' | 'current' | 'pending' {
    if (index < this.step()) return 'done';
    return index === this.step() ? 'current' : 'pending';
  }

  /** Progression de la barre : moitié de l'étape en cours comprise. */
  progress(): number {
    return Math.round(((this.step() + 0.5) / STEPS.length) * 100);
  }

  ngOnDestroy(): void {
    this.request?.unsubscribe();
    this.stopTimer();
  }

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}
