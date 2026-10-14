import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { Post } from '../../shared/models/post.model';
import { Vehicle } from '../../shared/models/vehicle.model';
import { SearchPageComponent } from './search-page';

const post = (id: string): Post => ({
  id,
  ownerId: 'u1',
  owner: { id: 'u1', name: 'Lucas Bernard' },
  text: `Post ${id}`,
  media: { id: `m-${id}`, kind: 'audio', title: 'Rafale au décollage', mimeType: 'audio/mpeg', url: `/api/media/m-${id}/file` },
  vehicle: { id: 'v1', name: 'Dassault Rafale', category: 'aircraft' },
  visibility: 'public',
  likeCount: 0,
  likedByMe: false,
  commentCount: 0,
  createdAt: new Date().toISOString(),
});

const vehicle = (id: string, name: string): Vehicle => ({
  id,
  wikidataId: `Q${id}`,
  name,
  category: 'aircraft',
  countries: ['France'],
  origins: [],
  summary: '',
  imageUrl: null,
  wikipediaUrl: '',
  createdAt: '',
});

const page = <T>(docs: T[], totalDocs = docs.length, pageNumber = 1, totalPages = 1) => ({ docs, totalDocs, limit: 10, page: pageNumber, totalPages });

describe('SearchPageComponent', () => {
  let fixture: ComponentFixture<SearchPageComponent>;
  let component: SearchPageComponent;
  let http: HttpTestingController;
  let navigate: ReturnType<typeof vi.spyOn>;

  const element = () => fixture.nativeElement as HTMLElement;
  const expectPosts = (): TestRequest => http.expectOne((r) => r.url === '/api/posts/feed');
  const expectVehicles = (): TestRequest => http.expectOne((r) => r.url === '/api/vehicles');
  const render = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
  };
  /** Simule l'URL /search?q=…&kind=… (inputs liés aux paramètres de requête). */
  const open = (q?: string, kind?: string) => {
    if (q !== undefined) fixture.componentRef.setInput('q', q);
    if (kind !== undefined) fixture.componentRef.setInput('kind', kind);
    fixture.detectChanges();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SearchPageComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(SearchPageComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  it('cherche les fiches véhicules puis les posts avec fichier', async () => {
    open('rafale');
    const vehicles = expectVehicles();
    expect(vehicles.request.params.get('q')).toBe('rafale');
    expect(vehicles.request.params.get('limit')).toBe('4');
    vehicles.flush(page([vehicle('v1', 'Dassault Rafale')], 6));

    const posts = expectPosts();
    expect(posts.request.params.get('q')).toBe('rafale');
    expect(posts.request.params.get('media')).toBe('1');
    expect(posts.request.params.get('kind')).toBeNull();
    posts.flush(page([post('p1'), post('p2')]));
    await render();

    const sections = element().querySelectorAll('section.results');
    expect(sections.length).toBe(2);
    expect(sections[0].querySelector('h2')?.textContent).toContain('Fiches véhicules');
    expect(sections[0].querySelectorAll('.vehicle-card').length).toBe(1);
    expect(sections[0].querySelector('.section-head a')?.textContent).toContain('Voir les 6 fiches');
    expect(sections[1].querySelectorAll('app-post-card').length).toBe(2);
    expect(element().querySelector('h1')?.textContent).toContain('Résultats pour « rafale »');
    expect(component.search.value).toBe('rafale');
  });

  it('sans texte : pas de fiches, derniers fichiers publiés', async () => {
    open();
    http.expectNone((r) => r.url === '/api/vehicles');
    const posts = expectPosts();
    expect(posts.request.params.get('q')).toBeNull();
    expect(posts.request.params.get('media')).toBe('1');
    posts.flush(page([post('p1')]));
    await render();

    expect(element().querySelectorAll('section.results').length).toBe(1);
    expect(element().querySelector('h1')?.textContent).toContain('Derniers fichiers publiés');
  });

  it('aucun résultat : propose de créer la fiche et explique la recherche', async () => {
    open('mirage 4000');
    expectVehicles().flush(page<Vehicle>([]));
    expectPosts().flush(page<Post>([]));
    await render();

    const create = element().querySelector<HTMLAnchorElement>('.empty-vehicles a')!;
    expect(create.getAttribute('href')).toBe('/vehicles/new?name=mirage%204000');
    expect(element().querySelector('.empty')?.textContent).toContain('Aucune publication avec fichier pour « mirage 4000 »');
  });

  it('le filtre de type vient de l’URL et le bouton met l’URL à jour', async () => {
    open('rafale', 'audio');
    expectVehicles().flush(page<Vehicle>([]));
    expect(expectPosts().request.params.get('kind')).toBe('audio');
    open(undefined, 'pdf'); // type inconnu : ignoré
    expectVehicles().flush(page<Vehicle>([]));
    expect(expectPosts().request.params.get('kind')).toBeNull();

    component.setKind('video');
    expect(navigate).toHaveBeenCalledWith(['/search'], { queryParams: { q: 'rafale', kind: 'video' }, replaceUrl: false });
  });

  it('la saisie met à jour l’URL après une pause, sans empiler l’historique', () => {
    vi.useFakeTimers();
    open();
    expectPosts().flush(page<Post>([]));

    component.search.setValue('lec');
    component.search.setValue('leclerc ');
    vi.advanceTimersByTime(299);
    expect(navigate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(['/search'], { queryParams: { q: 'leclerc' }, replaceUrl: true });
  });

  it('« Plus de résultats » ajoute la page suivante', async () => {
    open('rafale');
    expectVehicles().flush(page<Vehicle>([]));
    expectPosts().flush(page([post('p1')], 2, 1, 2));
    await render();

    element().querySelector<HTMLButtonElement>('button.more')!.click();
    const next = expectPosts();
    expect(next.request.params.get('page')).toBe('2');
    expect(next.request.params.get('q')).toBe('rafale');
    next.flush(page([post('p2')], 2, 2, 2));
    await render();

    expect(element().querySelectorAll('app-post-card').length).toBe(2);
    expect(element().querySelector('button.more')).toBeNull();
  });

  it('ignore la réponse d’une recherche remplacée entre-temps', async () => {
    open('raf');
    const oldVehicles = expectVehicles();
    const oldPosts = expectPosts();
    open('leclerc');
    expectVehicles().flush(page([vehicle('v2', 'Leclerc')]));
    expectPosts().flush(page<Post>([]));
    oldVehicles.flush(page([vehicle('v1', 'Dassault Rafale')]));
    oldPosts.flush(page([post('p1')]));
    await render();

    expect(component.vehicles().map((v) => v.name)).toEqual(['Leclerc']);
    expect(component.posts()).toEqual([]);
  });

  it('affiche l’erreur du serveur', async () => {
    open('rafale');
    expectVehicles().flush(page<Vehicle>([]));
    expectPosts().flush({ message: 'Catégorie inconnue' }, { status: 400, statusText: 'Bad Request' });
    await render();

    expect(element().querySelector('[role="alert"]')?.textContent).toContain('Catégorie inconnue');
  });
});
