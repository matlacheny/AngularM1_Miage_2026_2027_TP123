import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService } from '../../shared/services/auth.service';
import { AppComponent } from './app';

describe('AppComponent', () => {
  let http: HttpTestingController;

  const create = (): ComponentFixture<AppComponent> => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    return fixture;
  };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('déconnecté : pas de barre latérale', () => {
    const fixture = create();
    expect((fixture.nativeElement as HTMLElement).querySelector('aside.sidebar')).toBeNull();
  });

  it('connecté : barre latérale avec navigation et carte utilisateur (profil rechargé)', async () => {
    TestBed.inject(AuthService).token.set('jwt');
    const fixture = create();
    http.expectOne('/api/users/me').flush({ id: 'u1', name: 'Matteo Lacheny', email: 'm@example.com', createdAt: '' });
    fixture.detectChanges();
    await fixture.whenStable();

    const sidebar = (fixture.nativeElement as HTMLElement).querySelector('aside.sidebar')!;
    expect([...sidebar.querySelectorAll('nav a')].map((a) => a.textContent?.trim())).toEqual(['Accueil', 'Véhicules', 'Profil']);
    expect(sidebar.querySelector('.avatar')?.textContent).toBe('ML');
    expect(sidebar.querySelector('.user-card b')?.textContent).toContain('Matteo Lacheny');
  });

  it('la recherche de la barre latérale ouvre le catalogue filtré', () => {
    TestBed.inject(AuthService).token.set('jwt');
    const fixture = create();
    http.expectOne('/api/users/me').flush({ id: 'u1', name: 'M', email: 'm@example.com', createdAt: '' });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    fixture.componentInstance.search.setValue('  Rafale ');
    fixture.componentInstance.searchVehicles();
    expect(navigate).toHaveBeenCalledWith(['/vehicles'], { queryParams: { q: 'Rafale' } });
  });
});
