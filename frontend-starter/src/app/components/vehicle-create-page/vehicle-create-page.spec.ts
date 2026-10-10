import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { Vehicle } from '../../shared/models/vehicle.model';
import { STEP_DELAY_MS, VehicleCreatePageComponent } from './vehicle-create-page';

const mirage: Vehicle = {
  id: 'v9',
  wikidataId: 'Q1',
  name: 'Dassault Mirage 4000',
  category: 'aircraft',
  countries: ['France'],
  origins: [{ name: 'France', code: 'fr', flagUrl: 'https://commons.wikimedia.org/fr.png' }],
  summary: '',
  imageUrl: null,
  wikipediaUrl: 'https://fr.wikipedia.org/wiki/Dassault_Mirage_4000',
  createdAt: '2026-10-10T10:00:00.000Z',
};

describe('VehicleCreatePageComponent', () => {
  let fixture: ComponentFixture<VehicleCreatePageComponent>;
  let component: VehicleCreatePageComponent;
  let http: HttpTestingController;

  const element = () => fixture.nativeElement as HTMLElement;
  const render = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [VehicleCreatePageComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(VehicleCreatePageComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  it('sans nom : demande le nom, puis passe à la confirmation', async () => {
    await render();
    expect(component.state()).toBe('edit');

    component.nameControl.setValue('Mirage 4000');
    component.confirm();
    await render();
    expect(component.state()).toBe('confirm');
    expect(element().querySelector('h1')?.textContent).toContain('Créer la fiche « Mirage 4000 » ?');
    expect(element().querySelectorAll('.steps li').length).toBe(3);
  });

  it('avec ?name= : arrive directement sur la confirmation', async () => {
    fixture.componentRef.setInput('name', 'Mirage 4000');
    await render();
    expect(component.state()).toBe('confirm');
  });

  it('pendant la recherche : les étapes avancent, puis la fiche créée (201) est affichée', async () => {
    vi.useFakeTimers();
    fixture.componentRef.setInput('name', 'Mirage 4000');
    fixture.detectChanges();

    component.create();
    component.create(); // double clic ignoré
    expect(component.state()).toBe('loading');
    expect(component.stepState(0)).toBe('current');

    vi.advanceTimersByTime(STEP_DELAY_MS);
    expect(component.stepState(0)).toBe('done');
    expect(component.stepState(1)).toBe('current');
    vi.advanceTimersByTime(STEP_DELAY_MS * 5);
    expect(component.step()).toBe(2); // plafonnée à la dernière étape

    const req = http.expectOne('/api/vehicles');
    expect(req.request.body).toEqual({ name: 'Mirage 4000' });
    req.flush(mirage, { status: 201, statusText: 'Created' });
    vi.useRealTimers();
    await render();

    expect(component.state()).toBe('success');
    expect(component.existing()).toBe(false);
    expect(element().querySelector('h1')?.textContent).toContain('La fiche est en ligne !');
    expect(element().querySelector('.summary-name')?.textContent).toContain('Dassault Mirage 4000');
    expect(element().querySelector('a[href="/vehicles/v9"]')).not.toBeNull();
    expect(element().querySelector('a[href="/hangar?vehicle=v9"]')).not.toBeNull();
  });

  it('fiche déjà existante (200) : le message le dit', async () => {
    fixture.componentRef.setInput('name', 'Rafale');
    fixture.detectChanges();
    component.create();
    http.expectOne('/api/vehicles').flush(mirage, { status: 200, statusText: 'OK' });
    await render();

    expect(component.existing()).toBe(true);
    expect(element().querySelector('h1')?.textContent).toContain('existe déjà');
  });

  it('refus (422) : message du serveur, puis « Modifier le nom » revient à la saisie', async () => {
    fixture.componentRef.setInput('name', 'Paris');
    fixture.detectChanges();
    component.create();
    http
      .expectOne('/api/vehicles')
      .flush({ message: '« Paris » ne correspond à aucun avion' }, { status: 422, statusText: 'Unprocessable Entity' });
    await render();

    expect(component.state()).toBe('refused');
    expect(element().querySelector('.refused-card')).not.toBeNull();
    expect(element().textContent).toContain('« Paris » ne correspond à aucun avion');

    component.editName();
    expect(component.state()).toBe('edit');
    expect(component.nameControl.value).toBe('Paris');
  });

  it('Wikipédia indisponible (503) : état distinct avec « Réessayer »', async () => {
    fixture.componentRef.setInput('name', 'Rafale');
    fixture.detectChanges();
    component.create();
    http.expectOne('/api/vehicles').flush({ message: 'Wikipédia est momentanément indisponible' }, { status: 503, statusText: 'Service Unavailable' });
    await render();

    expect(component.state()).toBe('unavailable');
    component.create();
    http.expectOne('/api/vehicles').flush(mirage, { status: 201, statusText: 'Created' });
    expect(component.state()).toBe('success');
  });

  it('« Annuler » pendant la recherche abandonne la requête', () => {
    fixture.componentRef.setInput('name', 'Rafale');
    fixture.detectChanges();
    component.create();
    const req = http.expectOne('/api/vehicles');

    component.cancel();
    expect(req.cancelled).toBe(true);
    expect(component.state()).toBe('confirm');
  });
});
