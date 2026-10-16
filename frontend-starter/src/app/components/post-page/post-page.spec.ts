import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { Post } from '../../shared/models/post.model';
import { PostPageComponent } from './post-page';

const post: Post = {
  id: 'post-1',
  ownerId: 'u2',
  owner: { id: 'u2', name: 'Thomas Leroy' },
  title: '',
  text: 'Superbe photo de F-15.',
  media: null,
  vehicle: { id: 'v1', name: 'McDonnell Douglas F-15 Eagle', category: 'aircraft' },
  visibility: 'public',
  likeCount: 0,
  likedByMe: false,
  commentCount: 0,
  createdAt: '2026-07-16T10:00:00.000Z',
};

describe('PostPageComponent', () => {
  let fixture: ComponentFixture<PostPageComponent>;
  let http: HttpTestingController;

  const element = () => fixture.nativeElement as HTMLElement;
  const backLink = () => element().querySelector('a.back-link');

  const open = async (vehicle?: string) => {
    fixture.componentRef.setInput('id', 'post-1');
    if (vehicle) fixture.componentRef.setInput('vehicle', vehicle);
    fixture.detectChanges();
    http.expectOne('/api/posts/post-1').flush(post);
    fixture.detectChanges();
    await fixture.whenStable();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [PostPageComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(PostPageComponent);
  });

  it('sans origine, le retour mène au fil', async () => {
    await open();
    expect(backLink()?.getAttribute('href')).toBe('/feed');
    expect(backLink()?.textContent).toContain("Fil d'actualité");
  });

  it('ouvert depuis une fiche (?vehicle=), le retour ramène à cette fiche', async () => {
    await open('v1');
    expect(backLink()?.getAttribute('href')).toBe('/vehicles/v1');
    expect(backLink()?.textContent).toContain('McDonnell Douglas F-15 Eagle');
  });
});
