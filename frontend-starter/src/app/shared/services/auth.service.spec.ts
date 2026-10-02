import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('login() envoie POST /api/auth/login avec { email, password } et mémorise le token', () => {
    const user = { id: 'u1', name: 'Demo', email: 'demo@example.com' };
    let received: unknown;

    service.login('demo@example.com', 'secret123').subscribe((response) => (received = response));

    const req = http.expectOne('/api/auth/login');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: 'demo@example.com', password: 'secret123' });

    req.flush({ token: 'jwt-simule', user });

    expect(received).toEqual({ token: 'jwt-simule', user });
    expect(service.token()).toBe('jwt-simule');
    expect(service.currentUser()).toEqual(user);
    expect(localStorage.getItem('gpc_token')).toBe('jwt-simule');
  });

  it('login() refusé (401) ne mémorise aucun token', () => {
    let status = 0;

    service.login('demo@example.com', 'mauvais').subscribe({
      error: (error: { status: number }) => (status = error.status),
    });

    http
      .expectOne('/api/auth/login')
      .flush({ message: 'Identifiants invalides' }, { status: 401, statusText: 'Unauthorized' });

    expect(status).toBe(401);
    expect(service.token()).toBeNull();
    expect(localStorage.getItem('gpc_token')).toBeNull();
  });
});
