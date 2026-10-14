import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpEventType, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideRouter } from '@angular/router';
import { Media, MediaKind } from '../../shared/models/media.model';
import { HangarPageComponent } from './hangar-page';

const media = (id: string, kind: MediaKind = 'audio', title = id): Media => ({
  id,
  ownerId: 'u1',
  kind,
  title,
  originalName: `${title}.bin`,
  mimeType: kind === 'audio' ? 'audio/mpeg' : kind === 'image' ? 'image/jpeg' : 'video/mp4',
  size: 2048,
  visibility: 'private',
  vehicle: null,
  createdAt: '2026-10-08T10:00:00.000Z',
});

const page = (docs: Media[], totalPages = 1) => ({
  docs,
  totalDocs: docs.length,
  limit: 10,
  page: 1,
  totalPages,
  pagingCounter: 1,
  hasPrevPage: false,
  hasNextPage: false,
  prevPage: null,
  nextPage: null,
});

describe('HangarPageComponent', () => {
  let fixture: ComponentFixture<HangarPageComponent>;
  let component: HangarPageComponent;
  let http: HttpTestingController;
  let snackBarOpen: ReturnType<typeof vi.fn>;

  const expectList = (): TestRequest => http.expectOne((r) => r.method === 'GET' && r.url === '/api/media');

  beforeEach(() => {
    snackBarOpen = vi.fn();
    TestBed.configureTestingModule({
      imports: [HangarPageComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatSnackBar, useValue: { open: snackBarOpen } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(HangarPageComponent);
    component = fixture.componentInstance;
    // Section « Partagés avec moi », chargée au démarrage.
    http.expectOne((r) => r.url === '/api/media/shared-with-me').flush(page([]));
  });

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });

  it('charge mes médias au démarrage', () => {
    expectList().flush(page([media('m1'), media('m2', 'video')]));
    expect(component.items().map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(component.loading()).toBe(false);
  });

  it('le filtre par type envoie kind et repart de la page 1', () => {
    expectList().flush(page([]));
    component.page.set(3);

    component.filter('video');

    const req = expectList();
    expect(req.request.params.get('kind')).toBe('video');
    expect(req.request.params.get('page')).toBe('1');
    req.flush(page([media('v1', 'video')]));

    component.filter(null);
    expect(expectList().request.params.has('kind')).toBe(false);
  });

  it('refuse un fichier invalide avant tout appel HTTP', () => {
    expectList().flush(page([]));
    const input = document.createElement('input');
    const pdf = new File(['%PDF'], 'notice.pdf', { type: 'application/pdf' });
    Object.defineProperty(input, 'files', { value: [pdf] });

    component.choose({ target: input } as unknown as Event);

    expect(component.file).toBeUndefined();
    expect(component.uploadMessage()).toContain('Format non supporté');
  });

  it("l'upload envoie fichier, titre et visibilité, suit la progression puis recharge", () => {
    expectList().flush(page([]));
    component.file = new File(['abc'], 'tigre.mp4', { type: 'video/mp4' });
    component.title.setValue('Tigre');
    component.visibility.setValue('public');

    component.upload();
    component.upload(); // double clic ignoré

    const req = http.expectOne((r) => r.method === 'POST' && r.url === '/api/media');
    const body = req.request.body as FormData;
    expect(body.get('title')).toBe('Tigre');
    expect(body.get('visibility')).toBe('public');
    expect(body.has('vehicleId')).toBe(false);
    expect((body.get('file') as File).name).toBe('tigre.mp4');

    req.event({ type: HttpEventType.UploadProgress, loaded: 40, total: 100 });
    expect(component.uploadProgress()).toBe(40);

    req.flush(media('v9', 'video', 'Tigre'));
    expect(component.uploadStatus()).toBe('success');
    expect(component.file).toBeUndefined();
    expectList().flush(page([media('v9', 'video', 'Tigre')]));
  });

  it("affiche l'erreur du serveur si l'upload échoue", () => {
    expectList().flush(page([]));
    component.file = new File(['abc'], 'a.png', { type: 'image/png' });
    component.upload();
    http
      .expectOne('/api/media')
      .flush({ message: 'Visibilité invalide' }, { status: 400, statusText: 'Bad Request' });

    expect(component.uploadStatus()).toBe('error');
    expect(component.uploadMessage()).toBe('Visibilité invalide');
  });

  it("ouvre une vidéo avec l'URL signée dans une balise <video>", async () => {
    expectList().flush(page([media('v1', 'video')]));
    component.open(media('v1', 'video'));

    const req = http.expectOne('/api/media/v1/stream-url');
    expect(req.request.method).toBe('POST');
    req.flush({ url: '/api/media/v1/file?token=abc', expiresIn: 600 });

    fixture.detectChanges();
    await fixture.whenStable();
    const video = (fixture.nativeElement as HTMLElement).querySelector('video');
    expect(video?.getAttribute('src')).toBe('/api/media/v1/file?token=abc');
  });

  it('change la visibilité avec PATCH et met à jour la carte', () => {
    expectList().flush(page([media('m1')]));
    const select = document.createElement('select');
    select.innerHTML = '<option value="public">Public</option>';
    select.value = 'public';

    component.changeVisibility(media('m1'), { target: select } as unknown as Event);

    const req = http.expectOne('/api/media/m1');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ visibility: 'public' });
    req.flush({ ...media('m1'), visibility: 'public' });

    expect(component.items()[0].visibility).toBe('public');
    expect(component.busyId()).toBeNull();
  });

  it('la suppression confirmée appelle DELETE puis recharge', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    expectList().flush(page([media('m1'), media('m2')]));

    component.remove(media('m1'));
    component.remove(media('m1')); // ignoré pendant la suppression

    const del = http.expectOne('/api/media/m1');
    expect(del.request.method).toBe('DELETE');
    del.flush(null, { status: 204, statusText: 'No Content' });

    expect(snackBarOpen).toHaveBeenCalled();
    expectList().flush(page([media('m2')]));
    expect(component.items().map((m) => m.id)).toEqual(['m2']);
  });

  it("envoie la fiche choisie avec l'upload et affiche le lien vers la fiche", async () => {
    expectList().flush(page([]));
    component.vehicle.set({
      id: 'veh1',
      wikidataId: 'Q190973',
      name: 'Dassault Rafale',
      category: 'aircraft',
      countries: ['France'],
      origins: [{ name: 'France', code: 'fr', flagUrl: null }],
      summary: '',
      imageUrl: null,
      wikipediaUrl: 'https://fr.wikipedia.org/wiki/Dassault_Rafale',
      createdAt: '2026-10-08T10:00:00.000Z',
    });
    component.file = new File(['abc'], 'rafale.mp3', { type: 'audio/mpeg' });

    component.upload();
    const req = http.expectOne('/api/media');
    expect((req.request.body as FormData).get('vehicleId')).toBe('veh1');
    const uploaded = { ...media('m1'), vehicle: { id: 'veh1', name: 'Dassault Rafale' } };
    req.flush(uploaded);
    expectList().flush(page([uploaded]));

    fixture.detectChanges();
    await fixture.whenStable();
    const link = (fixture.nativeElement as HTMLElement).querySelector('a.vehicle-link');
    expect(link?.textContent).toContain('Dassault Rafale');
    expect(link?.getAttribute('href')).toBe('/vehicles/veh1');
  });

  it('présélectionne la fiche passée en paramètre ?vehicle=', () => {
    expectList().flush(page([]));
    fixture.componentRef.setInput('vehicle', 'veh1');
    fixture.detectChanges();

    http.expectOne('/api/vehicles/veh1').flush({
      id: 'veh1',
      wikidataId: 'Q242398',
      name: 'Char Leclerc',
      category: 'tank',
      countries: ['France'],
      origins: [{ name: 'France', code: 'fr', flagUrl: null }],
      summary: '',
      imageUrl: null,
      wikipediaUrl: 'https://fr.wikipedia.org/wiki/Char_Leclerc',
      createdAt: '2026-10-08T10:00:00.000Z',
    });
    expect(component.vehicle()?.name).toBe('Char Leclerc');
  });
});
