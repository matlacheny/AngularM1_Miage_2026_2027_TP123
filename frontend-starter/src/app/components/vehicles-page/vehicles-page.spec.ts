import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { Vehicle } from '../../shared/models/vehicle.model';
import { VehiclesPageComponent } from './vehicles-page';

const vehicle = (id: string, name: string, flagUrl: string | null = null): Vehicle => ({
  id,
  wikidataId: 'Q1',
  name,
  category: 'aircraft',
  countries: ['France'],
  origins: [{ name: 'France', code: 'fr', flagUrl }],
  mediaCount: 48,
  summary: '',
  imageUrl: null,
  wikipediaUrl: 'https://fr.wikipedia.org/wiki/X',
  createdAt: '2026-10-08T10:00:00.000Z',
});

const page = (docs: Vehicle[], totalPages = 1) => ({ docs, totalDocs: docs.length, limit: 8, page: 1, totalPages });

describe('VehiclesPageComponent', () => {
  let fixture: ComponentFixture<VehiclesPageComponent>;
  let component: VehiclesPageComponent;
  let http: HttpTestingController;

  const expectList = (): TestRequest => http.expectOne((r) => r.method === 'GET' && r.url === '/api/vehicles');
  const element = () => fixture.nativeElement as HTMLElement;
  const render = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [VehiclesPageComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(VehiclesPageComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });

  it('charge le catalogue trié par popularité, 8 fiches par page', () => {
    const req = expectList();
    expect(req.request.params.get('sort')).toBe('popular');
    expect(req.request.params.get('limit')).toBe('8');
    req.flush(page([]));
  });

  it('affiche chaque fiche avec drapeau, silhouette, rang, catégorie et nombre de médias', async () => {
    expectList().flush(page([vehicle('v1', 'Dassault Rafale', 'https://commons.wikimedia.org/flag.png'), vehicle('v2', 'Mirage 2000')]));
    await render();

    const card = element().querySelector('a.vehicle-card')!;
    expect(card.getAttribute('href')).toBe('/vehicles/v1');
    expect(card.querySelector('h2')?.textContent).toContain('Dassault Rafale');
    expect((card.querySelector('.flag') as HTMLElement).style.backgroundImage).toContain('commons.wikimedia.org/flag.png');
    expect(card.querySelector('app-vehicle-silhouette')).not.toBeNull();
    expect(card.querySelector('.rank')?.textContent).toContain('#1');
    expect(card.querySelector('.rank')?.classList).toContain('top');
    expect(card.textContent).toContain('48 médias');
    expect(card.querySelector('.pill-accent')?.textContent).toContain('Avion');
  });

  it('le menu de tri change le tri et masque le rang hors popularité', async () => {
    expectList().flush(page([vehicle('v1', 'Rafale')]));
    component.sortOpen.set(true);
    await render();
    expect(element().querySelectorAll('.sort-menu li').length).toBe(3);

    component.chooseSort('name');
    const req = expectList();
    expect(req.request.params.get('sort')).toBe('name');
    req.flush(page([vehicle('v1', 'Rafale')]));
    await render();

    expect(component.sortOpen()).toBe(false);
    expect(element().querySelector('.rank')).toBeNull();
  });

  it('le filtre par catégorie est transmis au serveur', () => {
    expectList().flush(page([]));
    component.filter('helicopter');
    expect(expectList().request.params.get('category')).toBe('helicopter');
  });

  it('recherche sans résultat : propose des fiches proches et la création', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture.componentRef.setInput('q', 'Mirage 4000');
    expectList().flush(page([]));
    await render();
    await new Promise((resolve) => setTimeout(resolve, 350)); // anti-rebond de la recherche

    const search = expectList();
    expect(search.request.params.get('q')).toBe('Mirage 4000');
    search.flush(page([]));
    // Suggestions : fiches contenant le premier mot.
    const suggestions = expectList();
    expect(suggestions.request.params.get('q')).toBe('Mirage');
    suggestions.flush(page([vehicle('m2', 'Mirage 2000')]));
    await render();

    const card = element().querySelector('.state-card')!;
    expect(card.querySelector('h2')?.textContent).toContain('Aucune fiche pour « Mirage 4000 »');
    expect(card.querySelector('a.suggestion')?.textContent).toContain('Mirage 2000');

    component.createFromSearch();
    expect(navigate).toHaveBeenCalledWith(['/vehicles/new'], { queryParams: { name: 'Mirage 4000' } });
  });
});
