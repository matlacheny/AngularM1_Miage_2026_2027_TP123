import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from '../services/auth.service';
import { authInterceptor } from './auth.interceptor';

describe('authInterceptor', () => {
  let client: HttpClient;
  let http: HttpTestingController;
  let auth: AuthService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()],
    });
    client = TestBed.inject(HttpClient);
    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
  });

  afterEach(() => http.verify());

  it('ajoute Authorization: Bearer <token> lorsqu’un token existe', () => {
    auth.token.set('jwt-simule');

    client.get('/api/tracks').subscribe();

    const req = http.expectOne('/api/tracks');
    expect(req.request.headers.get('Authorization')).toBe('Bearer jwt-simule');
    req.flush({});
  });

  it('n’ajoute aucun header Authorization sans token', () => {
    client.post('/api/auth/login', {}).subscribe();

    const req = http.expectOne('/api/auth/login');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });
});
