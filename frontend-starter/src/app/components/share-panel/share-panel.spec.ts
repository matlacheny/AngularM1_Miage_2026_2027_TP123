import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { SharePanelComponent } from './share-panel';

const friend = (id: string, name: string) => ({ id, name, location: '', bio: '', since: '' });

describe('SharePanelComponent', () => {
  let fixture: ComponentFixture<SharePanelComponent>;
  let component: SharePanelComponent;
  let http: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [SharePanelComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(SharePanelComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('mediaId', 'm1');
    fixture.detectChanges();
    http.expectOne('/api/friends').flush({ friends: [friend('u2', 'Bob'), friend('u3', 'Eve')], incoming: [], outgoing: [] });
    http.expectOne('/api/media/m1/shares').flush([{ id: 'u2', name: 'Bob' }]);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => http.verify());

  it('liste l’escadrille avec l’état du partage', () => {
    expect(component.isShared('u2')).toBe(true);
    expect(component.isShared('u3')).toBe(false);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Partagé · Arrêter');
  });

  it('partager puis arrêter le partage', () => {
    component.toggle(friend('u3', 'Eve'), true);
    const share = http.expectOne('/api/media/m1/shares/u3');
    expect(share.request.method).toBe('PUT');
    share.flush([{ id: 'u2', name: 'Bob' }, { id: 'u3', name: 'Eve' }]);
    expect(component.isShared('u3')).toBe(true);

    component.toggle(friend('u2', 'Bob'), false);
    const stop = http.expectOne('/api/media/m1/shares/u2');
    expect(stop.request.method).toBe('DELETE');
    stop.flush([{ id: 'u3', name: 'Eve' }]);
    expect(component.isShared('u2')).toBe(false);
  });

  it('affiche le refus du serveur', () => {
    component.toggle(friend('u3', 'Eve'), true);
    http
      .expectOne('/api/media/m1/shares/u3')
      .flush({ message: "Vous ne pouvez partager qu'avec un membre de votre escadrille" }, { status: 400, statusText: 'Bad Request' });
    expect(component.error()).toContain('escadrille');
  });
});
