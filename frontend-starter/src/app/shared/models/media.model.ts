import { VehicleRef } from './vehicle.model';

export type MediaKind = 'audio' | 'image' | 'video';
export type Visibility = 'private' | 'friends' | 'public';

/** Media (son, photo ou vidéo) renvoyé par `/api/media`. */
export interface Media {
  id: string;
  ownerId: string;
  kind: MediaKind;
  title: string;
  originalName: string;
  mimeType: string;
  size: number;
  visibility: Visibility;
  /** Fiche véhicule rattachée, ou `null`. */
  vehicle: VehicleRef | null;
  createdAt: string;
}

/** Réponse de `POST /api/media/:id/stream-url`. */
export interface StreamUrl {
  url: string;
  expiresIn: number;
}

const MB = 1024 * 1024;

/**
 * Miroir du `MEDIA_TYPES` du backend (backend/src/models/Media.js) pour
 * refuser un fichier invalide avant l'appel HTTP. Confort uniquement : le
 * backend revalide et reste l'autorité.
 */
export const MEDIA_TYPES: ReadonlyMap<string, MediaKind> = new Map([
  ['audio/mpeg', 'audio'],
  ['audio/wav', 'audio'],
  ['audio/x-wav', 'audio'],
  ['audio/ogg', 'audio'],
  ['audio/mp4', 'audio'],
  ['audio/x-m4a', 'audio'],
  ['image/jpeg', 'image'],
  ['image/png', 'image'],
  ['image/webp', 'image'],
  ['video/mp4', 'video'],
  ['video/webm', 'video'],
]);

/** Miroir de `SIZE_LIMITS` du backend. */
export const SIZE_LIMITS: Readonly<Record<MediaKind, number>> = {
  audio: 25 * MB,
  image: 10 * MB,
  video: 100 * MB,
};

export const KIND_LABELS: Readonly<Record<MediaKind, string>> = {
  audio: 'Son',
  image: 'Photo',
  video: 'Vidéo',
};

export const VISIBILITY_LABELS: Readonly<Record<Visibility, string>> = {
  private: 'Privé',
  friends: 'Escadrille',
  public: 'Public',
};

/** Valeur de l'attribut `accept` du champ fichier. */
export const ACCEPTED_MEDIA = [...MEDIA_TYPES.keys()].join(',');

/** Retourne un message d'erreur si le fichier est refusé, sinon `null`. */
export function validateMediaFile(file: File): string | null {
  const kind = MEDIA_TYPES.get(file.type);
  if (!kind) {
    return `Format non supporté (${file.type || 'inconnu'}). Sons : MP3, WAV, OGG, M4A — photos : JPEG, PNG, WebP — vidéos : MP4, WebM.`;
  }
  if (file.size > SIZE_LIMITS[kind]) {
    return `Fichier trop volumineux : ${SIZE_LIMITS[kind] / MB} Mo maximum (${KIND_LABELS[kind].toLowerCase()}).`;
  }
  return null;
}
