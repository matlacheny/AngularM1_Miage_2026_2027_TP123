import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { Post } from '../../shared/models/post.model';
import { AuthService } from '../../shared/services/auth.service';
import { PostCardComponent } from './post-card';

const post = (overrides: Partial<Post> = {}): Post => ({
  id: 'p1',
  ownerId: 'u2',
  owner: { id: 'u2', name: 'Lucas Bernard' },
  title: 'Rafale en virage',
  text: 'Passage à basse altitude.',
  media: { id: 'm1', kind: 'image', title: 'Rafale', mimeType: 'image/jpeg', url: '/api/media/m1/file?token=t' },
  vehicle: { id: 'v1', name: 'Dassault Rafale', category: 'aircraft' },
  visibility: 'public',
  likeCount: 48,
  likedByMe: false,
  commentCount: 12,
  createdAt: new Date(Date.now() - 2 * 3600e3).toISOString(),
  ...overrides,
});

describe('PostCardComponent', () => {
  let fixture: ComponentFixture<PostCardComponent>;
  let component: PostCardComponent;
  let http: HttpTestingController;

  const element = () => fixture.nativeElement as HTMLElement;
  const render = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
  };
  const create = async (p: Post) => {
    fixture = TestBed.createComponent(PostCardComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('post', p);
    await render();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [PostCardComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthService).currentUser.set({ id: 'u1', name: 'Matteo Lacheny', email: 'm@x.fr', createdAt: '' });
  });

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });

  it('affiche auteur, date relative, visibilité, texte, véhicule, type et compteurs', async () => {
    await create(post());
    const text = element().textContent ?? '';
    expect(text).toContain('Lucas Bernard');
    expect(element().querySelector('a.author')?.getAttribute('href')).toBe('/users/u2');
    expect(text).toContain('Il y a 2 h · Public');
    expect(text).toContain('Passage à basse altitude.');
    expect(element().querySelector('h3.title')?.textContent).toBe('Rafale en virage');
    expect(element().querySelector('a.vehicle-chip')?.getAttribute('href')).toBe('/vehicles/v1');
    expect(element().querySelector('.pill-accent')?.textContent).toContain('Photo');
    expect(element().querySelector('.media img')?.getAttribute('src')).toBe('/api/media/m1/file?token=t');
    expect(text).toContain('48 J’aime');
    expect(text).toContain('12 commentaires');
  });

  it('sans titre : pas d’intitulé affiché', async () => {
    await create(post({ title: '' }));
    expect(element().querySelector('h3.title')).toBeNull();
  });

  it('son : lecteur audio ; vidéo : balise vidéo avec contrôles', async () => {
    await create(post({ media: { id: 'm2', kind: 'audio', title: 'Rotor', mimeType: 'audio/mpeg', url: '/a' } }));
    expect(element().querySelector('app-audio-player audio')?.getAttribute('src')).toBe('/a');

    await create(post({ media: { id: 'm3', kind: 'video', title: 'Leclerc', mimeType: 'video/mp4', url: '/v' } }));
    expect(element().querySelector('.media video')?.hasAttribute('controls')).toBe(true);
  });

  it('J’aime optimiste puis confirmé par le serveur', async () => {
    await create(post());
    component.toggleLike();
    expect(component.state().likedByMe).toBe(true);
    expect(component.state().likeCount).toBe(49);

    const req = http.expectOne('/api/posts/p1/like');
    expect(req.request.method).toBe('PUT');
    req.flush({ likeCount: 50, likedByMe: true });
    expect(component.state().likeCount).toBe(50);
  });

  it('retirer son J’aime envoie DELETE ; une erreur annule le changement', async () => {
    await create(post({ likedByMe: true, likeCount: 3 }));
    component.toggleLike();
    expect(component.state().likeCount).toBe(2);
    const req = http.expectOne('/api/posts/p1/like');
    expect(req.request.method).toBe('DELETE');
    req.flush({ message: 'Publication inconnue' }, { status: 404, statusText: 'Not Found' });
    expect(component.state()).toEqual(expect.objectContaining({ likedByMe: true, likeCount: 3 }));
  });

  it('commentaires : chargés à l’ouverture, ajout qui met le compteur à jour', async () => {
    await create(post());
    component.toggleComments();
    http.expectOne((r) => r.url === '/api/posts/p1/comments').flush({
      docs: [{ id: 'c1', postId: 'p1', ownerId: 'u3', owner: { id: 'u3', name: 'Hugo Petit' }, text: 'Superbe', createdAt: new Date().toISOString() }],
      totalDocs: 1,
      limit: 20,
      page: 1,
      totalPages: 1,
    });
    await render();
    expect(element().querySelector('.comment')?.textContent).toContain('Superbe');

    component.commentText.setValue('  Magnifique ');
    component.sendComment();
    const req = http.expectOne((r) => r.method === 'POST' && r.url === '/api/posts/p1/comments');
    expect(req.request.body).toEqual({ text: 'Magnifique' });
    req.flush({ comment: { id: 'c2', postId: 'p1', ownerId: 'u1', owner: { id: 'u1', name: 'Matteo Lacheny' }, text: 'Magnifique', createdAt: new Date().toISOString() }, commentCount: 13 });
    await render();

    expect(component.comments().length).toBe(2);
    expect(element().textContent).toContain('13 commentaires');
    expect(component.commentText.value).toBe('');
  });

  it('Partager copie le lien permanent du post', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await create(post());

    component.share();
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith(`${location.origin}/posts/p1`);
  });

  it('menu de suppression réservé à l’auteur', async () => {
    await create(post());
    expect(component.isMine()).toBe(false);
    expect(element().querySelector('.menu')).toBeNull();

    await create(post({ ownerId: 'u1' }));
    expect(component.isMine()).toBe(true);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const deleted = vi.fn<(id: string) => void>();
    component.deleted.subscribe(deleted);

    component.remove();
    const req = http.expectOne('/api/posts/p1');
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    expect(deleted).toHaveBeenCalledWith('p1');
  });
});
