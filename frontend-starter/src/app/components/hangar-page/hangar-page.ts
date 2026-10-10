import { Component, ElementRef, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { HttpErrorResponse, HttpEventType } from '@angular/common/http';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  ACCEPTED_MEDIA,
  KIND_LABELS,
  Media,
  MediaKind,
  VISIBILITY_LABELS,
  Visibility,
  validateMediaFile,
} from '../../shared/models/media.model';
import { Vehicle } from '../../shared/models/vehicle.model';
import { MediaService } from '../../shared/services/media.service';
import { VehicleService } from '../../shared/services/vehicle.service';
import { MediaViewerComponent } from '../media-viewer/media-viewer';
import { VehiclePickerComponent } from '../vehicle-picker/vehicle-picker';

export type UploadStatus = 'idle' | 'uploading' | 'success' | 'error';

/** « Mon hangar » : upload et gestion de mes sons, photos et vidéos. */
@Component({
  imports: [ReactiveFormsModule, RouterLink, MediaViewerComponent, VehiclePickerComponent],
  templateUrl: './hangar-page.html',
  styleUrl: './hangar-page.css',
})
export class HangarPageComponent {
  private readonly service = inject(MediaService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly vehicles = inject(VehicleService);

  /** `?vehicle=` : fiche présélectionnée (bouton « Ajouter un média » d'une fiche). */
  readonly vehicleParam = input<string>(undefined, { alias: 'vehicle' });
  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInputRef');

  readonly accepted = ACCEPTED_MEDIA;
  readonly kindLabels = KIND_LABELS;
  readonly visibilityLabels = VISIBILITY_LABELS;
  readonly kinds: MediaKind[] = ['audio', 'image', 'video'];
  readonly visibilities: Visibility[] = ['private', 'friends', 'public'];

  readonly items = signal<Media[]>([]);
  readonly page = signal(1);
  readonly pages = signal(1);
  readonly kindFilter = signal<MediaKind | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');

  readonly uploadStatus = signal<UploadStatus>('idle');
  readonly uploading = computed(() => this.uploadStatus() === 'uploading');
  readonly uploadProgress = signal(0);
  readonly uploadMessage = signal('');

  /** URL de lecture signée du média actuellement ouvert. */
  readonly opened = signal<{ media: Media; url: string } | null>(null);
  readonly busyId = signal<string | null>(null);

  readonly title = new FormControl('', { nonNullable: true });
  readonly visibility = new FormControl<Visibility>('private', { nonNullable: true });
  /** Fiche choisie dans le sélecteur pour le prochain upload. */
  readonly vehicle = signal<Vehicle | null>(null);

  file?: File;

  constructor() {
    effect(() => {
      const id = this.vehicleParam();
      if (!id) return;
      untracked(() =>
        this.vehicles.get(id).subscribe({
          next: (vehicle) => this.vehicle.set(vehicle),
          error: (error: HttpErrorResponse) => console.error('[HangarPage] Fiche à présélectionner introuvable', error.status),
        }),
      );
    });

    this.load();
  }

  choose(event: Event): void {
    const input = event.target as HTMLInputElement;
    const selected = input.files?.[0];
    this.uploadStatus.set('idle');
    this.uploadMessage.set('');
    this.file = undefined;
    if (!selected) return;

    const problem = validateMediaFile(selected);
    if (problem) {
      console.warn('[HangarPage] Fichier refusé côté frontend', selected.type, selected.size);
      this.uploadMessage.set(problem);
      input.value = '';
      return;
    }
    this.file = selected;
  }

  filter(kind: MediaKind | null): void {
    this.kindFilter.set(kind);
    this.page.set(1);
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.service.list(this.page(), 10, this.kindFilter() ?? undefined).subscribe({
      next: (response) => {
        this.items.set(response.docs);
        this.pages.set(Math.max(1, response.totalPages));
        this.loading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        console.error('[HangarPage] Chargement impossible', error);
        this.error.set(error.error?.message ?? 'Impossible de charger le hangar.');
        this.loading.set(false);
      },
    });
  }

  go(page: number): void {
    if (page < 1 || page > this.pages()) return;
    this.page.set(page);
    this.load();
  }

  upload(): void {
    if (!this.file || this.uploading()) return;

    this.uploadStatus.set('uploading');
    this.uploadProgress.set(0);
    this.uploadMessage.set('');

    const title = this.title.value || this.file.name;
    this.service.upload(this.file, title, this.visibility.value, this.vehicle()?.id).subscribe({
      next: (event) => {
        if (event.type === HttpEventType.UploadProgress && event.total) {
          this.uploadProgress.set(Math.round((100 * event.loaded) / event.total));
          return;
        }
        if (event.type === HttpEventType.Response && event.body) {
          this.uploadStatus.set('success');
          this.uploadMessage.set(`« ${event.body.title} » ajouté au hangar.`);
          this.title.setValue('');
          this.file = undefined;
          const input = this.fileInput()?.nativeElement;
          if (input) input.value = '';
          this.page.set(1);
          this.load();
        }
      },
      error: (error: HttpErrorResponse) => {
        console.error('[HangarPage] Envoi impossible', error);
        this.uploadStatus.set('error');
        this.uploadProgress.set(0);
        this.uploadMessage.set(error.error?.message ?? "Impossible d'envoyer le fichier.");
      },
    });
  }

  /** Demande une URL signée puis l'affiche dans la balise adaptée au type. */
  open(media: Media): void {
    this.service.streamUrl(media.id).subscribe({
      next: ({ url }) => this.opened.set({ media, url }),
      error: (error: HttpErrorResponse) => {
        console.error('[HangarPage] URL de lecture refusée', error);
        this.snackBar.open(error.error?.message ?? 'Impossible de lire ce média.', 'OK', { duration: 5000 });
      },
    });
  }

  close(): void {
    this.opened.set(null);
  }

  changeVisibility(media: Media, event: Event): void {
    const visibility = (event.target as HTMLSelectElement).value as Visibility;
    if (visibility === media.visibility || this.busyId()) return;

    this.busyId.set(media.id);
    this.service.update(media.id, { visibility }).subscribe({
      next: (updated) => {
        this.items.update((list) => list.map((m) => (m.id === updated.id ? updated : m)));
        this.busyId.set(null);
        this.snackBar.open(`« ${updated.title} » : ${VISIBILITY_LABELS[updated.visibility]}.`, 'OK', { duration: 3000 });
      },
      error: (error: HttpErrorResponse) => {
        console.error('[HangarPage] Changement de visibilité impossible', error);
        this.busyId.set(null);
        // Remet la liste dans l'état réel du serveur (le <select> a déjà changé visuellement).
        this.load();
        this.snackBar.open(error.error?.message ?? 'Modification impossible.', 'OK', { duration: 5000 });
      },
    });
  }

  remove(media: Media): void {
    if (this.busyId()) return;
    if (!confirm(`Supprimer « ${media.title} » ? Cette action est irréversible.`)) return;

    this.busyId.set(media.id);
    this.service.delete(media.id).subscribe({
      next: () => this.afterRemoval(media, `« ${media.title} » a été supprimé.`),
      error: (error: HttpErrorResponse) => {
        console.error('[HangarPage] Suppression impossible', error.status);
        if (error.status === 404) {
          this.afterRemoval(media, `« ${media.title} » n'existe plus. La liste a été actualisée.`);
          return;
        }
        this.busyId.set(null);
        this.snackBar.open(error.error?.message ?? 'Suppression impossible.', 'OK', { duration: 5000 });
      },
    });
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} o`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} Ko`;
    return `${(kb / 1024).toFixed(1)} Mo`;
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  private afterRemoval(media: Media, message: string): void {
    this.busyId.set(null);
    this.snackBar.open(message, 'OK', { duration: 4000 });
    if (this.opened()?.media.id === media.id) this.close();
    if (this.items().length === 1 && this.page() > 1) this.page.set(this.page() - 1);
    this.load();
  }
}
