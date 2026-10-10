import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AvatarComponent } from '../../shared/components/avatar/avatar';
import { FlagBackdropComponent } from '../../shared/components/flag-backdrop/flag-backdrop';
import { IconComponent } from '../../shared/components/icon/icon';
import { VehicleSilhouetteComponent } from '../../shared/components/vehicle-silhouette/vehicle-silhouette';
import { KIND_LABELS, MediaKind } from '../../shared/models/media.model';
import { Post } from '../../shared/models/post.model';
import { UserProfile } from '../../shared/models/user.model';
import { Origin } from '../../shared/models/vehicle.model';
import { AuthService } from '../../shared/services/auth.service';
import { PostService } from '../../shared/services/post.service';
import { UserService } from '../../shared/services/user.service';
import { PostCardComponent } from '../post-card/post-card';

export const PROFILE_PAGE_SIZE = 10;

/**
 * Pays le plus représenté parmi les véhicules préférés : son drapeau sert de
 * bandeau au profil (à égalité, le premier favori l'emporte).
 */
export function bannerOrigin(favorites: UserProfile['favorites']): Origin[] {
  const counts = new Map<string, { origin: Origin; count: number }>();
  for (const vehicle of favorites) {
    for (const origin of vehicle.origins) {
      const entry = counts.get(origin.name) ?? { origin, count: 0 };
      entry.count++;
      counts.set(origin.name, entry);
    }
  }
  const best = [...counts.values()].sort((a, b) => b.count - a.count)[0];
  return best ? [best.origin] : [];
}

/**
 * Profil (maquette « Profil ») : `/profile` pour soi, `/users/:id` pour un
 * autre membre. Bandeau drapeau, identité, biographie, compteurs, véhicules
 * préférés, puis publications filtrables.
 */
@Component({
  imports: [
    ReactiveFormsModule,
    RouterLink,
    AvatarComponent,
    FlagBackdropComponent,
    IconComponent,
    VehicleSilhouetteComponent,
    PostCardComponent,
  ],
  templateUrl: './profile-page.html',
  styleUrl: './profile-page.css',
})
export class ProfilePageComponent {
  readonly auth = inject(AuthService);
  private readonly users = inject(UserService);
  private readonly postService = inject(PostService);

  /** `:id` de /users/:id ; absent sur /profile (profil de l'utilisateur connecté). */
  readonly id = input<string>();

  readonly targetId = computed(() => this.id() ?? this.auth.currentUser()?.id ?? null);
  readonly isMe = computed(() => !!this.targetId() && this.targetId() === this.auth.currentUser()?.id);

  readonly profile = signal<UserProfile | null>(null);
  readonly notFound = signal(false);
  readonly banner = computed(() => bannerOrigin(this.profile()?.favorites ?? []));
  readonly memberSince = computed(() => {
    const created = this.profile()?.createdAt;
    return created ? new Date(created).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : '';
  });

  readonly kindLabels = KIND_LABELS;
  readonly kinds: MediaKind[] = ['audio', 'image', 'video'];
  readonly kind = signal<MediaKind | null>(null);
  readonly posts = signal<Post[]>([]);
  readonly page = signal(1);
  readonly hasMore = signal(false);
  readonly loadingPosts = signal(false);

  readonly editing = signal(false);
  readonly saving = signal(false);
  readonly saveError = signal('');
  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(2)] }),
    location: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(80)] }),
    bio: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(300)] }),
  });

  constructor() {
    // Sur /profile, l'identifiant arrive avec l'utilisateur connecté (chargé par AppComponent).
    effect(() => {
      const id = this.targetId();
      if (!id) return;
      untracked(() => this.load(id));
    });
  }

  private load(id: string): void {
    this.notFound.set(false);
    this.editing.set(false);
    this.kind.set(null);
    this.users.profile(id).subscribe({
      next: (profile) => this.profile.set(profile),
      error: (error: HttpErrorResponse) => {
        console.error('[ProfilePage] Profil introuvable', error.status);
        this.profile.set(null);
        this.notFound.set(true);
      },
    });
    this.loadPosts(1);
  }

  loadPosts(page: number): void {
    const author = this.targetId();
    if (!author) return;
    this.loadingPosts.set(true);
    this.postService.feed(page, PROFILE_PAGE_SIZE, false, { author, kind: this.kind() ?? undefined }).subscribe({
      next: (response) => {
        this.posts.update((list) => (page === 1 ? response.docs : [...list, ...response.docs]));
        this.page.set(page);
        this.hasMore.set(response.page < response.totalPages);
        this.loadingPosts.set(false);
      },
      error: (error: HttpErrorResponse) => {
        console.error('[ProfilePage] Publications indisponibles', error.status);
        this.loadingPosts.set(false);
      },
    });
  }

  filter(kind: MediaKind | null): void {
    this.kind.set(kind);
    this.loadPosts(1);
  }

  more(): void {
    if (!this.loadingPosts() && this.hasMore()) this.loadPosts(this.page() + 1);
  }

  onDeleted(id: string): void {
    this.posts.update((list) => list.filter((p) => p.id !== id));
    this.profile.update((p) => (p ? { ...p, postCount: Math.max(0, p.postCount - 1) } : p));
  }

  startEdit(): void {
    const p = this.profile();
    if (!p) return;
    this.form.setValue({ name: p.name, location: p.location, bio: p.bio });
    this.saveError.set('');
    this.editing.set(true);
  }

  save(): void {
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);
    const changes = this.form.getRawValue();
    this.auth.updateProfile(changes).subscribe({
      next: () => {
        this.profile.update((p) => (p ? { ...p, ...changes } : p));
        this.saving.set(false);
        this.editing.set(false);
      },
      error: (error: HttpErrorResponse) => {
        console.error('[ProfilePage] Enregistrement impossible', error.status);
        this.saveError.set(error.error?.message ?? 'Impossible d’enregistrer le profil.');
        this.saving.set(false);
      },
    });
  }
}
