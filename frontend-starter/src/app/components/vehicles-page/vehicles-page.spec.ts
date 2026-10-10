import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { Vehicle } from '../../shared/models/vehicle.model';
import { VehiclesPageComponent } from './vehicles-page';

const vehicle = (id: string, name: string): Vehicle => ({
  id,
  wikidataId: 'Q1',
  name,
  category: 'aircraft',
  countries: ['France'],
  summary: '',
  imageUrl: null,
  wikipediaUrl: 'https://fr.wikipedia.org/wiki/X',
  createdAt: '2026-10-08T10:00:00.000Z',
});

const page = (docs: Vehicle[]) => ({ docs, totalDocs: docs.length, limit: 12, page: 1, totalPages: 1 });

describe('VehiclesPageComponent', () => {
  let fixture: ComponentFixture<VehiclesPageComponent>;
  let component: VehiclesPageComponent;
  let http: HttpTestingController;

  const expectList = (): TestRequest => http.expectOne((r) => r.method === 'GET' && r.url === '/api/vehicles');

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

  it('affiche les fiches avec un lien vers chacune', async () => {
    expectList().flush(page([vehicle('v1', 'Dassault Rafale')]));
    fixture.detectChanges();
    await fixture.whenStable();

    const link = (fixture.nativeElement as HTMLElement).querySelector('a.vehicle-card');
    expect(link?.textContent).toContain('Dassault Rafale');
    expect(link?.getAttribute('href')).toBe('/vehicles/v1');
  });

  it('le filtre par catégorie est transmis au serveur', () => {
    expectList().flush(page([]));
    component.filter('helicopter');
    expect(expectList().request.params.get('category')).toBe('helicopter');
  });

  it('crée une fiche puis ouvre sa page', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    expectList().flush(page([]));
    component.newName.setValue('Mirage 2000');

    component.create();
    const req = http.expectOne((r) => r.method === 'POST' && r.url === '/api/vehicles');
    expect(req.request.body).toEqual({ name: 'Mirage 2000' });
    req.flush(vehicle('v9', 'Dassault Mirage 2000'));

    expect(navigate).toHaveBeenCalledWith(['/vehicles', 'v9']);
  });

  it('affiche le message si Wikipédia est indisponible (503)', () => {
    expectList().flush(page([]));
    component.newName.setValue('Rafale');
    component.create();
    http
      .expectOne((r) => r.method === 'POST')
      .flush({ message: 'Wikipédia est momentanément indisponible' }, { status: 503, statusText: 'Service Unavailable' });

    expect(component.createError()).toContain('indisponible');
    expect(component.creating()).toBe(false);
  });
});
