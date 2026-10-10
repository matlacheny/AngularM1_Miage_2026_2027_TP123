import { Component, input } from '@angular/core';
import { VehicleCategory } from '../../models/vehicle.model';

/**
 * Silhouette générique (vue de face) selon la catégorie, posée sur le
 * drapeau des cartes du catalogue, comme sur la maquette.
 */
@Component({
  selector: 'app-vehicle-silhouette',
  template: `
    <svg viewBox="0 0 200 110" role="img" [attr.aria-label]="label()">
      @switch (category()) {
        @case ('aircraft') {
          <!-- Chasseur vu de face : dérive, fuselage, voilure, entrées d'air, train -->
          <path d="M100 8 L104 40 L104 62 L96 62 L96 40 Z" />
          <rect x="18" y="60" width="164" height="5" rx="2.5" />
          <rect x="14" y="54" width="5" height="16" rx="2" />
          <rect x="181" y="54" width="5" height="16" rx="2" />
          <ellipse cx="100" cy="62" rx="13" ry="12" />
          <circle cx="83" cy="66" r="7" />
          <circle cx="117" cy="66" r="7" />
          <rect x="99" y="72" width="3" height="18" />
          <rect x="72" y="70" width="3" height="16" />
          <rect x="125" y="70" width="3" height="16" />
        }
        @case ('helicopter') {
          <!-- Hélicoptère vu de face : rotor, mât, cabine, ailettes, patins -->
          <rect x="12" y="20" width="176" height="4" rx="2" />
          <rect x="97" y="22" width="6" height="16" />
          <path d="M72 70 Q72 38 100 36 Q128 38 128 70 Q128 84 100 86 Q72 84 72 70 Z" />
          <rect x="52" y="64" width="96" height="6" rx="3" />
          <rect x="82" y="86" width="4" height="10" />
          <rect x="114" y="86" width="4" height="10" />
          <rect x="66" y="95" width="68" height="4" rx="2" />
        }
        @case ('tank') {
          <!-- Char vu de face : chenilles, caisse, tourelle et bouche du canon -->
          <path d="M20 96 L32 70 L168 70 L180 96 Z" />
          <rect x="16" y="92" width="44" height="12" rx="4" />
          <rect x="140" y="92" width="44" height="12" rx="4" />
          <path d="M58 70 L72 42 L128 42 L142 70 Z" />
          <rect x="112" y="32" width="12" height="12" rx="2" />
          <circle cx="100" cy="56" r="5" fill="#1a1c1f" />
        }
        @default {
          <!-- Blindé à roues vu de face -->
          <path d="M34 88 L40 50 L160 50 L166 88 Z" />
          <path d="M70 50 L80 34 L120 34 L130 50 Z" />
          <rect x="96" y="22" width="8" height="14" />
          <rect x="30" y="84" width="22" height="20" rx="6" />
          <rect x="148" y="84" width="22" height="20" rx="6" />
          <rect x="62" y="62" width="76" height="6" rx="3" fill="#1a1c1f" />
        }
      }
    </svg>
  `,
  styles: `
    :host { display: block; }
    svg { width: 100%; height: 100%; fill: #cfd2d6; filter: drop-shadow(0 10px 12px rgba(0, 0, 0, 0.45)); }
  `,
})
export class VehicleSilhouetteComponent {
  readonly category = input.required<VehicleCategory>();
  readonly label = input('');
}
