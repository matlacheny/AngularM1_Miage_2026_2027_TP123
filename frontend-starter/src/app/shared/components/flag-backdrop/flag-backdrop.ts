import { Component, computed, input } from '@angular/core';
import { Origin } from '../../models/vehicle.model';

let nextId = 0;

/** Inclinaison des bandes : décalage horizontal entre le haut et le bas d'un bord, en % de la zone. */
const SLANT = 16;

/**
 * Drapeau(x) du pays d'origine en fond, façon tissu qui flotte :
 *  - légère ondulation (filtre SVG turbulence + déplacement) et flou ;
 *  - plis simulés par des bandes claires/sombres en mode « overlay » ;
 *  - fondu vers la droite et/ou vers le bas (mask-image), comme sur la
 *    maquette, pour que le drapeau se fonde dans le fond sombre.
 * Plusieurs pays (ex. Tigre franco-allemand) : les drapeaux sont juxtaposés.
 *
 * `layout="bands"` (bandeau d'une fiche) : la zone garde sa largeur quel que
 * soit le nombre de pays, et chaque drapeau occupe une bande oblique, étiré
 * pour rester entier : tous les pays sont visibles, même à 3 ou 4.
 */
@Component({
  selector: 'app-flag-backdrop',
  template: `
    <svg class="defs" aria-hidden="true" focusable="false">
      <filter [attr.id]="filterId" x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="fractalNoise" baseFrequency="0.004 0.02" numOctaves="2" seed="7" />
        <feDisplacementMap in="SourceGraphic" [attr.scale]="layout() === 'bands' ? 10 : 18" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
    <div class="flags" [style.filter]="'url(#' + filterId + ')' + (layout() === 'bands' ? '' : ' blur(1.2px)')">
      @if (layout() === 'bands') {
        @for (band of bands(); track band.origin.name) {
          <div
            class="flag band"
            [style.background-image]="'url(' + band.origin.flagUrl + ')'"
            [style.left.%]="band.left"
            [style.width.%]="band.width"
            [style.clip-path]="band.clipPath"
            [attr.title]="band.origin.name"
          ></div>
        }
      } @else {
        @for (origin of flags(); track origin.name) {
          <div class="flag" [style.background-image]="'url(' + origin.flagUrl + ')'" [attr.title]="origin.name"></div>
        }
      }
      @if (!flags().length) {
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
    /* Bande oblique : le drapeau est étiré sur toute la bande, donc toujours entier. */
    .band { position: absolute; top: 0; bottom: 0; background-size: 100% 100%; }
    .neutral { flex: 1; background: linear-gradient(120deg, #2b2f35, #1a1c1f); }
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
  /** `side` : drapeaux juxtaposés (deux au plus) ; `bands` : tous, en bandes obliques. */
  readonly layout = input<'side' | 'bands'>('side');

  /** Identifiant unique : plusieurs drapeaux peuvent coexister sur une page. */
  readonly filterId = `flag-wave-${nextId++}`;

  /** Seuls les pays dont Wikidata connaît le drapeau ; deux au maximum, sauf en bandes. */
  readonly flags = computed(() => {
    const known = this.origins().filter((o) => o.flagUrl);
    return this.layout() === 'bands' ? known : known.slice(0, 2);
  });

  /**
   * Bandes obliques, en % de la zone. Chaque élément couvre sa bande et le
   * débord de l'oblique (SLANT) ; `clip-path` en découpe les bords inclinés.
   * La première et la dernière bande gardent un bord droit côté extérieur.
   */
  readonly bands = computed(() => {
    const flags = this.flags();
    const n = flags.length;
    const half = SLANT / 2;
    return flags.map((origin, i) => {
      const left = (i * 100) / n;
      const right = ((i + 1) * 100) / n;
      const x0 = i ? left - half : 0;
      const x1 = i < n - 1 ? right + half : 100;
      const at = (x: number) => +(((x - x0) / (x1 - x0)) * 100).toFixed(2);
      const topLeft = i ? at(left + half) : 0;
      const bottomLeft = i ? at(left - half) : 0;
      const topRight = i < n - 1 ? at(right + half) : 100;
      const bottomRight = i < n - 1 ? at(right - half) : 100;
      return {
        origin,
        left: x0,
        width: x1 - x0,
        clipPath: `polygon(${topLeft}% 0, ${topRight}% 0, ${bottomRight}% 100%, ${bottomLeft}% 100%)`,
      };
    });
  });
}
