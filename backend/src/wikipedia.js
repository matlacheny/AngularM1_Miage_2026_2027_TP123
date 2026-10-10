/*
 * Résolution d'un nom saisi par l'utilisateur ("Rafale", "Leclerc"...) en
 * fiche véhicule, à partir de deux API publiques sans clé :
 *
 *  1. Wikipédia FR (recherche) : 10 meilleurs articles, avec résumé, image et
 *     identifiant Wikidata (QID).
 *  2. Wikidata (SPARQL) : pour ces QID, on vérifie que l'article décrit bien
 *     un type d'avion, d'hélicoptère, de char ou de blindé, c'est-à-dire qu'il
 *     est une sous-classe (P279, transitivement) d'une de ces familles.
 *
 * On garde le premier résultat de recherche qui est un véhicule : "Leclerc"
 * donne l'hypermarché, le général... puis le char, retenu.
 */

const WIKIPEDIA_API = "https://fr.wikipedia.org/w/api.php";
const WIKIDATA_SPARQL = "https://query.wikidata.org/sparql";
const TIMEOUT_MS = 8000;

// Wikimedia exige un User-Agent identifiable (sinon 403 / limitation).
const USER_AGENT = process.env.WIKI_USER_AGENT || "Afterburner/1.0 (projet etudiant MIAGE)";

/**
 * Familles acceptées, par ordre de priorité : un hélicoptère est aussi un
 * aéronef, un char est aussi un blindé ; on retient la catégorie la plus précise.
 */
export const VEHICLE_ROOTS = [
  { qid: "Q34486", category: "helicopter" }, // hélicoptère
  { qid: "Q11436", category: "aircraft" }, // aéronef
  { qid: "Q12876", category: "tank" }, // char d'assaut
  { qid: "Q1184840", category: "armored" }, // véhicule blindé de combat
];

export const CATEGORIES = VEHICLE_ROOTS.map((r) => r.category);

/** Wikipédia ou Wikidata injoignable, lent ou qui limite nos requêtes. */
export class WikiUnavailableError extends Error {}

/** Clé de comparaison : minuscules, sans accents ni espaces superflus. */
export function normalizeName(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

async function getJson(url, fetchImpl, headers = {}) {
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json", ...headers },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    console.error(`[wiki] Requête impossible vers ${new URL(url).host}`, error);
    throw new WikiUnavailableError("Wikipédia est injoignable");
  }
  if (!response.ok) {
    console.warn(`[wiki] Réponse ${response.status} de ${new URL(url).host}`);
    throw new WikiUnavailableError(`Wikipédia a répondu ${response.status}`);
  }
  return response.json();
}

/** Étape 1 : 5 articles candidats, dans l'ordre de pertinence de Wikipédia. */
export async function searchCandidates(query, fetchImpl = fetch) {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    generator: "search",
    gsrsearch: query,
    gsrlimit: "10",
    prop: "pageprops|pageimages|extracts|info",
    ppprop: "wikibase_item",
    piprop: "thumbnail",
    pithumbsize: "640",
    exintro: "1",
    explaintext: "1",
    exsentences: "3",
    exlimit: "10",
    inprop: "url",
  });
  const data = await getJson(`${WIKIPEDIA_API}?${params}`, fetchImpl);
  const pages = data.query?.pages ?? [];

  return pages
    .filter((p) => p.pageprops?.wikibase_item)
    .sort((a, b) => a.index - b.index)
    .map((p) => ({
      title: p.title,
      wikidataId: p.pageprops.wikibase_item,
      summary: p.extract || "",
      imageUrl: p.thumbnail?.source ?? null,
      wikipediaUrl: p.fullurl ?? `https://fr.wikipedia.org/wiki/${encodeURIComponent(p.title)}`,
    }));
}

/** Construit la requête SPARQL de classification (QID validés par regex). */
export function buildClassificationQuery(qids) {
  const items = qids.filter((q) => /^Q\d+$/.test(q)).map((q) => `wd:${q}`).join(" ");
  const roots = VEHICLE_ROOTS.map((r) => `(wd:${r.qid} "${r.category}")`).join(" ");
  return `SELECT ?item ?category ?countryLabel WHERE {
  VALUES ?item { ${items} }
  VALUES (?root ?category) { ${roots} }
  ?item wdt:P279+ ?root .
  OPTIONAL { ?item wdt:P495 ?country . ?country rdfs:label ?countryLabel . FILTER(LANG(?countryLabel) = "fr") }
}`;
}

/**
 * Étape 2 : pour chaque QID qui est un véhicule, sa catégorie la plus précise
 * et ses pays d'origine (P495). Les QID absents de la Map ne sont pas des véhicules.
 */
export async function classifyVehicles(qids, fetchImpl = fetch) {
  if (!qids.length) return new Map();
  const url = `${WIKIDATA_SPARQL}?${new URLSearchParams({ query: buildClassificationQuery(qids), format: "json" })}`;
  const data = await getJson(url, fetchImpl, { Accept: "application/sparql-results+json" });

  const result = new Map();
  for (const row of data.results?.bindings ?? []) {
    const qid = row.item.value.split("/").pop();
    const category = row.category.value;
    const entry = result.get(qid) ?? { category, countries: new Set() };
    if (CATEGORIES.indexOf(category) < CATEGORIES.indexOf(entry.category)) entry.category = category;
    if (row.countryLabel?.value) entry.countries.add(row.countryLabel.value);
    result.set(qid, entry);
  }
  return result;
}

/**
 * Retourne la fiche du premier candidat qui est un véhicule, ou null si aucun
 * ne l'est. Lève WikiUnavailableError si Wikipédia/Wikidata ne répond pas :
 * dans ce cas on ne sait pas, et on ne crée rien.
 */
async function resolveVehicle(query, fetchImpl = fetch) {
  console.log(`[wiki] Résolution de "${query}"`);
  const candidates = await searchCandidates(query, fetchImpl);
  const classes = await classifyVehicles(candidates.map((c) => c.wikidataId), fetchImpl);

  const match = candidates.find((c) => classes.has(c.wikidataId));
  if (!match) {
    console.log(`[wiki] Aucun véhicule parmi ${candidates.length} candidat(s) pour "${query}"`);
    return null;
  }

  const { category, countries } = classes.get(match.wikidataId);
  console.log(`[wiki] "${query}" => ${match.title} (${match.wikidataId}, ${category})`);
  return { ...match, name: match.title, category, countries: [...countries].sort() };
}

// Objet mutable : les tests remplacent wikipedia.resolveVehicle par une
// doublure, sans jamais appeler les vraies API pendant `npm test`.
export const wikipedia = { resolveVehicle };
