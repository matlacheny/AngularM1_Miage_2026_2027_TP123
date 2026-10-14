import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { Squadron } from '../../shared/models/friend.model';
import { FriendService } from '../../shared/services/friend.service';
import { SquadronPageComponent } from './squadron-page';

const member = (id: string, name: string) => ({ id, name, location: 'Istres', bio: '' });

const squadron: Squadron = {
  friends: [{ ...member('u2', 'Bob'), since: '' }],
  incoming: [{ requestId: 'r1', user: member('u3', 'Eve'), createdAt: '' }],
  outgoing: [{ requestId: 'r2', user: member('u4', 'Zoé'), createdAt: '' }],
};

describe('SquadronPageComponent', () => {
  let fixture: ComponentFixture<SquadronPageComponent>;
  let component: SquadronPageComponent;
  let http: HttpTestingController;

  const element = () => fixture.nativeElement as HTMLElement;
  const render = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SquadronPageComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(SquadronPageComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });

  it('affiche amis, invitations reçues et envoyées, et met à jour la pastille du menu', async () => {
    http.expectOne('/api/friends').flush(squadron);
    await render();

    expect(element().textContent).toContain('Bob');
    expect(element().querySelector('#incoming-title')?.textContent).toContain('1');
    expect(element().textContent).toContain('Eve');
    expect(element().textContent).toContain('Zoé');
    expect(TestBed.inject(FriendService).incomingCount()).toBe(1);
  });

  it('accepter une invitation recharge l’escadrille', () => {
    http.expectOne('/api/friends').flush(squadron);
    component.accept(squadron.incoming[0]);
    http.expectOne('/api/friends/requests/r1/accept').flush({ status: 'friend', requestId: 'r1' });
    http.expectOne('/api/friends').flush({ ...squadron, incoming: [] });
    expect(component.squadron().incoming).toEqual([]);
  });

  it('retirer un ami demande confirmation', () => {
    http.expectOne('/api/friends').flush(squadron);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    component.remove('u2', 'Bob');
    http.expectNone('/api/friends/u2');
  });

  it('recherche de membres à partir de 2 caractères, avec leur relation', async () => {
    http.expectOne('/api/friends').flush(squadron);
    component.findMembers('B');
    http.expectNone((r) => r.url === '/api/users');

    component.findMembers('Bo');
    const req = http.expectOne((r) => r.url === '/api/users');
    expect(req.request.params.get('q')).toBe('Bo');
    req.flush([{ ...member('u2', 'Bob'), relation: { status: 'friend', requestId: 'l1' } }]);
    await render();
    expect(element().querySelector('app-relation-button')?.textContent).toContain('Dans votre escadrille');
  });
});
