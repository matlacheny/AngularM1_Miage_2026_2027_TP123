import { Component, effect, inject, input, signal, untracked } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { IconComponent } from '../../shared/components/icon/icon';
import { Post } from '../../shared/models/post.model';
import { PostService } from '../../shared/services/post.service';
import { PostCardComponent } from '../post-card/post-card';

/** Lien permanent d'une publication (bouton « Partager »). */
@Component({
  imports: [RouterLink, IconComponent, PostCardComponent],
  template: `
    <a class="back-link" routerLink="/feed"><app-icon name="arrow-left" /> Fil d'actualité</a>
    @if (post(); as p) {
      <app-post-card [post]="p" (deleted)="onDeleted()" />
    } @else if (notFound()) {
      <p class="error" role="alert">Cette publication n'existe pas ou ne vous est pas visible.</p>
    } @else {
      <p class="hint">Chargement…</p>
    }
  `,
  styles: `:host { display: block; max-width: 660px; margin: 0 auto; }`,
})
export class PostPageComponent {
  private readonly posts = inject(PostService);
  private readonly router = inject(Router);

  readonly id = input.required<string>();
  readonly post = signal<Post | null>(null);
  readonly notFound = signal(false);

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => {
        this.post.set(null);
        this.notFound.set(false);
        this.posts.get(id).subscribe({
          next: (post) => this.post.set(post),
          error: (error: HttpErrorResponse) => {
            console.error('[PostPage] Publication introuvable', error.status);
            this.notFound.set(true);
          },
        });
      });
    });
  }

  onDeleted(): void {
    void this.router.navigateByUrl('/feed');
  }
}
