import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { AudioPlayerComponent } from '../../shared/components/audio-player/audio-player';
import { FlagBackdropComponent } from '../../shared/components/flag-backdrop/flag-backdrop';
import { IconComponent } from '../../shared/components/icon/icon';
import { VehicleSilhouetteComponent } from '../../shared/components/vehicle-silhouette/vehicle-silhouette';
import { KIND_LABELS, Media, MediaKind } from '../../shared/models/media.model';
import { CATEGORY_GROUPS, CATEGORY_LABELS, Vehicle } from '../../shared/models/vehicle.model';
import { AuthService } from '../../shared/services/auth.service';
import { UserService } from '../../shared/services/user.service';
import { VehicleService } from '../../shared/services/vehicle.service';
import { MediaViewerComponent } from '../media-viewer/media-viewer';

/**
 * Fiche d'un véhicule (maquette « Fiche véhicule ») :
 *  - bandeau : drapeau du pays en fondu, photo Wikipédia, catégorie et nom ;
 *  - carte Résumé (texte Wikipédia, origine, catégorie, nombre de publications) ;
 *  - carte Sons (lecteur + liste) ;
 *  - en bas, séparées, les publications filtrables.
 * Les listes renvoient une URL de lecture signée par média : aucune requête
 * supplémentaire pour les vignettes ni pour le lecteur.
 */
@Component({
  imports: [
    RouterLink,
    MediaViewerComponent,
    AudioPlayerComponent,
    FlagBackdropComponent,
    IconComponent,
    VehicleSilhouetteComponent,
  ],
  templateUrl: './vehicle-page.html',
  styleUrl: './vehicle-page.css',
})
export class VehiclePageComponent {
  private readonly vehicles = inject(VehicleService);
  private readonly users = inject(UserService);
  private readonly auth = inject(AuthService);

  /** Paramètre `:id` de la route (withComponentInputBinding). */
  readonly id = input.required<string>();

  readonly categoryLabels = CATEGORY_LABELS;
  readonly categoryGroups = CATEGORY_GROUPS;
  readonly kindLabels = KIND_LABELS;
  readonly kinds: MediaKind[] = ['audio', 'image', 'video'];

  readonly vehicle = signal<Vehicle | null>(null);
  readonly notFound = signal(false);

  /** Sons de la fiche et son sélectionné dans le lecteur. */
  readonly sounds = signal<Media[]>([]);
  readonly currentSoundId = signal<string | null>(null);
  readonly currentSound = computed(() => this.sounds().find((s) => s.id === this.currentSoundId()) ?? null);
  readonly soundError = signal('');

  /** Publications filtrables et paginées. */
  readonly postKind = signal<MediaKind | null>(null);
  readonly posts = signal<Media[]>([]);
  readonly totalPosts = signal(0);
  readonly page = signal(1);
  readonly pages = signal(1);
  readonly loadingPosts = signal(false);
  readonly error = signal('');
  readonly opened = signal<Media | null>(null);

  /** Un drapeau fait 3:2 ; plusieurs drapeaux sont juxtaposés, chacun en entier. */
  readonly flagRatio = computed(() => {
    const flags = (this.vehicle()?.origins ?? []).filter((o) => o.flagUrl).slice(0, 2).length;
    return `${1.5 * Math.max(1, flags)} / 1`;
  });

  /** Étoile du bandeau : la fiche fait-elle partie de mes véhicules préférés ? */
  readonly isFavorite = computed(() => this.auth.currentUser()?.favoriteVehicleIds?.includes(this.id()) ?? false);
  readonly favoriteBusy = signal(false);
  readonly favoriteError = signal('');

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
    this.sounds.set([]);
    this.currentSoundId.set(null);
    this.opened.set(null);
    this.postKind.set(null);
    this.page.set(1);

    this.vehicles.get(id).subscribe({
      next: (vehicle) => this.vehicle.set(vehicle),
      error: (error: HttpErrorResponse) => {
        console.error('[VehiclePage] Fiche introuvable', error.status);
        this.notFound.set(true);
      },
    });
    this.loadSounds();
    this.loadPosts();
  }

  /** Sons de la fiche ; le premier est prêt dans le lecteur (sans lecture automatique). */
  private loadSounds(): void {
    this.soundError.set('');
    this.vehicles.media(this.id(), 'audio', 1, 20).subscribe({
      next: (response) => {
        this.sounds.set(response.docs);
        this.currentSoundId.set(response.docs[0]?.id ?? null);
      },
      error: (error: HttpErrorResponse) => {
        console.error('[VehiclePage] Sons indisponibles', error.status);
        this.soundError.set(error.error?.message ?? 'Impossible de charger les sons.');
      },
    });
  }

  selectSound(sound: Media): void {
    this.currentSoundId.set(sound.id);
  }

  loadPosts(): void {
    this.loadingPosts.set(true);
    this.error.set('');
    const kind = this.postKind();
    this.vehicles.media(this.id(), kind ?? undefined, this.page(), 9).subscribe({
      next: (response) => {
        this.posts.set(response.docs);
        this.pages.set(Math.max(1, response.totalPages));
        if (!kind) this.totalPosts.set(response.totalDocs);
        this.loadingPosts.set(false);
      },
      error: (error: HttpErrorResponse) => {
        console.error('[VehiclePage] Publications indisponibles', error);
        this.error.set(error.error?.message ?? 'Impossible de charger les publications.');
        this.loadingPosts.set(false);
      },
    });
  }

  filter(kind: MediaKind | null): void {
    this.postKind.set(kind);
    this.page.set(1);
    this.loadPosts();
  }

  go(page: number): void {
    if (page < 1 || page > this.pages()) return;
    this.page.set(page);
    this.loadPosts();
  }

  toggleFavorite(): void {
    if (this.favoriteBusy()) return;
    this.favoriteBusy.set(true);
    this.favoriteError.set('');
    this.users.setFavorite(this.id(), !this.isFavorite()).subscribe({
      next: () => this.favoriteBusy.set(false),
      error: (error: HttpErrorResponse) => {
        console.error('[VehiclePage] Favori impossible', error.status);
        this.favoriteError.set(error.error?.message ?? 'Impossible de modifier les favoris.');
        this.favoriteBusy.set(false);
      },
    });
  }

  open(media: Media): void {
    this.opened.set(media);
  }
}
