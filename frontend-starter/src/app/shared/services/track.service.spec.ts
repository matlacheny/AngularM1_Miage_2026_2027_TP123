import { TestBed } from '@angular/core/testing';
import { HttpEventType, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TrackService } from './track.service';

describe('TrackService', () => {
  let service: TrackService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(TrackService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('list() transmet page et limit en paramètres de GET /api/tracks', () => {
    service.list(3, 5).subscribe();

    const req = http.expectOne((r) => r.url === '/api/tracks');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('page')).toBe('3');
    expect(req.request.params.get('limit')).toBe('5');
    // Sans filtre, le paramètre title ne doit pas être envoyé du tout.
    expect(req.request.params.has('title')).toBe(false);
    expect(req.request.urlWithParams).toBe('/api/tracks?page=3&limit=5');
    req.flush({ docs: [], totalDocs: 0, limit: 5, page: 3, totalPages: 1 });
  });

  it('delete() envoie DELETE /api/tracks/:id', () => {
    let done = false;
    service.delete('abc123').subscribe(() => (done = true));

    const req = http.expectOne('/api/tracks/abc123');
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });

    expect(done).toBe(true);
  });

  it('upload() envoie un multipart avec exactement audio et title, et expose la progression', () => {
    const file = new File(['abc'], 'song.mp3', { type: 'audio/mpeg' });
    const types: HttpEventType[] = [];

    service.upload(file, 'Mon titre').subscribe((event) => types.push(event.type));

    const req = http.expectOne('/api/tracks');
    expect(req.request.method).toBe('POST');
    expect(req.request.reportProgress).toBe(true);
    const body = req.request.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect([...body.keys()]).toEqual(['audio', 'title']);
    expect((body.get('audio') as File).name).toBe('song.mp3');
    expect(body.get('title')).toBe('Mon titre');

    req.event({ type: HttpEventType.UploadProgress, loaded: 1, total: 3 });
    req.flush({ id: 't1', title: 'Mon titre' });

    expect(types).toContain(HttpEventType.UploadProgress);
    expect(types).toContain(HttpEventType.Response);
  });
});
