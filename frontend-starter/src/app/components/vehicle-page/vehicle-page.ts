import { Component, effect, inject, input, signal, untracked } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { KIND_LABELS, Media, MediaKind } from '../../shared/models/media.model';
import { CATEGORY_LABELS, Vehicle } from '../../shared/models/vehicle.model';
import { MediaService } from '../../shared/services/media.service';
import { VehicleService } from '../../shared/services/vehicle.service';
import { MediaViewerComponent } from '../media-viewer/media-viewer';

/** Fiche d'un véhicule : données Wikipédia + sons, photos et vidéos visibles par l'utilisateur. */
@Component({
  imports: [RouterLink, MediaViewerComponent],
  templateUrl: './vehicle-page.html',
  styleUrl: './vehicle-page.css',
})
export class VehiclePageComponent {
  private readonly vehicles = inject(VehicleService);
  private readonly mediaService = inject(MediaService);

  /** Paramètre `:id` de la route (withComponentInputBinding). */
  readonly id = input.required<string>();

  readonly categoryLabels = CATEGORY_LABELS;
  readonly kindLabels = KIND_LABELS;
  readonly kinds: MediaKind[] = ['audio', 'image', 'video'];

  readonly vehicle = signal<Vehicle | null>(null);
  readonly notFound = signal(false);
  readonly kind = signal<MediaKind | null>(null);
  readonly media = signal<Media[]>([]);
  readonly page = signal(1);
  readonly pages = signal(1);
  readonly loadingMedia = signal(false);
  readonly error = signal('');
  readonly opened = signal<{ media: Media; url: string } | null>(null);

  constructor() {
    // Recharge tout quand on navigue d'une fiche à une autre (même composant, autre :id).
    effect(() => {
      const id = this.id();
      untracked(() => this.loadVehicle(id));
    });
  }

  private loadVehicle(id: string): void {
    this.vehicle.set(null);
    this.notFound.set(false);
    this.opened.set(null);
    this.kind.set(null);
    this.page.set(1);
    this.vehicles.get(id).subscribe({
      next: (vehicle) => this.vehicle.set(vehicle),
      error: (error: HttpErrorResponse) => {
        console.error('[VehiclePage] Fiche introuvable', error.status);
        this.notFound.set(true);
      },
    });
    this.loadMedia();
  }

  loadMedia(): void {
    this.loadingMedia.set(true);
    this.error.set('');
    this.vehicles.media(this.id(), this.kind() ?? undefined, this.page()).subscribe({
      next: (response) => {
        this.media.set(response.docs);
        this.pages.set(Math.max(1, response.totalPages));
        this.loadingMedia.set(false);
      },
      error: (error: HttpErrorResponse) => {
        console.error('[VehiclePage] Médias indisponibles', error);
        this.error.set(error.error?.message ?? 'Impossible de charger les médias.');
        this.loadingMedia.set(false);
      },
    });
  }

  filter(kind: MediaKind | null): void {
    this.kind.set(kind);
    this.page.set(1);
    this.loadMedia();
  }

  go(page: number): void {
    if (page < 1 || page > this.pages()) return;
    this.page.set(page);
    this.loadMedia();
  }

  open(media: Media): void {
    this.mediaService.streamUrl(media.id).subscribe({
      next: ({ url }) => this.opened.set({ media, url }),
      error: (error: HttpErrorResponse) => {
        console.error('[VehiclePage] URL de lecture refusée', error.status);
        this.error.set(error.error?.message ?? 'Impossible de lire ce média.');
      },
    });
  }
}
