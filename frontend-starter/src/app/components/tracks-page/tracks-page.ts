import { Component, ElementRef, OnDestroy, computed, inject, signal, viewChild } from '@angular/core';
import { HttpErrorResponse, HttpEventType } from '@angular/common/http';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subscription, debounceTime, distinctUntilChanged } from 'rxjs';
import { ALLOWED_AUDIO_TYPES, MAX_AUDIO_SIZE, Track } from '../../shared/models/track.model';
import { TrackService } from '../../shared/services/track.service';

export type UploadStatus = 'idle' | 'uploading' | 'success' | 'error';

@Component({
  imports: [ReactiveFormsModule],
  templateUrl: './tracks-page.html',
  styleUrl: './tracks-page.css',
})
export class TracksPageComponent implements OnDestroy {
  private readonly service = inject(TrackService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInputRef');

  readonly tracks = signal<Track[]>([]);
  readonly page = signal(1);
  readonly pages = signal(1);
  readonly loading = signal(false);
  readonly error = signal('');

  /**
   * État explicite de l'upload (Mission 6) : aucun envoi, envoi en cours
   * (avec `uploadProgress` en %), réussite ou échec du dernier envoi.
   */
  readonly uploadStatus = signal<UploadStatus>('idle');
  readonly uploading = computed(() => this.uploadStatus() === 'uploading');
  readonly uploadProgress = signal(0);
  readonly uploadError = signal('');
  readonly uploadSuccess = signal('');

  readonly audioUrl = signal('');
  readonly playingTrack = signal<Track | null>(null);
  readonly audioError = signal('');

  /** Identifiant de la piste en cours de suppression (Mission 5), `null` sinon. */
  readonly deletingId = signal<string | null>(null);

  readonly title = new FormControl('', { nonNullable: true });

  /** Filtre par titre (amélioration facultative), débattu pour éviter une requête par frappe. */
  readonly search = new FormControl('', { nonNullable: true });
  private readonly searchSubscription: Subscription;

  file?: File;

  constructor() {
    this.load();

    this.searchSubscription = this.search.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged())
      .subscribe(() => {
        // Toute nouvelle recherche repart de la page 1 : un résultat filtré
        // n'a aucune raison d'avoir le même nombre de pages que la liste complète.
        this.page.set(1);
        this.load();
      });
  }

  /** Called when the user picks a file: validated immediately, before any HTTP call. */
  choose(event: Event): void {
    const input = event.target as HTMLInputElement;
    const selected = input.files?.[0];
    this.uploadError.set('');
    this.uploadSuccess.set('');
    this.uploadStatus.set('idle');

    if (!selected) {
      this.file = undefined;
      return;
    }

    if (!ALLOWED_AUDIO_TYPES.has(selected.type)) {
      console.warn('[TracksPage] Format refusé côté frontend', selected.type);
      this.uploadError.set(
        `Format non supporté (${selected.type || 'inconnu'}). Formats acceptés : MP3, WAV, OGG, M4A.`,
      );
      this.file = undefined;
      input.value = '';
      return;
    }

    if (selected.size > MAX_AUDIO_SIZE) {
      console.warn('[TracksPage] Fichier trop volumineux côté frontend', selected.size);
      this.uploadError.set(`Fichier trop volumineux (${this.formatSize(selected.size)}). 25 Mo maximum.`);
      this.file = undefined;
      input.value = '';
      return;
    }

    this.file = selected;
    console.debug('[TracksPage] Fichier sélectionné', selected.name);
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.service.list(this.page(), 5, this.search.value.trim() || undefined).subscribe({
      next: (response) => {
        // AVANCÉ (facultatif) : le backend pagine désormais avec
        // mongoose-aggregate-paginate-v2, qui renvoie `docs`/`totalPages`
        // plutôt que le `items`/`pages` écrit à la main précédemment.
        console.debug('[TracksPage] Pistes chargées', response.docs.length);
        this.tracks.set(response.docs);
        this.pages.set(response.totalPages);
        this.loading.set(false);
      },
      error: (error: { error?: { message?: string } }) => {
        console.error('[TracksPage] Chargement impossible', error);
        this.error.set(error.error?.message ?? 'Impossible de charger la bibliothèque.');
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
    // Garde-fou redondant avec [disabled] sur le bouton : empêche toute double
    // soumission même si upload() est appelée autrement qu'via ce bouton.
    if (!this.file || this.uploading()) return;

    this.uploadStatus.set('uploading');
    this.uploadProgress.set(0);
    this.uploadError.set('');
    this.uploadSuccess.set('');
    this.title.disable();

    this.service.upload(this.file, this.title.value || this.file.name).subscribe({
      next: (event) => {
        // HttpEventType.UploadProgress arrive plusieurs fois pendant l'envoi ;
        // HttpEventType.Response arrive une seule fois, à la toute fin, avec le corps JSON.
        if (event.type === HttpEventType.UploadProgress && event.total) {
          this.uploadProgress.set(Math.round((100 * event.loaded) / event.total));
          return;
        }

        if (event.type === HttpEventType.Response && event.body) {
          const track = event.body;
          console.debug('[TracksPage] Piste envoyée', track.id);
          this.uploadStatus.set('success');
          this.uploadProgress.set(100);
          this.uploadSuccess.set(`« ${track.title} » envoyée avec succès.`);
          this.title.enable();
          this.title.setValue('');
          this.file = undefined;
          this.resetFileInput();
          this.page.set(1);
          this.load();
        }
      },
      error: (error: { error?: { message?: string } }) => {
        console.error('[TracksPage] Envoi impossible', error);
        this.uploadStatus.set('error');
        this.uploadProgress.set(0);
        this.uploadError.set(error.error?.message ?? "Impossible d'envoyer le fichier.");
        this.title.enable();
      },
    });
  }

  play(track: Track): void {
    this.audioError.set('');
    this.service.audio(track.id).subscribe({
      next: (blob) => {
        console.debug('[TracksPage] Audio chargé', track.id);
        const previousUrl = this.audioUrl();
        if (previousUrl) URL.revokeObjectURL(previousUrl);
        this.audioUrl.set(URL.createObjectURL(blob));
        this.playingTrack.set(track);
      },
      error: (error: { error?: { message?: string } }) => {
        console.error('[TracksPage] Lecture impossible', error);
        this.audioError.set(error.error?.message ?? 'Impossible de lire cette piste.');
      },
    });
  }

  /** Bound to the <audio> element's (error) event: decoding/network failures after the Blob was loaded. */
  onAudioError(): void {
    console.error('[TracksPage] Erreur de lecture audio (élément <audio>)');
    this.audioError.set('Erreur de lecture du fichier audio.');
  }

  remove(track: Track): void {
    // Une seule suppression à la fois : bloque les doubles clics, même si
    // remove() est appelée autrement que par le bouton désactivé.
    if (this.deletingId()) return;

    const confirmed = confirm(`Supprimer « ${track.title} » ? Cette action est irréversible.`);
    if (!confirmed) return;

    this.deletingId.set(track.id);
    this.service.delete(track.id).subscribe({
      next: () => {
        console.debug('[TracksPage] Piste supprimée', track.id);
        this.deletingId.set(null);
        this.snackBar.open(`« ${track.title} » a été supprimée.`, 'OK', { duration: 4000 });
        this.refreshAfterRemoval(track);
      },
      error: (error: HttpErrorResponse) => {
        console.error('[TracksPage] Suppression impossible', error.status);
        this.deletingId.set(null);

        // Le backend répond 404 aussi bien pour une piste déjà supprimée
        // (autre onglet) que pour une piste d'un autre utilisateur : il ne
        // révèle jamais l'existence d'une piste qui n'est pas la nôtre.
        if (error.status === 404) {
          this.snackBar.open(
            `« ${track.title} » n'existe plus ou ne vous appartient pas. La liste a été actualisée.`,
            'OK',
            { duration: 6000 },
          );
          this.refreshAfterRemoval(track);
          return;
        }

        // Le 401 est déjà traité par errorInterceptor (déconnexion + /login).
        this.snackBar.open(error.error?.message ?? 'Impossible de supprimer cette piste.', 'OK', {
          duration: 6000,
        });
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
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  formatType(mimeType: string): string {
    const known: Record<string, string> = {
      'audio/mpeg': 'MP3',
      'audio/wav': 'WAV',
      'audio/x-wav': 'WAV',
      'audio/ogg': 'OGG',
      'audio/mp4': 'M4A',
      'audio/x-m4a': 'M4A',
    };
    return known[mimeType] ?? mimeType;
  }

  private resetFileInput(): void {
    const input = this.fileInput()?.nativeElement;
    if (input) input.value = '';
  }

  /** Arrête la lecture si besoin puis recharge la page courante (ou la précédente si elle devient vide). */
  private refreshAfterRemoval(track: Track): void {
    if (this.playingTrack()?.id === track.id) {
      this.stopPlayback();
    }

    // Si on vient de retirer la dernière piste visible d'une page qui n'est
    // pas la première, on recule d'une page plutôt que d'afficher une page vide.
    if (this.tracks().length === 1 && this.page() > 1) {
      this.page.set(this.page() - 1);
    }

    this.load();
  }

  private stopPlayback(): void {
    const url = this.audioUrl();
    if (url) URL.revokeObjectURL(url);
    this.audioUrl.set('');
    this.playingTrack.set(null);
  }

  /** Revokes the last ObjectURL so it doesn't leak once this component is destroyed (route change). */
  ngOnDestroy(): void {
    const url = this.audioUrl();
    if (url) URL.revokeObjectURL(url);
    this.searchSubscription.unsubscribe();
  }
}
