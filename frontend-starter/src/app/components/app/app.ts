import { Component, computed, effect, inject, untracked } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { IconComponent } from '../../shared/components/icon/icon';
import { AuthService } from '../../shared/services/auth.service';
import { FriendService } from '../../shared/services/friend.service';
import { initials } from '../../shared/utils/format';

/** Structure de l'application : barre latérale (connecté) ou page publique. */
@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, ReactiveFormsModule, IconComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class AppComponent {
  private readonly router = inject(Router);
  readonly auth = inject(AuthService);
  readonly friends = inject(FriendService);

  readonly search = new FormControl('', { nonNullable: true });

  /** « Matteo Lacheny » → « ML » pour l'avatar. */
  readonly initials = computed(() => initials(this.auth.currentUser()?.name));

  constructor() {
    // À chaque ouverture de session (rechargement ou connexion) :
    //  - profil, si seul le token est en mémoire (nom de la barre latérale) ;
    //  - escadrille, pour la pastille des invitations reçues.
    effect(() => {
      if (!this.auth.token()) return;
      untracked(() => {
        if (!this.auth.currentUser()) {
          this.auth.profile().subscribe({
            error: (error: unknown) => console.error('[AppComponent] Profil indisponible', error),
          });
        }
        this.friends.squadron().subscribe({
          error: (error: unknown) => console.error('[AppComponent] Escadrille indisponible', error),
        });
      });
    });
  }

  /** Recherche de la barre latérale : ouvre le catalogue filtré. */
  searchVehicles(): void {
    const q = this.search.value.trim();
    void this.router.navigate(['/vehicles'], { queryParams: q ? { q } : {} });
  }

  logout(): void {
    this.auth.logout();
    console.debug('[AppComponent] Déconnexion');
    void this.router.navigateByUrl('/login');
  }
}
