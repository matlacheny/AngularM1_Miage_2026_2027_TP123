import { SIZE_LIMITS, validateMediaFile } from './media.model';

/** Fichier factice dont seule la taille déclarée compte (pas d'allocation réelle). */
const fakeFile = (type: string, size: number): File => {
  const file = new File(['x'], 'f', { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

describe('validateMediaFile', () => {
  it('accepte un son, une photo et une vidéo dans leurs limites', () => {
    expect(validateMediaFile(fakeFile('audio/mpeg', 1000))).toBeNull();
    expect(validateMediaFile(fakeFile('image/webp', SIZE_LIMITS.image))).toBeNull();
    expect(validateMediaFile(fakeFile('video/mp4', SIZE_LIMITS.video))).toBeNull();
  });

  it('refuse un format non supporté', () => {
    expect(validateMediaFile(fakeFile('application/pdf', 10))).toContain('Format non supporté');
    expect(validateMediaFile(fakeFile('video/quicktime', 10))).toContain('Format non supporté');
  });

  it('applique la limite propre à chaque catégorie', () => {
    // 20 Mo : acceptable pour un son, trop pour une photo.
    const twentyMb = 20 * 1024 * 1024;
    expect(validateMediaFile(fakeFile('audio/ogg', twentyMb))).toBeNull();
    expect(validateMediaFile(fakeFile('image/jpeg', twentyMb))).toContain('10 Mo maximum (photo)');
    expect(validateMediaFile(fakeFile('video/webm', SIZE_LIMITS.video + 1))).toContain('100 Mo');
  });
});
