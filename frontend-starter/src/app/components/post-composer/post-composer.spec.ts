import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpEventType, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Post } from '../../shared/models/post.model';
import { ACCEPT_BY_KIND, PostComposerComponent } from './post-composer';

const created = { id: 'p9', text: 'Salut' } as Post;

describe('PostComposerComponent', () => {
  let fixture: ComponentFixture<PostComposerComponent>;
  let component: PostComposerComponent;
  let http: HttpTestingController;
  let published: ReturnType<typeof vi.fn<(post: Post) => void>>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [PostComposerComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(PostComposerComponent);
    component = fixture.componentInstance;
    published = vi.fn<(post: Post) => void>();
    component.published.subscribe(published);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => http.verify());

  const chooseFile = (file: File) => {
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { value: [file] });
    component.choose({ target: input } as unknown as Event);
  };

  it('chaque bouton limite le sélecteur de fichiers à son type', () => {
    expect(ACCEPT_BY_KIND.audio).toContain('audio/mpeg');
    expect(ACCEPT_BY_KIND.audio).not.toContain('image/');
    expect(ACCEPT_BY_KIND.video).toBe('video/mp4,video/webm');
  });

  it('rien à publier sans texte ni fichier', () => {
    expect(component.canPublish()).toBe(false);
    component.publish();
    http.expectNone('/api/posts');
  });

  it('post texte seul : POST /api/posts, puis remise à zéro et événement', () => {
    component.text.setValue('  Salut l’escadrille ');
    component.publish();

    const req = http.expectOne('/api/posts');
    expect(req.request.body).toEqual({ text: 'Salut l’escadrille', vehicleId: undefined, visibility: 'public' });
    req.flush(created);

    expect(published).toHaveBeenCalledWith(created);
    expect(component.text.value).toBe('');
  });

  it('avec un fichier : upload dans le hangar puis post qui le référence', () => {
    component.text.setValue('Rotor au décollage');
    component.visibility.setValue('friends');
    chooseFile(new File(['abc'], 'tigre.mp3', { type: 'audio/mpeg' }));
    expect(component.fileKind()).toBe('audio');
    expect(component.expanded()).toBe(true);

    component.publish();
    const upload = http.expectOne('/api/media');
    const body = upload.request.body as FormData;
    expect(body.get('title')).toBe('Rotor au décollage');
    expect(body.get('visibility')).toBe('friends');
    upload.event({ type: HttpEventType.UploadProgress, loaded: 50, total: 100 });
    expect(component.progress()).toBe(50);
    upload.flush({ id: 'm7' });

    const post = http.expectOne('/api/posts');
    expect(post.request.body).toEqual({ text: 'Rotor au décollage', mediaId: 'm7', vehicleId: undefined, visibility: 'friends' });
    post.flush(created);
    expect(published).toHaveBeenCalled();
    expect(component.file()).toBeNull();
  });

  it('refuse un fichier invalide sans appel HTTP', () => {
    chooseFile(new File(['%PDF'], 'notice.pdf', { type: 'application/pdf' }));
    expect(component.file()).toBeNull();
    expect(component.error()).toContain('Format non supporté');
  });

  it('affiche l’erreur du serveur', () => {
    component.text.setValue('x');
    component.publish();
    http.expectOne('/api/posts').flush({ message: 'Véhicule inconnu' }, { status: 400, statusText: 'Bad Request' });
    expect(component.error()).toBe('Véhicule inconnu');
    expect(component.publishing()).toBe(false);
  });
});
