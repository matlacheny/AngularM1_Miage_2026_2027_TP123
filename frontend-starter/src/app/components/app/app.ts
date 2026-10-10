import { Component, computed, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { IconComponent } from '../../shared/components/icon/icon';
import { AuthService } from '../../shared/services/auth.service';
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

  readonly search = new FormControl('', { nonNullable: true });

  /** « Matteo Lacheny » → « ML » pour l'avatar. */
  readonly initials = computed(() => initials(this.auth.currentUser()?.name));

  constructor() {
    // Après un rechargement, seul le token est en mémoire : on récupère le
    // profil pour afficher le nom dans la barre latérale.
    if (this.auth.token() && !this.auth.currentUser()) {
      this.auth.profile().subscribe({
        error: (error: unknown) => console.error('[AppComponent] Profil indisponible', error),
      });
    }
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
