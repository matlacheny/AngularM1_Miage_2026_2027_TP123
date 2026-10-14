import { Component, inject, input, linkedSignal, output, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { IconComponent } from '../../shared/components/icon/icon';
import { Relation } from '../../shared/models/friend.model';
import { FriendService } from '../../shared/services/friend.service';

/**
 * Bouton de relation avec un membre (profil, recherche) :
 *  - aucun lien    → « Inviter dans l'escadrille » ;
 *  - envoyée       → « Invitation envoyée » (annulable) ;
 *  - reçue         → « Accepter » / « Refuser » ;
 *  - ami           → « Dans votre escadrille » (menu : retirer).
 */
@Component({
  selector: 'app-relation-button',
  imports: [IconComponent],
  template: `
    @switch (state().status) {
      @case ('none') {
        <button type="button" [disabled]="busy()" (click)="invite()"><app-icon name="plus" /> Inviter dans l'escadrille</button>
      }
      @case ('outgoing') {
        <button type="button" class="secondary" [disabled]="busy()" (click)="dismiss()" title="Cliquer pour annuler">
          <app-icon name="send" /> Invitation envoyée · Annuler
        </button>
      }
      @case ('incoming') {
        <button type="button" [disabled]="busy()" (click)="accept()"><app-icon name="check" /> Accepter l'invitation</button>
        <button type="button" class="secondary" [disabled]="busy()" (click)="dismiss()">Refuser</button>
      }
      @case ('friend') {
        <span class="member"><app-icon name="check" /> Dans votre escadrille</span>
        <div class="menu">
          <button type="button" class="secondary icon" aria-label="Options de l'escadrille" [attr.aria-expanded]="menuOpen()" (click)="menuOpen.set(!menuOpen())">
            <app-icon name="more" />
          </button>
          @if (menuOpen()) {
            <div class="menu-panel" role="menu">
              <button type="button" class="ghost danger-text" role="menuitem" [disabled]="busy()" (click)="remove()">
                <app-icon name="x" /> Retirer de l'escadrille
              </button>
            </div>
          }
        </div>
      }
    }
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }
  `,
  styles: `
    :host { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
    button { padding: 0.55rem 1rem; font-size: 0.92rem; }
    .member { display: inline-flex; align-items: center; gap: 0.45rem; padding: 0.5rem 1rem; color: var(--text); font-size: 0.92rem; font-weight: 600; border: 1.5px solid var(--success); border-radius: 10px; }
    .member app-icon { color: var(--success); }
    .icon { padding: 0.55rem 0.7rem; }
    .menu { position: relative; }
    .menu-panel { position: absolute; z-index: 5; top: calc(100% + 0.3rem); right: 0; padding: 0.3rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: 10px; box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45); }
    .menu-panel button { white-space: nowrap; }
    .danger-text { color: var(--danger); }
    .error { flex-basis: 100%; margin: 0; font-size: 0.85rem; }
  `,
})
export class RelationButtonComponent {
  private readonly friends = inject(FriendService);

  readonly userId = input.required<string>();
  readonly relation = input.required<Relation>();
  /** Nouvelle relation après une action (le parent peut recharger ses compteurs). */
  readonly changed = output<Relation>();

  readonly state = linkedSignal(() => this.relation());
  readonly busy = signal(false);
  readonly menuOpen = signal(false);
  readonly error = signal('');

  invite(): void {
    this.run(this.friends.invite(this.userId()), (r) => r);
  }

  accept(): void {
    const requestId = this.state().requestId;
    if (requestId) this.run(this.friends.accept(requestId), (r) => r);
  }

  /** Refuse une invitation reçue ou annule une invitation envoyée. */
  dismiss(): void {
    const requestId = this.state().requestId;
    if (requestId) this.run(this.friends.dismiss(requestId), () => ({ status: 'none', requestId: null }));
  }

  remove(): void {
    this.menuOpen.set(false);
    if (!confirm('Retirer ce membre de votre escadrille ? Vos partages mutuels seront arrêtés.')) return;
    this.run(this.friends.remove(this.userId()), () => ({ status: 'none', requestId: null }));
  }

  private run<T>(request: Observable<T>, next: (result: T) => Relation): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    request.subscribe({
      next: (result) => {
        const relation = next(result);
        this.state.set(relation);
        this.busy.set(false);
        this.changed.emit(relation);
      },
      error: (error: HttpErrorResponse) => {
        console.error('[RelationButton] Action impossible', error.status);
        this.error.set(error.error?.message ?? 'Action impossible.');
        this.busy.set(false);
      },
    });
  }
}
