import { Component, input, signal } from '@angular/core';
import { Origin, VehicleCategory } from '../../models/vehicle.model';
import { FlagBackdropComponent } from '../flag-backdrop/flag-backdrop';
import { VehicleSilhouetteComponent } from '../vehicle-silhouette/vehicle-silhouette';

/**
 * Aperçu d'une fiche (catalogue, recherche, fil, favoris) : la photo
 * Wikipédia. Sans photo (ou si elle ne se charge pas) : le drapeau du pays et
 * la silhouette générique de la catégorie.
 * Se place dans un conteneur `position: relative` qui fixe la taille.
 */
@Component({
  selector: 'app-vehicle-visual',
  imports: [FlagBackdropComponent, VehicleSilhouetteComponent],
  template: `
    @if (imageUrl() && !failed()) {
      <img class="photo" [src]="imageUrl()" alt="" loading="lazy" (error)="failed.set(true)" />
    } @else {
      <app-flag-backdrop [origins]="origins()" />
      <app-vehicle-silhouette class="silhouette" [category]="category()" />
    }
  `,
  styles: `
    :host { position: absolute; inset: 0; overflow: hidden; }
    .photo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .silhouette { position: absolute; inset: 14% 12% 8%; }
  `,
})
export class VehicleVisualComponent {
  readonly imageUrl = input<string | null | undefined>(null);
  readonly origins = input<Origin[]>([]);
  readonly category = input.required<VehicleCategory>();

  /** Photo introuvable ou bloquée : on retombe sur drapeau + silhouette. */
  readonly failed = signal(false);
}
