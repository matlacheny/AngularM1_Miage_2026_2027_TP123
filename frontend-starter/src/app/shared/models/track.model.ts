/** Audio track metadata returned by the API. */
export interface Track {
  id: string;
  title: string;
  originalName: string;
  mimeType: string;
  size: number;
  /**
   * Cover artwork found automatically at upload time from ID3 tags/filename
   * via the public iTunes Search API (see backend/src/app.js `findCoverUrl`).
   * `null` when no match was found — never blocks the upload itself.
   * Points to Apple's public CDN: unlike `/tracks/:id/audio`, no JWT needed.
   */
  coverUrl: string | null;
  createdAt: string;
}

/**
 * Mirrors the backend's Multer `fileFilter` (backend/src/app.js) so the
 * frontend can reject an obviously invalid file before the HTTP call.
 * This is a UX convenience only: the backend re-validates independently and
 * remains the actual authority (never trust a client-side check).
 */
export const ALLOWED_AUDIO_TYPES: ReadonlySet<string> = new Set([
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/mp4',
  'audio/x-m4a',
]);

/** Mirrors the backend's Multer `limits.fileSize` (backend/src/app.js). */
export const MAX_AUDIO_SIZE = 25 * 1024 * 1024;
