export type VehicleCategory = 'helicopter' | 'aircraft' | 'tank' | 'armored';

/** Pays d'origine (Wikidata) : code ISO (null pour un État disparu) et drapeau. */
export interface Origin {
  name: string;
  code: string | null;
  flagUrl: string | null;
}

/** Fiche véhicule renvoyée par `/api/vehicles` (données issues de Wikipédia/Wikidata). */
export interface Vehicle {
  id: string;
  wikidataId: string;
  name: string;
  category: VehicleCategory;
  countries: string[];
  origins: Origin[];
  /** Nombre de médias publics (présent dans les listes du catalogue). */
  mediaCount?: number;
  summary: string;
  imageUrl: string | null;
  wikipediaUrl: string;
  createdAt: string;
}

/** Référence légère à une fiche, incluse dans chaque média. */
export interface VehicleRef {
  id: string;
  name: string | null;
}

export const CATEGORY_LABELS: Readonly<Record<VehicleCategory, string>> = {
  aircraft: 'Avion',
  helicopter: 'Hélicoptère',
  tank: 'Char',
  armored: 'Blindé',
};

/** Libellé au-dessus du nom dans l'en-tête d'une fiche. */
export const CATEGORY_GROUPS: Readonly<Record<VehicleCategory, string>> = {
  aircraft: 'Aviation',
  helicopter: 'Aviation',
  tank: 'Blindés',
  armored: 'Blindés',
};

export type VehicleSort = 'popular' | 'name' | 'recent';

export const SORT_LABELS: Readonly<Record<VehicleSort, string>> = {
  popular: 'Popularité',
  name: 'Nom (A → Z)',
  recent: 'Plus récents',
};

export const CATEGORIES: readonly VehicleCategory[] = ['aircraft', 'helicopter', 'tank', 'armored'];
