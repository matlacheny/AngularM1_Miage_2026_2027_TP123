import { MediaKind, Visibility } from './media.model';
import { VehicleCategory } from './vehicle.model';

/** Publication du fil d'actualité (`/api/posts`). */
export interface Post {
  id: string;
  ownerId: string;
  owner: { id: string; name: string } | null;
  text: string;
  /** Média joint, avec son URL de lecture signée (valable 10 min). */
  media: { id: string; kind: MediaKind; title: string; mimeType: string; url: string } | null;
  vehicle: { id: string; name: string; category: VehicleCategory } | null;
  visibility: Visibility;
  likeCount: number;
  likedByMe: boolean;
  commentCount: number;
  createdAt: string;
}

export interface PostComment {
  id: string;
  postId: string;
  ownerId: string;
  owner: { id: string; name: string } | null;
  text: string;
  createdAt: string;
}

export interface LikeState {
  likeCount: number;
  likedByMe: boolean;
}

export interface NewPost {
  text?: string;
  mediaId?: string;
  vehicleId?: string;
  visibility: Visibility;
}
