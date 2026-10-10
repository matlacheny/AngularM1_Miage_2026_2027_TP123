import { Component, computed, input } from '@angular/core';
import { avatarColor, initials } from '../../utils/format';

/** Pastille ronde avec les initiales, couleur stable par personne. `accent` : ambre (moi). */
@Component({
  selector: 'app-avatar',
  template: `{{ letters() }}`,
  styles: `
    :host {
      display: inline-flex;
      flex-shrink: 0;
      align-items: center;
      justify-content: center;
      width: var(--avatar-size, 2.6rem);
      height: var(--avatar-size, 2.6rem);
      font-size: calc(var(--avatar-size, 2.6rem) * 0.36);
      font-weight: 700;
      color: #f2f3f4;
      border-radius: 50%;
    }
    :host(.accent) { color: #17130a; }
  `,
  host: {
    '[style.background]': "accent() ? 'var(--accent)' : color()",
    '[class.accent]': 'accent()',
    'aria-hidden': 'true',
  },
})
export class AvatarComponent {
  readonly name = input<string | null | undefined>('');
  readonly accent = input(false);

  readonly letters = computed(() => initials(this.name()));
  readonly color = computed(() => avatarColor(this.name()));
}
