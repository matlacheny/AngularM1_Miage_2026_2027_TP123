import { Component, input, output } from '@angular/core';
import { Media } from '../../shared/models/media.model';

/** Affiche un média dans la balise adaptée à son type, à partir d'une URL de lecture signée. */
@Component({
  selector: 'app-media-viewer',
  template: `
    <div class="viewer">
      <div class="row">
        <b>{{ media().title }}</b>
        <button type="button" (click)="closed.emit()" aria-label="Fermer la lecture">✕</button>
      </div>
      @switch (media().kind) {
        @case ('image') {
          <img [src]="url()" [alt]="media().title" />
        }
        @case ('video') {
          <video [src]="url()" controls autoplay preload="metadata"></video>
        }
        @case ('audio') {
          <audio [src]="url()" controls autoplay></audio>
        }
      }
    </div>
  `,
  styles: `
    .viewer { display: grid; gap: 0.5rem; margin-bottom: 1rem; padding: 0.8rem; border-radius: 12px; background: #17312a; color: white; }
    img, video { width: 100%; max-height: 60vh; object-fit: contain; border-radius: 8px; background: black; }
    audio { width: 100%; }
  `,
})
export class MediaViewerComponent {
  readonly media = input.required<Media>();
  readonly url = input.required<string>();
  readonly closed = output<void>();
}
