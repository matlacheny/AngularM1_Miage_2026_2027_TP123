import { Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AudioPlayerComponent } from '../../shared/components/audio-player/audio-player';
import { AvatarComponent } from '../../shared/components/avatar/avatar';
import { IconComponent } from '../../shared/components/icon/icon';
import { KIND_LABELS, VISIBILITY_LABELS } from '../../shared/models/media.model';
import { Post, PostComment } from '../../shared/models/post.model';
import { AuthService } from '../../shared/services/auth.service';
import { PostService } from '../../shared/services/post.service';
import { plural, relativeTime } from '../../shared/utils/format';

/** Carte d'une publication du fil (maquette « Accueil »). */
@Component({
  selector: 'app-post-card',
  imports: [ReactiveFormsModule, RouterLink, AudioPlayerComponent, AvatarComponent, IconComponent],
  templateUrl: './post-card.html',
  styleUrl: './post-card.css',
})
export class PostCardComponent {
  private readonly posts = inject(PostService);
  private readonly auth = inject(AuthService);

  readonly post = input.required<Post>();
  readonly deleted = output<string>();

  /** Copie locale : J'aime et compteurs évoluent sans recharger le fil. */
  readonly state = linkedSignal(() => this.post());

  readonly kindLabels = KIND_LABELS;
  readonly visibilityLabels = VISIBILITY_LABELS;
  readonly isMine = computed(() => this.state().ownerId === this.auth.currentUser()?.id);
  readonly when = computed(() => relativeTime(this.state().createdAt));
  readonly likesLabel = computed(() => plural(this.state().likeCount, 'J’aime', 'J’aime'));
  readonly commentsLabel = computed(() => plural(this.state().commentCount, 'commentaire'));

  readonly menuOpen = signal(false);
  readonly liking = signal(false);
  readonly commentsOpen = signal(false);
  readonly comments = signal<PostComment[]>([]);
  readonly commentError = signal('');
  readonly sending = signal(false);
  readonly status = signal('');

  readonly commentText = new FormControl('', { nonNullable: true });

  /** J'aime optimiste : l'interface change tout de suite, et revient en arrière en cas d'erreur. */
  toggleLike(): void {
    if (this.liking()) return;
    const before = this.state();
    const liked = !before.likedByMe;
    this.liking.set(true);
    this.state.set({ ...before, likedByMe: liked, likeCount: before.likeCount + (liked ? 1 : -1) });

    this.posts.like(before.id, liked).subscribe({
      next: (likes) => {
        this.state.update((p) => ({ ...p, ...likes }));
        this.liking.set(false);
      },
      error: (error: HttpErrorResponse) => {
        console.error('[PostCard] J’aime impossible', error.status);
        this.state.set(before);
        this.liking.set(false);
      },
    });
  }

  toggleComments(): void {
    const open = !this.commentsOpen();
    this.commentsOpen.set(open);
    if (open) this.loadComments();
  }

  private loadComments(): void {
    this.commentError.set('');
    this.posts.comments(this.state().id).subscribe({
      next: (page) => this.comments.set(page.docs),
      error: (error: HttpErrorResponse) => {
        console.error('[PostCard] Commentaires indisponibles', error.status);
        this.commentError.set(error.error?.message ?? 'Impossible de charger les commentaires.');
      },
    });
  }

  sendComment(): void {
    const text = this.commentText.value.trim();
    if (!text || this.sending()) return;
    this.sending.set(true);
    this.posts.comment(this.state().id, text).subscribe({
      next: ({ comment, commentCount }) => {
        this.comments.update((list) => [...list, comment]);
        this.state.update((p) => ({ ...p, commentCount }));
        this.commentText.setValue('');
        this.sending.set(false);
      },
      error: (error: HttpErrorResponse) => {
        console.error('[PostCard] Commentaire refusé', error.status);
        this.commentError.set(error.error?.message ?? 'Impossible d’envoyer le commentaire.');
        this.sending.set(false);
      },
    });
  }

  /** Copie le lien permanent du post. */
  share(): void {
    const url = `${location.origin}/posts/${this.state().id}`;
    const done = (message: string) => {
      this.status.set(message);
      setTimeout(() => this.status.set(''), 2500);
    };
    if (!navigator.clipboard) {
      done(url);
      return;
    }
    navigator.clipboard.writeText(url).then(
      () => done('Lien copié'),
      () => done(url),
    );
  }

  remove(): void {
    this.menuOpen.set(false);
    if (!confirm('Supprimer cette publication ? Son média sera supprimé partout, hangar compris.')) return;
    this.posts.delete(this.state().id).subscribe({
      next: () => this.deleted.emit(this.state().id),
      error: (error: HttpErrorResponse) => {
        console.error('[PostCard] Suppression impossible', error.status);
        this.status.set(error.error?.message ?? 'Suppression impossible.');
      },
    });
  }

  commentWhen(comment: PostComment): string {
    return relativeTime(comment.createdAt);
  }
}
