export type VehicleCategory = 'helicopter' | 'aircraft' | 'tank' | 'armored';

/** Fiche véhicule renvoyée par `/api/vehicles` (données issues de Wikipédia/Wikidata). */
export interface Vehicle {
  id: string;
  wikidataId: string;
  name: string;
  category: VehicleCategory;
  countries: string[];
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

export const CATEGORIES: readonly VehicleCategory[] = ['aircraft', 'helicopter', 'tank', 'armored'];
