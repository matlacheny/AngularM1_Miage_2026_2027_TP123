import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Vehicle } from '../../shared/models/vehicle.model';
import { VehiclePickerComponent } from './vehicle-picker';

const vehicle = (id: string, name: string): Vehicle => ({
  id,
  wikidataId: 'Q1',
  name,
  category: 'tank',
  countries: ['France'],
  summary: '',
  imageUrl: null,
  wikipediaUrl: 'https://fr.wikipedia.org/wiki/X',
  createdAt: '2026-10-08T10:00:00.000Z',
});

describe('VehiclePickerComponent', () => {
  let fixture: ComponentFixture<VehiclePickerComponent>;
  let component: VehiclePickerComponent;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [VehiclePickerComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(VehiclePickerComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => http.verify());

  it('ne cherche pas en dessous de 2 caractères', () => {
    component.search('L');
    http.expectNone((r) => r.url === '/api/vehicles');
    expect(component.suggestions()).toEqual([]);
  });

  it('propose les fiches existantes puis sélectionne celle choisie', () => {
    component.search('Lecl');
    const req = http.expectOne((r) => r.method === 'GET' && r.url === '/api/vehicles');
    expect(req.request.params.get('q')).toBe('Lecl');
    req.flush({ docs: [vehicle('v1', 'Char Leclerc')], totalDocs: 1, limit: 5, page: 1, totalPages: 1 });
    expect(component.suggestions().map((v) => v.name)).toEqual(['Char Leclerc']);

    component.choose(component.suggestions()[0]);
    expect(component.selected()?.id).toBe('v1');
    expect(component.suggestions()).toEqual([]);
  });

  it('crée la fiche via POST /api/vehicles et la sélectionne', () => {
    component.query.setValue('  Leclerc ', { emitEvent: false });
    component.create();
    component.create(); // double clic ignoré

    const req = http.expectOne((r) => r.method === 'POST' && r.url === '/api/vehicles');
    expect(req.request.body).toEqual({ name: 'Leclerc' });
    req.flush(vehicle('v2', 'Char Leclerc'));

    expect(component.selected()?.name).toBe('Char Leclerc');
    expect(component.creating()).toBe(false);
  });

  it("affiche le refus du serveur quand ce n'est pas un véhicule (422)", () => {
    component.query.setValue('Paris', { emitEvent: false });
    component.create();
    http
      .expectOne('/api/vehicles')
      .flush({ message: '« Paris » ne correspond à aucun avion' }, { status: 422, statusText: 'Unprocessable Entity' });

    expect(component.selected()).toBeNull();
    expect(component.error()).toContain('Paris');
  });

  it('clear() retire la fiche sélectionnée', () => {
    component.selected.set(vehicle('v1', 'T-34'));
    component.clear();
    expect(component.selected()).toBeNull();
  });
});
