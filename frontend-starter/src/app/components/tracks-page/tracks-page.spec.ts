import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpEventType, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Track } from '../../shared/models/track.model';
import { TracksPageComponent } from './tracks-page';

const track = (id: string, title: string): Track => ({
  id,
  title,
  originalName: `${title}.mp3`,
  mimeType: 'audio/mpeg',
  size: 2048,
  coverUrl: null,
  createdAt: '2026-10-02T10:00:00.000Z',
});

const page = (docs: Track[], pageNumber = 1, totalPages = 1) => ({
  docs,
  totalDocs: docs.length,
  limit: 5,
  page: pageNumber,
  totalPages,
  pagingCounter: 1,
  hasPrevPage: pageNumber > 1,
  hasNextPage: pageNumber < totalPages,
  prevPage: null,
  nextPage: null,
});

describe('TracksPageComponent', () => {
  let fixture: ComponentFixture<TracksPageComponent>;
  let component: TracksPageComponent;
  let http: HttpTestingController;
  let snackBarOpen: ReturnType<typeof vi.fn>;

  /** Chaque chargement de la liste correspond à une requête GET /api/tracks. */
  const expectList = (): TestRequest =>
    http.expectOne((r) => r.method === 'GET' && r.url === '/api/tracks');

  beforeEach(() => {
    snackBarOpen = vi.fn();
    TestBed.configureTestingModule({
      imports: [TracksPageComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatSnackBar, useValue: { open: snackBarOpen } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(TracksPageComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });

  it('affiche le message d’erreur du serveur après un échec HTTP du chargement', async () => {
    expectList().flush({ message: 'Base indisponible' }, { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();

    expect(component.error()).toBe('Base indisponible');
    expect(component.loading()).toBe(false);
    const alert = (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Base indisponible');
  });

  it('la suppression confirmée appelle DELETE /api/tracks/:id puis recharge la liste', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    expectList().flush(page([track('t1', 'Blues'), track('t2', 'Jazz')]));
    await fixture.whenStable();

    component.remove(track('t1', 'Blues'));
    expect(component.deletingId()).toBe('t1');

    // Second clic pendant la suppression : ignoré, aucune seconde requête DELETE.
    component.remove(track('t1', 'Blues'));

    const del = http.expectOne('/api/tracks/t1');
    expect(del.request.method).toBe('DELETE');
    del.flush(null, { status: 204, statusText: 'No Content' });

    expect(component.deletingId()).toBeNull();
    expect(snackBarOpen).toHaveBeenCalledWith('« Blues » a été supprimée.', 'OK', expect.anything());

    const reload = expectList();
    expect(reload.request.params.get('page')).toBe('1');
    reload.flush(page([track('t2', 'Jazz')]));
    expect(component.tracks().map((t) => t.id)).toEqual(['t2']);
  });

  it('la suppression annulée n’envoie aucune requête', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    expectList().flush(page([track('t1', 'Blues')]));

    component.remove(track('t1', 'Blues'));

    http.expectNone('/api/tracks/t1');
    expect(component.deletingId()).toBeNull();
  });

  it('une piste déjà supprimée (404) affiche un message et rafraîchit la liste', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    expectList().flush(page([track('t1', 'Blues'), track('t2', 'Jazz')]));

    component.remove(track('t1', 'Blues'));
    http.expectOne('/api/tracks/t1').flush({ message: 'Piste inconnue' }, { status: 404, statusText: 'Not Found' });

    expect(snackBarOpen).toHaveBeenCalledWith(
      expect.stringContaining('n\'existe plus ou ne vous appartient pas'),
      'OK',
      expect.anything(),
    );
    expectList().flush(page([track('t2', 'Jazz')]));
    expect(component.tracks().map((t) => t.id)).toEqual(['t2']);
  });

  it('l’upload met à jour la progression puis traite l’erreur du serveur', () => {
    expectList().flush(page([]));
    component.file = new File(['abc'], 'song.mp3', { type: 'audio/mpeg' });
    expect(component.uploadStatus()).toBe('idle');

    component.upload();
    expect(component.uploadStatus()).toBe('uploading');
    expect(component.title.disabled).toBe(true);

    const req = http.expectOne((r) => r.method === 'POST' && r.url === '/api/tracks');
    req.event({ type: HttpEventType.UploadProgress, loaded: 25, total: 100 });
    expect(component.uploadProgress()).toBe(25);
    req.event({ type: HttpEventType.UploadProgress, loaded: 75, total: 100 });
    expect(component.uploadProgress()).toBe(75);

    // Seconde soumission pendant l'envoi : ignorée (expectOne échouerait sinon au verify()).
    component.upload();

    req.flush({ message: 'Format audio non accepté' }, { status: 400, statusText: 'Bad Request' });

    expect(component.uploadStatus()).toBe('error');
    expect(component.uploadError()).toBe('Format audio non accepté');
    expect(component.uploadProgress()).toBe(0);
    expect(component.title.enabled).toBe(true);
  });

  it('l’upload réussi passe à l’état success et recharge la première page', () => {
    expectList().flush(page([]));
    component.file = new File(['abc'], 'song.mp3', { type: 'audio/mpeg' });

    component.upload();
    const req = http.expectOne((r) => r.method === 'POST' && r.url === '/api/tracks');
    req.flush(track('t9', 'song'));

    expect(component.uploadStatus()).toBe('success');
    expect(component.uploadSuccess()).toContain('song');
    expect(component.file).toBeUndefined();
    expect(expectList().request.params.get('page')).toBe('1');
  });
});
