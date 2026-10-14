import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Page } from '../models/page.model';
import { MediaKind } from '../models/media.model';
import { LikeState, NewPost, Post, PostComment } from '../models/post.model';

/** Opérations HTTP du fil d'actualité. */
@Injectable({ providedIn: 'root' })
export class PostService {
  private readonly http = inject(HttpClient);

  /**
   * Posts visibles, les plus récents d'abord. `others` exclut les miens ;
   * `author` / `kind` filtrent par auteur et type de média (page profil) ;
   * `scope: 'friends'` ne garde que les posts de l'escadrille.
   */
  feed(page = 1, limit = 10, others = false, filters: { author?: string; kind?: MediaKind; scope?: 'friends' } = {}) {
    const params: Record<string, string | number> = { page, limit };
    if (others) params['others'] = 1;
    if (filters.author) params['author'] = filters.author;
    if (filters.kind) params['kind'] = filters.kind;
    if (filters.scope) params['scope'] = filters.scope;
    return this.http.get<Page<Post>>('/api/posts/feed', { params });
  }

  get(id: string) {
    return this.http.get<Post>(`/api/posts/${id}`);
  }

  create(post: NewPost) {
    return this.http.post<Post>('/api/posts', post);
  }

  delete(id: string) {
    return this.http.delete<void>(`/api/posts/${id}`);
  }

  like(id: string, liked: boolean) {
    const url = `/api/posts/${id}/like`;
    return liked ? this.http.put<LikeState>(url, {}) : this.http.delete<LikeState>(url);
  }

  comments(id: string, page = 1) {
    return this.http.get<Page<PostComment>>(`/api/posts/${id}/comments`, { params: { page, limit: 20 } });
  }

  comment(id: string, text: string) {
    return this.http.post<{ comment: PostComment; commentCount: number }>(`/api/posts/${id}/comments`, { text });
  }
}
