import { Component, computed, input } from '@angular/core';
import { Origin } from '../../models/vehicle.model';

let nextId = 0;

/**
 * Drapeau(x) du pays d'origine en fond, façon tissu qui flotte :
 *  - légère ondulation (filtre SVG turbulence + déplacement) et flou ;
 *  - plis simulés par des bandes claires/sombres en mode « overlay » ;
 *  - fondu vers la droite et/ou vers le bas (mask-image), comme sur la
 *    maquette, pour que le drapeau se fonde dans le fond sombre.
 * Plusieurs pays (ex. Tigre franco-allemand) : les drapeaux sont juxtaposés.
 */
@Component({
  selector: 'app-flag-backdrop',
  template: `
    <svg class="defs" aria-hidden="true" focusable="false">
      <filter [attr.id]="filterId" x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="fractalNoise" baseFrequency="0.004 0.02" numOctaves="2" seed="7" />
        <feDisplacementMap in="SourceGraphic" scale="18" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
    <div class="flags" [style.filter]="'url(#' + filterId + ') blur(1.2px)'">
      @for (origin of flags(); track origin.name) {
        <div class="flag" [style.background-image]="'url(' + origin.flagUrl + ')'" [attr.title]="origin.name"></div>
      } @empty {
        <div class="flag neutral"></div>
      }
    </div>
    <div class="folds"></div>
  `,
  styles: `
    :host { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
    :host(.fade-right) { mask-image: linear-gradient(to right, #000 65%, transparent 100%); }
    :host(.fade-bottom) { mask-image: linear-gradient(to bottom, #000 55%, transparent 100%); }
    :host(.fade-both) {
      mask-image: linear-gradient(to right, #000 40%, transparent 75%), linear-gradient(to bottom, #000 60%, transparent 100%);
      mask-composite: intersect;
    }
    .defs { position: absolute; width: 0; height: 0; }
    /* Léger débord : l'ondulation ne laisse pas de bord vide (≈ 3 % rogné). */
    .flags { position: absolute; inset: -3%; display: flex; }
    .flag { flex: 1; background-size: cover; background-position: center; filter: saturate(1.15) brightness(0.92); }
    .neutral { background: linear-gradient(120deg, #2b2f35, #1a1c1f); }
    /* Plis du tissu : alternance de reflets et d'ombres verticales. */
    .folds {
      position: absolute;
      inset: 0;
      mix-blend-mode: overlay;
      background: linear-gradient(
        100deg,
        rgba(0, 0, 0, 0.35) 0%,
        rgba(255, 255, 255, 0.28) 14%,
        rgba(0, 0, 0, 0.3) 30%,
        rgba(255, 255, 255, 0.22) 47%,
        rgba(0, 0, 0, 0.32) 63%,
        rgba(255, 255, 255, 0.18) 80%,
        rgba(0, 0, 0, 0.35) 100%
      );
    }
  `,
  host: {
    '[class.fade-right]': "fade() === 'right'",
    '[class.fade-bottom]': "fade() === 'bottom'",
    '[class.fade-both]': "fade() === 'both'",
  },
})
export class FlagBackdropComponent {
  readonly origins = input<Origin[]>([]);
  readonly fade = input<'none' | 'right' | 'bottom' | 'both'>('none');

  /** Identifiant unique : plusieurs drapeaux peuvent coexister sur une page. */
  readonly filterId = `flag-wave-${nextId++}`;

  /** Seuls les pays dont Wikidata connaît le drapeau ; deux au maximum. */
  readonly flags = computed(() => this.origins().filter((o) => o.flagUrl).slice(0, 2));
}
