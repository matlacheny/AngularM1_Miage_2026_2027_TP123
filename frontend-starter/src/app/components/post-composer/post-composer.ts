import { Component, ElementRef, computed, inject, output, signal, viewChild } from '@angular/core';
import { HttpErrorResponse, HttpEventType } from '@angular/common/http';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { filter, map, switchMap } from 'rxjs';
import { AvatarComponent } from '../../shared/components/avatar/avatar';
import { IconComponent } from '../../shared/components/icon/icon';
import { MEDIA_TYPES, Media, MediaKind, VISIBILITY_LABELS, Visibility, validateMediaFile } from '../../shared/models/media.model';
import { Post } from '../../shared/models/post.model';
import { Vehicle } from '../../shared/models/vehicle.model';
import { AuthService } from '../../shared/services/auth.service';
import { MediaService } from '../../shared/services/media.service';
import { PostService } from '../../shared/services/post.service';
import { VehiclePickerComponent } from '../vehicle-picker/vehicle-picker';

/** Types acceptés par chaque bouton (Son / Photo / Vidéo). */
export const ACCEPT_BY_KIND: Readonly<Record<MediaKind, string>> = {
  audio: [...MEDIA_TYPES].filter(([, k]) => k === 'audio').map(([t]) => t).join(','),
  image: [...MEDIA_TYPES].filter(([, k]) => k === 'image').map(([t]) => t).join(','),
  video: [...MEDIA_TYPES].filter(([, k]) => k === 'video').map(([t]) => t).join(','),
};

/**
 * Zone « Partagez un son, une photo ou une vidéo… » du fil.
 * Avec un fichier : upload dans le hangar (avec progression), puis création
 * du post qui le référence. Sans fichier : post texte seul.
 */
@Component({
  selector: 'app-post-composer',
  imports: [ReactiveFormsModule, AvatarComponent, IconComponent, VehiclePickerComponent],
  templateUrl: './post-composer.html',
  styleUrl: './post-composer.css',
})
export class PostComposerComponent {
  private readonly mediaService = inject(MediaService);
  private readonly posts = inject(PostService);
  readonly auth = inject(AuthService);

  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');

  readonly published = output<Post>();

  readonly visibilities: Visibility[] = ['public', 'friends', 'private'];
  readonly visibilityLabels = VISIBILITY_LABELS;

  readonly text = new FormControl('', { nonNullable: true });
  readonly visibility = new FormControl<Visibility>('public', { nonNullable: true });
  readonly file = signal<File | null>(null);
  readonly vehicle = signal<Vehicle | null>(null);
  readonly accept = signal('');
  readonly focused = signal(false);
  readonly publishing = signal(false);
  readonly progress = signal(0);
  readonly error = signal('');

  /** Les options (véhicule, visibilité) apparaissent dès qu'on commence un post. */
  readonly expanded = computed(() => this.focused() || this.file() !== null);
  readonly fileKind = computed(() => {
    const file = this.file();
    return file ? (MEDIA_TYPES.get(file.type) ?? null) : null;
  });

  pick(kind: MediaKind): void {
    this.accept.set(ACCEPT_BY_KIND[kind]);
    const input = this.fileInput().nativeElement;
    input.accept = ACCEPT_BY_KIND[kind];
    input.click();
  }

  choose(event: Event): void {
    const input = event.target as HTMLInputElement;
    const selected = input.files?.[0] ?? null;
    input.value = '';
    this.error.set('');
    if (!selected) return;

    const problem = validateMediaFile(selected);
    if (problem) {
      this.error.set(problem);
      return;
    }
    this.file.set(selected);
  }

  clearFile(): void {
    this.file.set(null);
  }

  canPublish(): boolean {
    return !this.publishing() && (this.text.value.trim().length > 0 || this.file() !== null);
  }

  publish(): void {
    if (!this.canPublish()) return;
    const text = this.text.value.trim();
    const visibility = this.visibility.value;
    const vehicleId = this.vehicle()?.id;
    const file = this.file();

    this.publishing.set(true);
    this.progress.set(0);
    this.error.set('');

    const created$ = file
      ? this.mediaService.upload(file, text.slice(0, 120) || file.name, visibility, vehicleId).pipe(
          map((event) => {
            if (event.type === HttpEventType.UploadProgress && event.total) {
              this.progress.set(Math.round((100 * event.loaded) / event.total));
            }
            return event.type === HttpEventType.Response ? event.body : null;
          }),
          filter((media): media is Media => media !== null),
          switchMap((media) => this.posts.create({ text, mediaId: media.id, vehicleId, visibility })),
        )
      : this.posts.create({ text, vehicleId, visibility });

    created$.subscribe({
      next: (post) => {
        this.publishing.set(false);
        this.reset();
        this.published.emit(post);
      },
      error: (error: HttpErrorResponse) => {
        console.error('[PostComposer] Publication impossible', error.status);
        this.publishing.set(false);
        this.error.set(error.error?.message ?? 'Impossible de publier.');
      },
    });
  }

  private reset(): void {
    this.text.setValue('');
    this.file.set(null);
    this.vehicle.set(null);
    this.focused.set(false);
    this.progress.set(0);
  }
}
