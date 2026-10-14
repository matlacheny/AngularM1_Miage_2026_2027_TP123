import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Relation } from '../../shared/models/friend.model';
import { RelationButtonComponent } from './relation-button';

describe('RelationButtonComponent', () => {
  let fixture: ComponentFixture<RelationButtonComponent>;
  let component: RelationButtonComponent;
  let http: HttpTestingController;
  let changed: ReturnType<typeof vi.fn<(r: Relation) => void>>;

  const create = async (relation: Relation) => {
    fixture = TestBed.createComponent(RelationButtonComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('userId', 'u2');
    fixture.componentRef.setInput('relation', relation);
    changed = vi.fn<(r: Relation) => void>();
    component.changed.subscribe(changed);
    fixture.detectChanges();
    await fixture.whenStable();
  };
  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [RelationButtonComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });

  it('aucun lien : invite, puis passe à « Invitation envoyée »', async () => {
    await create({ status: 'none', requestId: null });
    expect(text()).toContain("Inviter dans l'escadrille");

    component.invite();
    const req = http.expectOne('/api/friends/requests');
    expect(req.request.body).toEqual({ userId: 'u2' });
    req.flush({ status: 'outgoing', requestId: 'r1' });
    fixture.detectChanges();

    expect(text()).toContain('Invitation envoyée');
    expect(changed).toHaveBeenCalledWith({ status: 'outgoing', requestId: 'r1' });
  });

  it('invitation reçue : accepter', async () => {
    await create({ status: 'incoming', requestId: 'r1' });
    component.accept();
    http.expectOne('/api/friends/requests/r1/accept').flush({ status: 'friend', requestId: 'r1' });
    expect(component.state().status).toBe('friend');
  });

  it('invitation envoyée : annuler revient à « aucun lien »', async () => {
    await create({ status: 'outgoing', requestId: 'r1' });
    component.dismiss();
    const req = http.expectOne('/api/friends/requests/r1');
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    expect(component.state()).toEqual({ status: 'none', requestId: null });
  });

  it('ami : « Dans votre escadrille », retrait après confirmation', async () => {
    await create({ status: 'friend', requestId: 'r1' });
    expect(text()).toContain('Dans votre escadrille');

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    component.remove();
    const req = http.expectOne('/api/friends/u2');
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    expect(component.state().status).toBe('none');
  });

  it('affiche l’erreur du serveur', async () => {
    await create({ status: 'none', requestId: null });
    component.invite();
    http.expectOne('/api/friends/requests').flush({ message: 'Invitation déjà envoyée' }, { status: 409, statusText: 'Conflict' });
    expect(component.error()).toBe('Invitation déjà envoyée');
    expect(component.state().status).toBe('none');
  });
});
