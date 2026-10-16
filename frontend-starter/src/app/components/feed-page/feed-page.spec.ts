import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { Post } from '../../shared/models/post.model';
import { Vehicle } from '../../shared/models/vehicle.model';
import { FeedPageComponent } from './feed-page';

const post = (id: string, name: string, hoursAgo = 2): Post => ({
  id,
  ownerId: `u-${id}`,
  owner: { id: `u-${id}`, name },
  title: '',
  text: `Post ${id}`,
  media: { id: `m-${id}`, kind: 'image', title: 't', mimeType: 'image/jpeg', url: `/api/media/m-${id}/file` },
  vehicle: { id: 'v1', name: 'Dassault Rafale', category: 'aircraft' },
  visibility: 'public',
  likeCount: 0,
  likedByMe: false,
  commentCount: 0,
  createdAt: new Date(Date.now() - hoursAgo * 3600e3).toISOString(),
});

const rafale: Vehicle = {
  id: 'v1',
  wikidataId: 'Q1',
  name: 'Dassault Rafale',
  category: 'aircraft',
  countries: ['France'],
  origins: [{ name: 'France', code: 'fr', flagUrl: 'https://commons.wikimedia.org/fr.png' }],
  summary: '',
  imageUrl: null,
  wikipediaUrl: '',
  createdAt: '',
};

const page = <T>(docs: T[], pageNumber = 1, totalPages = 1) => ({ docs, totalDocs: docs.length, limit: 10, page: pageNumber, totalPages });

describe('FeedPageComponent', () => {
  let fixture: ComponentFixture<FeedPageComponent>;
  let component: FeedPageComponent;
  let http: HttpTestingController;

  /** Fil principal (scope absent) ou posts de l'escadrille (scope=friends). */
  const expectFeed = (friends = false): TestRequest =>
    http.expectOne(
      (r) => r.url === '/api/posts/feed' && r.params.get('scope') === (friends ? 'friends' : null) && r.params.get('media') === null,
    );
  /** Bloc « Derniers ajouts » : posts avec fichier, tout le réseau. */
  const expectLatest = (): TestRequest => http.expectOne((r) => r.url === '/api/posts/feed' && r.params.get('media') === '1');
  const element = () => fixture.nativeElement as HTMLElement;
  const render = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [FeedPageComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(FeedPageComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => http.verify());

  /** Les 4 requêtes de départ : fil, recommandations, posts récents, derniers ajouts. */
  const flushInitial = (feed = page([post('p1', 'Lucas Bernard')]), recent = page<Post>([]), latest = page<Post>([])) => {
    expectFeed().flush(feed);
    const reco = http.expectOne((r) => r.url === '/api/vehicles');
    expect(reco.request.params.get('sort')).toBe('popular');
    expect(reco.request.params.get('limit')).toBe('4');
    reco.flush(page([rafale]));
    expectFeed(true).flush(recent);
    const latestRequest = expectLatest();
    expect(latestRequest.request.params.get('limit')).toBe('4');
    expect(latestRequest.request.params.get('scope')).toBeNull();
    latestRequest.flush(latest);
  };

  it('affiche le fil, les véhicules recommandés et les posts récents', async () => {
    flushInitial(page([post('p1', 'Lucas Bernard')]), page([post('p2', 'Sarah Nguyen', 30)]));
    await render();

    expect(element().querySelectorAll('app-post-card').length).toBe(1);
    expect(element().querySelector('app-post-composer')).not.toBeNull();
    const reco = element().querySelector('.side-card a.side-item')!;
    expect(reco.getAttribute('href')).toBe('/vehicles/v1');
    expect(reco.querySelector('app-flag-backdrop')).not.toBeNull();
    const recent = element().querySelector('[aria-labelledby="recent-title"]')!;
    expect(recent.textContent).toContain('Sarah Nguyen');
    expect(recent.textContent).toContain('Photo · Dassault Rafale');
    expect(recent.querySelector('.ago')?.classList.contains('fresh')).toBe(false); // plus de 24 h
  });

  it('« Derniers ajouts » : fichiers récents, lien vers le post et vers la recherche', async () => {
    const video = { ...post('p3', 'Hugo Petit'), media: { id: 'm3', kind: 'video' as const, title: 'EBRC Jaguar (5)', mimeType: 'video/mp4', url: '' } };
    flushInitial(undefined, undefined, page([video]));
    await render();

    const latest = element().querySelector('[aria-labelledby="latest-title"]')!;
    expect(latest.querySelector('h2')?.textContent).toContain('Derniers ajouts');
    expect(latest.querySelector('.side-head a')?.getAttribute('href')).toBe('/search');
    const item = latest.querySelector('a.side-item')!;
    expect(item.getAttribute('href')).toBe('/posts/p3');
    expect(item.querySelector('b')?.textContent).toContain('EBRC Jaguar (5)');
    expect(item.textContent).toContain('Vidéo · Hugo Petit');
    expect(item.querySelector('.ago')?.classList.contains('fresh')).toBe(true);
  });

  it('« Derniers ajouts » vide : message', async () => {
    flushInitial();
    await render();
    expect(element().querySelector('[aria-labelledby="latest-title"]')?.textContent).toContain('Aucun fichier publié');
  });

  it('« Derniers ajouts » suit les publications et suppressions', () => {
    flushInitial(undefined, undefined, page([post('p1', 'A'), post('p2', 'B'), post('p3', 'C'), post('p4', 'D')]));
    component.onPublished({ ...post('text', 'Matteo'), media: null });
    expect(component.latestFiles().map((p) => p.id)).toEqual(['p1', 'p2', 'p3', 'p4']);
    component.onPublished(post('new', 'Matteo'));
    expect(component.latestFiles().map((p) => p.id)).toEqual(['new', 'p1', 'p2', 'p3']);
    component.onDeleted('p1');
    expect(component.latestFiles().map((p) => p.id)).toEqual(['new', 'p2', 'p3']);
  });

  it('« plus anciennes » ajoute la page suivante à la suite', async () => {
    flushInitial(page([post('p1', 'A')], 1, 2));
    await render();
    expect(component.hasMore()).toBe(true);

    component.more();
    const next = expectFeed();
    expect(next.request.params.get('page')).toBe('2');
    next.flush(page([post('p2', 'B')], 2, 2));
    expect(component.posts().map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(component.hasMore()).toBe(false);
  });

  it('un post publié apparaît en tête ; un post supprimé disparaît', () => {
    flushInitial();
    component.onPublished(post('new', 'Matteo'));
    expect(component.posts()[0].id).toBe('new');
    component.onDeleted('p1');
    expect(component.posts().map((p) => p.id)).toEqual(['new']);
  });

  it('fil vide : message d’invitation', async () => {
    flushInitial(page([]));
    await render();
    expect(element().textContent).toContain('Le fil est vide');
  });
});

describe('FeedPageComponent — onglet escadrille', () => {
  it('« Mon escadrille » recharge le fil avec scope=friends', () => {
    TestBed.configureTestingModule({
      imports: [FeedPageComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    const http = TestBed.inject(HttpTestingController);
    const component = TestBed.createComponent(FeedPageComponent).componentInstance;
    const feed = (friends: boolean) =>
      http.expectOne(
        (r) => r.url === '/api/posts/feed' && r.params.get('scope') === (friends ? 'friends' : null) && r.params.get('limit') === '10' && r.params.get('media') === null,
      );

    feed(false).flush(page([]));
    http.expectOne((r) => r.url === '/api/vehicles').flush(page([]));
    http.expectOne((r) => r.url === '/api/posts/feed' && r.params.get('scope') === 'friends' && r.params.get('limit') === '4').flush(page([]));
    http.expectOne((r) => r.url === '/api/posts/feed' && r.params.get('media') === '1').flush(page([]));

    component.setScope('friends');
    feed(true).flush(page([]));
    component.setScope('friends'); // déjà actif : aucune requête
    http.verify();
  });
});
