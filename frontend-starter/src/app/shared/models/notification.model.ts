/** J'aime ou commentaire reçu sur un de mes posts (`/api/notifications`). */
export interface AppNotification {
  id: string;
  type: 'like' | 'comment';
  /** Membre qui a aimé ou commenté. */
  actor: { id: string; name: string } | null;
  post: { id: string; title: string } | null;
  /** Début du commentaire (vide pour un J'aime). */
  excerpt: string;
  read: boolean;
  createdAt: string;
}

export interface NotificationList {
  items: AppNotification[];
  unreadCount: number;
}
