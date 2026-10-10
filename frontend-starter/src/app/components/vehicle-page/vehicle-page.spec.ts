import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { Media } from '../../shared/models/media.model';
import { Vehicle } from '../../shared/models/vehicle.model';
import { VehiclePageComponent } from './vehicle-page';

const tigre: Vehicle = {
  id: 'v1',
  wikidataId: 'Q159601',
  name: 'Eurocopter EC665 Tigre',
  category: 'helicopter',
  countries: ['Allemagne', 'France'],
  summary: "Hélicoptère d'attaque.",
  imageUrl: 'https://upload.wikimedia.org/tigre.jpg',
  wikipediaUrl: 'https://fr.wikipedia.org/wiki/Eurocopter_EC665_Tigre',
  createdAt: '2026-10-08T10:00:00.000Z',
};

const video: Media = {
  id: 'm1',
  ownerId: 'u2',
  kind: 'video',
  title: 'Tigre en vol',
  originalName: 'tigre.mp4',
  mimeType: 'video/mp4',
  size: 1000,
  visibility: 'public',
  vehicle: { id: 'v1', name: 'Eurocopter EC665 Tigre' },
  createdAt: '2026-10-08T10:00:00.000Z',
};

const page = (docs: Media[]) => ({ docs, totalDocs: docs.length, limit: 12, page: 1, totalPages: 1 });

describe('VehiclePageComponent', () => {
  let fixture: ComponentFixture<VehiclePageComponent>;
  let component: VehiclePageComponent;
  let http: HttpTestingController;

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

  it('affiche la fiche Wikipédia et les médias visibles', async () => {
    http.expectOne('/api/vehicles/v1').flush(tigre);
    http.expectOne((r) => r.url === '/api/vehicles/v1/media').flush(page([video]));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(element().querySelector('h1')?.textContent).toContain('Tigre');
    expect(element().textContent).toContain('Allemagne, France');
    expect(element().querySelector('a[href="https://fr.wikipedia.org/wiki/Eurocopter_EC665_Tigre"]')).not.toBeNull();
    expect(element().querySelector('.media-card h3')?.textContent).toContain('Tigre en vol');
  });

  it('affiche un message pour une fiche inconnue (404)', async () => {
    http.expectOne('/api/vehicles/v1').flush({ message: 'Véhicule inconnu' }, { status: 404, statusText: 'Not Found' });
    http.expectOne((r) => r.url === '/api/vehicles/v1/media').flush(page([]));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.notFound()).toBe(true);
    expect(element().querySelector('[role="alert"]')?.textContent).toContain("n'existe pas");
  });

  it('filtre les médias par type', () => {
    http.expectOne('/api/vehicles/v1').flush(tigre);
    http.expectOne((r) => r.url === '/api/vehicles/v1/media').flush(page([]));

    component.filter('audio');
    const req = http.expectOne((r) => r.url === '/api/vehicles/v1/media');
    expect(req.request.params.get('kind')).toBe('audio');
    req.flush(page([]));
  });

  it("ouvre une vidéo avec l'URL de lecture signée", async () => {
    http.expectOne('/api/vehicles/v1').flush(tigre);
    http.expectOne((r) => r.url === '/api/vehicles/v1/media').flush(page([video]));

    component.open(video);
    http.expectOne('/api/media/m1/stream-url').flush({ url: '/api/media/m1/file?token=t', expiresIn: 600 });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(element().querySelector('video')?.getAttribute('src')).toBe('/api/media/m1/file?token=t');
  });

  it('recharge tout en naviguant vers une autre fiche', () => {
    http.expectOne('/api/vehicles/v1').flush(tigre);
    http.expectOne((r) => r.url === '/api/vehicles/v1/media').flush(page([]));

    fixture.componentRef.setInput('id', 'v2');
    fixture.detectChanges();

    http.expectOne('/api/vehicles/v2').flush({ ...tigre, id: 'v2' });
    http.expectOne((r) => r.url === '/api/vehicles/v2/media').flush(page([]));
    expect(component.vehicle()?.id).toBe('v2');
  });
});
