import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { UserProfile } from '../../shared/models/user.model';
import { Origin } from '../../shared/models/vehicle.model';
import { AuthService } from '../../shared/services/auth.service';
import { ProfilePageComponent, bannerOrigin } from './profile-page';

const FR: Origin = { name: 'France', code: 'fr', flagUrl: 'https://commons.wikimedia.org/fr.png' };
const UK: Origin = { name: 'Royaume-Uni', code: 'gb', flagUrl: 'https://commons.wikimedia.org/gb.png' };

const lucas: UserProfile = {
  id: 'u2',
  name: 'Lucas Bernard',
  bio: 'Photographe amateur.',
  location: 'Salon-de-Provence',
  createdAt: '2025-03-12T10:00:00.000Z',
  postCount: 34,
  favorites: [
    { id: 'v1', name: 'Dassault Rafale', category: 'aircraft', countries: ['France'], origins: [FR] },
    { id: 'v4', name: 'Eurofighter Typhoon', category: 'aircraft', countries: ['Royaume-Uni'], origins: [UK] },
    { id: 'v3', name: 'Leclerc', category: 'tank', countries: ['France'], origins: [FR] },
  ],
};

const page = (docs: unknown[] = [], totalPages = 1) => ({ docs, totalDocs: docs.length, limit: 10, page: 1, totalPages });

describe('bannerOrigin', () => {
  it('prend le pays le plus fréquent parmi les favoris', () => {
    expect(bannerOrigin(lucas.favorites)).toEqual([FR]);
    expect(bannerOrigin([])).toEqual([]);
  });
});

describe('ProfilePageComponent', () => {
  let fixture: ComponentFixture<ProfilePageComponent>;
  let component: ProfilePageComponent;
  let http: HttpTestingController;
  let auth: AuthService;

  const element = () => fixture.nativeElement as HTMLElement;
  const render = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
  };
  const expectPosts = (kind: string | null = null): TestRequest =>
    http.expectOne((r) => r.url === '/api/posts/feed' && r.params.get('kind') === kind);

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ProfilePageComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
    auth.currentUser.set({ id: 'u1', name: 'Matteo Lacheny', email: 'm@x.fr', createdAt: '' });
    fixture = TestBed.createComponent(ProfilePageComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => http.verify());

  it("profil d'un autre membre : bandeau, identité, compteurs, favoris, publications de l'auteur", async () => {
    fixture.componentRef.setInput('id', 'u2');
    await render();
    http.expectOne('/api/users/u2').flush(lucas);
    const posts = expectPosts();
    expect(posts.request.params.get('author')).toBe('u2');
    posts.flush(page());
    await render();

    const card = element().querySelector('.profile')!;
    expect(card.querySelector<HTMLElement>('.banner .flag')?.style.backgroundImage).toContain('fr.png');
    expect(card.querySelector('h1')?.textContent).toContain('Lucas Bernard');
    expect(card.textContent).toContain('Salon-de-Provence');
    expect(card.textContent).toContain('Membre depuis mars 2025');
    expect(card.querySelector('.stats')?.textContent).toContain('34');
    expect([...card.querySelectorAll('.fav b')].map((b) => b.textContent)).toEqual(['Dassault Rafale', 'Eurofighter Typhoon', 'Leclerc']);
    expect(card.querySelector('a.fav')?.getAttribute('href')).toBe('/vehicles/v1');
    expect(component.isMe()).toBe(false);
    expect(card.querySelector('.edit-button')).toBeNull();
  });

  it('/profile : charge le profil de l’utilisateur connecté et permet de le modifier', async () => {
    await render();
    http.expectOne('/api/users/u1').flush({ ...lucas, id: 'u1', name: 'Matteo Lacheny' });
    expectPosts().flush(page());
    await render();

    expect(component.isMe()).toBe(true);
    component.startEdit();
    component.form.setValue({ name: 'Matteo Lacheny', location: 'Istres', bio: 'Spotter' });
    component.save();

    const req = http.expectOne('/api/users/me');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ name: 'Matteo Lacheny', location: 'Istres', bio: 'Spotter' });
    req.flush({ id: 'u1', name: 'Matteo Lacheny', email: 'm@x.fr', location: 'Istres', bio: 'Spotter', createdAt: '' });

    expect(component.editing()).toBe(false);
    expect(component.profile()?.location).toBe('Istres');
  });

  it('les onglets filtrent les publications par type', async () => {
    fixture.componentRef.setInput('id', 'u2');
    await render();
    http.expectOne('/api/users/u2').flush(lucas);
    expectPosts().flush(page());

    component.filter('audio');
    expectPosts('audio').flush(page());
    component.filter(null);
    expectPosts().flush(page());
  });

  it('« plus anciennes » charge la page suivante', async () => {
    fixture.componentRef.setInput('id', 'u2');
    await render();
    http.expectOne('/api/users/u2').flush(lucas);
    expectPosts().flush(page([], 2));
    expect(component.hasMore()).toBe(true);

    component.more();
    const next = expectPosts();
    expect(next.request.params.get('page')).toBe('2');
    next.flush({ ...page([]), page: 2, totalPages: 2 });
    expect(component.hasMore()).toBe(false);
  });

  it('profil inconnu : message', async () => {
    fixture.componentRef.setInput('id', 'zz');
    await render();
    http.expectOne('/api/users/zz').flush({ message: 'Utilisateur inconnu' }, { status: 404, statusText: 'Not Found' });
    expectPosts().flush(page());
    await render();
    expect(element().querySelector('[role="alert"]')?.textContent).toContain("n'existe pas");
  });
});
