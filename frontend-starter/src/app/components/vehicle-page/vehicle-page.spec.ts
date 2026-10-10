import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { Media, MediaKind } from '../../shared/models/media.model';
import { Vehicle } from '../../shared/models/vehicle.model';
import { AuthService } from '../../shared/services/auth.service';
import { VehiclePageComponent } from './vehicle-page';

const tigre: Vehicle = {
  id: 'v1',
  wikidataId: 'Q159601',
  name: 'Eurocopter EC665 Tigre',
  category: 'helicopter',
  countries: ['Allemagne', 'France'],
  origins: [
    { name: 'Allemagne', code: 'de', flagUrl: 'https://commons.wikimedia.org/de.png' },
    { name: 'France', code: 'fr', flagUrl: 'https://commons.wikimedia.org/fr.png' },
  ],
  summary: "Hélicoptère d'attaque.",
  imageUrl: 'https://upload.wikimedia.org/tigre.jpg',
  wikipediaUrl: 'https://fr.wikipedia.org/wiki/Eurocopter_EC665_Tigre',
  createdAt: '2026-10-08T10:00:00.000Z',
};

const media = (id: string, kind: MediaKind, title = id): Media => ({
  id,
  ownerId: 'u2',
  owner: { id: 'u2', name: 'Lucas Bernard' },
  kind,
  title,
  originalName: `${id}.bin`,
  mimeType: kind === 'audio' ? 'audio/mpeg' : kind === 'image' ? 'image/jpeg' : 'video/mp4',
  size: 1000,
  visibility: 'public',
  vehicle: { id: 'v1', name: 'Eurocopter EC665 Tigre' },
  url: `/api/media/${id}/file?token=t-${id}`,
  createdAt: '2026-10-08T10:00:00.000Z',
});

const page = (docs: Media[], totalDocs = docs.length) => ({ docs, totalDocs, limit: 9, page: 1, totalPages: 1 });

describe('VehiclePageComponent', () => {
  let fixture: ComponentFixture<VehiclePageComponent>;
  let component: VehiclePageComponent;
  let http: HttpTestingController;

  const expectSounds = (id = 'v1'): TestRequest =>
    http.expectOne((r) => r.url === `/api/vehicles/${id}/media` && r.params.get('kind') === 'audio');
  const expectPosts = (id = 'v1', kind: string | null = null): TestRequest =>
    http.expectOne((r) => r.url === `/api/vehicles/${id}/media` && r.params.get('kind') === kind && r.params.get('limit') === '9');

  /** Répond aux 3 requêtes initiales : fiche, sons, publications. */
  const flushInitial = (sounds: Media[] = [], posts: Media[] = [], vehicle: Vehicle = tigre) => {
    http.expectOne(`/api/vehicles/${vehicle.id}`).flush(vehicle);
    expectSounds(vehicle.id).flush(page(sounds));
    expectPosts(vehicle.id).flush(page(posts));
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [VehiclePageComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(VehiclePageComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('id', 'v1');
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  const element = () => fixture.nativeElement as HTMLElement;
  const render = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
  };

  it('bandeau : drapeaux en fondu, photo, groupe, nom et pastilles', async () => {
    flushInitial();
    await render();

    const hero = element().querySelector('.hero')!;
    const flags = hero.querySelectorAll<HTMLElement>('app-flag-backdrop .flag');
    expect(flags.length).toBe(2);
    expect(flags[0].style.backgroundImage).toContain('de.png');
    // Drapeaux à leurs vraies proportions (2 × 3:2), sous la photo, fondus vers la droite.
    expect(hero.querySelector<HTMLElement>('.hero-flag')?.style.aspectRatio).toBe('3 / 1');
    expect(hero.querySelector('app-flag-backdrop')?.classList).toContain('fade-right');
    expect(hero.querySelector('img.hero-photo')?.getAttribute('src')).toBe(tigre.imageUrl);
    expect(hero.querySelector('.hero-group')?.textContent).toContain('Aviation');
    expect(hero.querySelector('h1')?.textContent).toContain('Tigre');
    expect([...hero.querySelectorAll('.pill')].map((p) => p.textContent?.trim())).toEqual(['Hélicoptère', 'Allemagne', 'France']);
  });

  it('sans photo : silhouette de la catégorie ; un seul drapeau garde le ratio 3:2', async () => {
    flushInitial([], [], { ...tigre, imageUrl: null, origins: [tigre.origins[1]] });
    await render();

    const hero = element().querySelector('.hero')!;
    expect(hero.querySelector('img.hero-photo')).toBeNull();
    expect(hero.querySelector('app-vehicle-silhouette')).not.toBeNull();
    expect(hero.querySelector<HTMLElement>('.hero-flag')?.style.aspectRatio).toBe('1.5 / 1');
  });

  it('résumé : texte, faits et nombre de publications', async () => {
    flushInitial([], [media('p1', 'image')]);
    await render();

    const resume = element().querySelector('.resume')!;
    expect(resume.textContent).toContain("Hélicoptère d'attaque.");
    expect(resume.querySelector('.facts')?.textContent).toContain('Allemagne, France');
    expect(resume.querySelector('.facts')?.textContent).toContain('1');
    expect(resume.querySelector('a.source')?.getAttribute('href')).toBe(tigre.wikipediaUrl);
  });

  it("sons : le lecteur reçoit l'URL signée du premier son, la liste permet d'en changer", async () => {
    const rotor = media('s1', 'audio', 'Rotor');
    const canon = media('s2', 'audio', 'Canon');
    flushInitial([rotor, canon]);
    await render();

    expect(element().querySelector('.now-playing')?.textContent).toContain('Rotor');
    expect(element().querySelector('app-audio-player audio')?.getAttribute('src')).toBe(rotor.url);

    component.selectSound(canon);
    await render();
    expect(element().querySelector('app-audio-player audio')?.getAttribute('src')).toBe(canon.url);
    expect(element().querySelector('.sound-list button.active')?.textContent).toContain('Canon');
  });

  it('publications : vignette, auteur, et ouverture sans requête supplémentaire', async () => {
    const photo = media('p1', 'image', 'Rafale en approche');
    const video = media('p2', 'video', 'Démonstration');
    flushInitial([], [photo, video]);
    await render();

    const cards = element().querySelectorAll('.post');
    expect(cards[0].querySelector('img')?.getAttribute('src')).toBe(photo.url);
    expect(cards[0].querySelector('.author')?.textContent).toContain('par Lucas Bernard');
    expect(cards[1].querySelector('video')?.getAttribute('src')).toBe(`${video.url}#t=0.5`);
    expect(cards[1].querySelector('.play-overlay')).not.toBeNull();

    component.open(video);
    await render();
    expect(element().querySelector('app-media-viewer video')?.getAttribute('src')).toBe(video.url);
  });

  it('filtre les publications par type (sons compris)', () => {
    flushInitial();
    component.filter('audio');
    expectSounds().flush(page([]));
    component.filter(null);
    expectPosts().flush(page([]));
  });

  it('indique quand aucun son ni publication n’existe', async () => {
    flushInitial();
    await render();
    expect(element().querySelector('.sounds')?.textContent).toContain('Aucun son');
    expect(element().querySelector('section.posts')?.textContent).toContain('Aucune publication');
  });

  it('affiche un message pour une fiche inconnue (404)', async () => {
    http.expectOne('/api/vehicles/v1').flush({ message: 'Véhicule inconnu' }, { status: 404, statusText: 'Not Found' });
    expectSounds().flush(page([]));
    expectPosts().flush(page([]));
    await render();

    expect(component.notFound()).toBe(true);
    expect(element().querySelector('[role="alert"]')?.textContent).toContain("n'existe pas");
    expect(element().querySelector('.hero')).toBeNull();
  });

  it('recharge tout en naviguant vers une autre fiche', () => {
    flushInitial();
    fixture.componentRef.setInput('id', 'v2');
    fixture.detectChanges();

    flushInitial([], [], { ...tigre, id: 'v2' });
    expect(component.vehicle()?.id).toBe('v2');
  });

  it('l’étoile ajoute puis retire la fiche des véhicules préférés', async () => {
    const auth = TestBed.inject(AuthService);
    auth.currentUser.set({ id: 'u1', name: 'Matteo', email: 'm@x.fr', favoriteVehicleIds: [], createdAt: '' });
    flushInitial();
    await render();
    expect(component.isFavorite()).toBe(false);
    expect(element().querySelector('button.favorite')?.textContent).toContain('Ajouter aux préférés');

    component.toggleFavorite();
    const add = http.expectOne('/api/users/me/favorites/v1');
    expect(add.request.method).toBe('PUT');
    add.flush({ id: 'u1', name: 'Matteo', email: 'm@x.fr', favoriteVehicleIds: ['v1'], createdAt: '' });
    await render();
    expect(component.isFavorite()).toBe(true);
    expect(element().querySelector('button.favorite')?.classList).toContain('on');

    component.toggleFavorite();
    const remove = http.expectOne('/api/users/me/favorites/v1');
    expect(remove.request.method).toBe('DELETE');
    remove.flush({ message: '6 véhicules préférés au maximum' }, { status: 400, statusText: 'Bad Request' });
    expect(component.favoriteError()).toContain('6 véhicules');
  });
});
