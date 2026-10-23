import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AppNotification } from '../../shared/models/notification.model';
import { NotificationBellComponent } from './notification-bell';

describe('NotificationBellComponent', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<NotificationBellComponent>;
  const el = () => fixture.nativeElement as HTMLElement;
  const notifications = () => http.expectOne((r) => r.url === '/api/notifications');

  const like: AppNotification = {
    id: 'n1',
    type: 'like',
    actor: { id: 'u2', name: 'Bob' },
    post: { id: 'p1', title: 'Rafale au décollage' },
    excerpt: '',
    read: false,
    createdAt: new Date().toISOString(),
  };
  const comment: AppNotification = { ...like, id: 'n2', type: 'comment', excerpt: 'Superbe son !', read: true };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [NotificationBellComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(NotificationBellComponent);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('affiche la pastille des non lues au chargement', () => {
    notifications().flush({ items: [like], unreadCount: 3 });
    fixture.detectChanges();
    expect(el().querySelector('.badge')?.textContent?.trim()).toBe('3');
    expect(el().querySelector('.panel')).toBeNull();
  });

  it('ouvrir la cloche liste les interactions et marque tout comme lu', () => {
    notifications().flush({ items: [], unreadCount: 1 });
    (el().querySelector('button.bell') as HTMLButtonElement).click();
    fixture.detectChanges();

    notifications().flush({ items: [like, comment], unreadCount: 1 });
    const read = http.expectOne('/api/notifications/read');
    expect(read.request.method).toBe('POST');
    read.flush(null);
    fixture.detectChanges();

    const rows = [...el().querySelectorAll('.panel li a')];
    expect(rows.map((a) => a.querySelector('.what > span')?.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      'Bob a aimé votre publication',
      'Bob a commenté votre publication',
    ]);
    expect(rows[0].classList).toContain('unread');
    expect(rows[0].querySelector('.post')?.textContent).toContain('Rafale au décollage');
    expect(rows[1].querySelector('.excerpt')?.textContent).toBe('Superbe son !');
    expect(rows[0].getAttribute('href')).toBe('/posts/p1');
    expect(el().querySelector('.badge')).toBeNull();
  });

  it('liste vide : message, pas de marquage', () => {
    notifications().flush({ items: [], unreadCount: 0 });
    (el().querySelector('button.bell') as HTMLButtonElement).click();
    notifications().flush({ items: [], unreadCount: 0 });
    fixture.detectChanges();
    expect(el().querySelector('.panel .empty')?.textContent).toContain('Aucune interaction');
  });
});
