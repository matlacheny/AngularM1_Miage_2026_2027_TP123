import { AVATAR_COLORS, avatarColor, initials, plural, relativeTime, shortRelativeTime } from './format';

const NOW = new Date('2026-10-10T15:00:00');
const at = (iso: string) => new Date(iso).toISOString();

describe('format', () => {
  it('relativeTime : à l’instant, minutes, heures, hier, puis date', () => {
    expect(relativeTime(at('2026-10-10T14:59:40'), NOW)).toBe('À l’instant');
    expect(relativeTime(at('2026-10-10T14:35:00'), NOW)).toBe('Il y a 25 min');
    expect(relativeTime(at('2026-10-10T13:00:00'), NOW)).toBe('Il y a 2 h');
    expect(relativeTime(at('2026-10-09T18:42:00'), NOW)).toBe('Hier à 18:42');
    expect(relativeTime(at('2026-10-03T09:00:00'), NOW)).toMatch(/^3 oct/);
  });

  it('shortRelativeTime : « 2 h », « hier », « 2 j » pour la colonne de droite', () => {
    expect(shortRelativeTime(at('2026-10-10T14:50:00'), NOW)).toBe('10 min');
    expect(shortRelativeTime(at('2026-10-10T13:00:00'), NOW)).toBe('2 h');
    expect(shortRelativeTime(at('2026-10-09T10:00:00'), NOW)).toBe('hier');
    expect(shortRelativeTime(at('2026-10-08T12:00:00'), NOW)).toBe('2 j');
  });

  it('initiales et couleur d’avatar stable', () => {
    expect(initials('Matteo Lacheny')).toBe('ML');
    expect(initials('Demo')).toBe('D');
    expect(initials(null)).toBe('?');
    expect(avatarColor('Lucas Bernard')).toBe(avatarColor('Lucas Bernard'));
    expect(AVATAR_COLORS).toContain(avatarColor('Sarah Nguyen'));
  });

  it('plural', () => {
    expect(plural(1, 'commentaire')).toBe('1 commentaire');
    expect(plural(12, 'commentaire')).toBe('12 commentaires');
  });
});
