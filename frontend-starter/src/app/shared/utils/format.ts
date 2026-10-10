const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const time = (date: Date) => date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const isYesterday = (date: Date, now: Date) => {
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  return date.toDateString() === yesterday.toDateString();
};

/** En-tête d'un post : « À l'instant », « Il y a 2 h », « Hier à 18:42 », « 3 oct. ». */
export function relativeTime(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const diff = now.getTime() - date.getTime();
  if (diff < MINUTE) return 'À l’instant';
  if (diff < HOUR) return `Il y a ${Math.floor(diff / MINUTE)} min`;
  if (diff < DAY && date.toDateString() === now.toDateString()) return `Il y a ${Math.floor(diff / HOUR)} h`;
  if (isYesterday(date, now)) return `Hier à ${time(date)}`;
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', ...(date.getFullYear() !== now.getFullYear() && { year: 'numeric' }) });
}

/** Colonne « posts récents » : « 5 min », « 2 h », « hier », « 2 j ». */
export function shortRelativeTime(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const diff = now.getTime() - date.getTime();
  if (diff < HOUR) return `${Math.max(1, Math.floor(diff / MINUTE))} min`;
  if (diff < DAY && date.toDateString() === now.toDateString()) return `${Math.floor(diff / HOUR)} h`;
  if (isYesterday(date, now)) return 'hier';
  return `${Math.max(1, Math.round(diff / DAY))} j`;
}

/** « Matteo Lacheny » → « ML », « Demo » → « D ». */
export function initials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

/** Teintes sourdes de la maquette pour les avatars (même nom → même couleur). */
export const AVATAR_COLORS = ['#4f6475', '#7a4a5a', '#56744f', '#8a7340', '#5c5a7a', '#6e5a48'];

export function avatarColor(seed: string | null | undefined): string {
  let hash = 0;
  for (const char of seed ?? '') hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

/** « 1 J'aime », « 48 J'aime », « 0 commentaire », « 12 commentaires ». */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count > 1 ? pluralForm : singular}`;
}
