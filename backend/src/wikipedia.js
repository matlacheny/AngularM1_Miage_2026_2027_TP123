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
export class WikiUnavailableError extends Error {
  /** `timeout` : pas de réponse dans le délai (et non un refus explicite comme 429). */
  constructor(message, { timeout = false } = {}) {
    super(message);
    this.timeout = timeout;
  }
}

const isTimeout = (error) => error?.name === "TimeoutError" || error?.name === "AbortError";

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
    throw new WikiUnavailableError("Wikipédia est injoignable", { timeout: isTimeout(error) });
  }
  if (!response.ok) {
    console.warn(`[wiki] Réponse ${response.status} de ${new URL(url).host}`);
    throw new WikiUnavailableError(`Wikipédia a répondu ${response.status}`);
  }
  // Le délai court aussi pendant la lecture du corps : une réponse trop longue
  // (ou coupée) ne doit pas sortir en erreur brute.
  try {
    return await response.json();
  } catch (error) {
    console.error(`[wiki] Réponse illisible de ${new URL(url).host}`, error);
    throw new WikiUnavailableError("Wikipédia est injoignable", { timeout: isTimeout(error) });
  }
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
  return candidatesFrom(params, fetchImpl);
}

/**
 * Recours : l'autocomplétion de Wikipédia (titres et redirections), la même que
 * sa barre de recherche. Elle trouve « mig29 » (→ MiG-29), que la recherche plein
 * texte découpe en un seul mot introuvable, mais elle ignore le contenu des
 * articles (« leclerc » n'y donne que des personnes).
 */
export async function prefixCandidates(query, fetchImpl = fetch) {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    generator: "prefixsearch",
    gpssearch: query,
    gpslimit: "5",
    redirects: "1",
    prop: "pageprops|pageimages|extracts|info",
    ppprop: "wikibase_item",
    piprop: "thumbnail",
    pithumbsize: "640",
    exintro: "1",
    explaintext: "1",
    exsentences: "3",
    exlimit: "5",
    inprop: "url",
  });
  return candidatesFrom(params, fetchImpl);
}

/** Pages d'une requête Wikipédia, dans l'ordre de pertinence, réduites aux candidats qui ont un élément Wikidata. */
async function candidatesFrom(params, fetchImpl) {
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
  // Pays du véhicule, par ordre de préférence (tous les éléments ne
  // renseignent pas P495 : le Mirage 2000 n'a que P17) :
  //   1. pays d'origine (P495) ;  2. pays (P17) ;  3. pays du constructeur (P176 → P17).
  // COALESCE garde, ligne par ligne, la première source renseignée.
  // Puis : nom français, code ISO 3166-1 (P297, absent pour un État disparu
  // comme l'URSS) et image du drapeau (P41).
  return `SELECT ?item ?category ?country ?countryLabel ?code ?flag WHERE {
  VALUES ?item { ${items} }
  VALUES (?root ?category) { ${roots} }
  ?item wdt:P279+ ?root .
  OPTIONAL { ?item wdt:P495 ?origin }
  OPTIONAL { ?item wdt:P17 ?itemCountry }
  OPTIONAL { ?item wdt:P176/wdt:P17 ?makerCountry }
  BIND(COALESCE(?origin, ?itemCountry, ?makerCountry) AS ?country)
  OPTIONAL {
    ?country rdfs:label ?countryLabel . FILTER(LANG(?countryLabel) = "fr")
    OPTIONAL { ?country wdt:P297 ?code }
    OPTIONAL { ?country wdt:P41 ?flag }
  }
}`;
}

/**
 * Wikidata renvoie le drapeau sous la forme
 * http://commons.wikimedia.org/wiki/Special:FilePath/Flag%20of%20France.svg :
 * on force HTTPS et on demande un rendu PNG de 640 px de large.
 */
export function flagUrlFrom(commonsUrl) {
  if (!commonsUrl?.includes("commons.wikimedia.org/wiki/Special:FilePath/")) return null;
  return `${commonsUrl.replace(/^http:/, "https:")}?width=640`;
}

/**
 * Étape 2 : pour chaque QID qui est un véhicule, sa catégorie la plus précise
 * et ses pays d'origine (P495) avec leur drapeau. Les QID absents de la Map
 * ne sont pas des véhicules.
 * Valeur : { category, countries: Set<nom>, origins: [{ name, code, flagUrl }] }.
 */
export async function classifyVehicles(qids, fetchImpl = fetch) {
  if (!qids.length) return new Map();
  const url = `${WIKIDATA_SPARQL}?${new URLSearchParams({ query: buildClassificationQuery(qids), format: "json" })}`;
  const data = await getJson(url, fetchImpl, { Accept: "application/sparql-results+json" });

  const result = new Map();
  for (const row of data.results?.bindings ?? []) {
    const qid = row.item.value.split("/").pop();
    const category = row.category.value;
    const entry = result.get(qid) ?? { category, countries: new Set(), byCountry: new Map() };
    if (CATEGORIES.indexOf(category) < CATEGORIES.indexOf(entry.category)) entry.category = category;

    const name = row.countryLabel?.value;
    if (name) {
      entry.countries.add(name);
      // Un pays peut avoir plusieurs drapeaux (historiques) : on garde le premier.
      const key = row.country?.value ?? name;
      const origin = entry.byCountry.get(key) ?? { name, code: null, flagUrl: null };
      origin.code ??= row.code?.value?.toLowerCase() ?? null;
      origin.flagUrl ??= flagUrlFrom(row.flag?.value);
      entry.byCountry.set(key, origin);
    }
    result.set(qid, entry);
  }

  for (const entry of result.values()) {
    entry.origins = [...entry.byCountry.values()].sort((a, b) => a.name.localeCompare(b.name, "fr"));
    delete entry.byCountry;
  }
  return result;
}

/**
 * Retourne la fiche du premier candidat qui est un véhicule, ou null si aucun
 * ne l'est. Lève WikiUnavailableError si Wikipédia/Wikidata ne répond pas :
 * dans ce cas on ne sait pas, et on ne crée rien.
 *
 * `knownIds` : éléments Wikidata qui ont déjà une fiche. Ils sont des véhicules
 * vérifiés : inutile de les classer à nouveau (la requête SPARQL du MiG-29, par
 * exemple, dépasse souvent le délai). Le résultat porte alors `known: true`,
 * sans catégorie ni pays : la fiche existante sert.
 */
async function resolveVehicle(query, fetchImpl = fetch, { knownIds = new Set() } = {}) {
  console.log(`[wiki] Résolution de "${query}"`);
  const candidates = await searchCandidates(query, fetchImpl);
  let found = null;
  let unavailable = null;
  try {
    found = await firstVehicle(candidates, fetchImpl, { knownIds, query });
  } catch (error) {
    if (!(error instanceof WikiUnavailableError && error.timeout)) throw error;
    unavailable = error;
  }

  // Aucun véhicule en plein texte : l'autocomplétion, sans reclasser les candidats déjà vus.
  if (!found) {
    const seen = new Set(candidates.map((c) => c.wikidataId));
    try {
      const extra = (await prefixCandidates(query, fetchImpl)).filter((c) => !seen.has(c.wikidataId));
      if (extra.length) {
        console.log(`[wiki] "${query}" : recours à l'autocomplétion (${extra.length} candidat(s))`);
        // Un candidat plein texte sans réponse reste plus pertinent : même garde-fou de désignation.
        found = await firstVehicle(extra, fetchImpl, { knownIds, query, unanswered: unavailable ? 1 : 0 });
      }
    } catch (error) {
      if (!(error instanceof WikiUnavailableError)) throw error;
      unavailable ??= error;
    }
    if (!found && unavailable) throw unavailable;
  }
  if (!found) {
    console.log(`[wiki] Aucun véhicule parmi ${candidates.length} candidat(s) pour "${query}"`);
    return null;
  }

  const { match, info } = found;
  if (!info) {
    console.log(`[wiki] "${query}" => ${match.title} (${match.wikidataId}, fiche existante)`);
    return { ...match, name: match.title, known: true };
  }
  console.log(`[wiki] "${query}" => ${match.title} (${match.wikidataId}, ${info.category})`);
  return { ...match, name: match.title, category: info.category, countries: [...info.countries].sort(), origins: info.origins };
}

const squash = (value) => normalizeName(value).replace(/[\s-]+/g, "");

/**
 * Le titre porte-t-il les désignations chiffrées de la recherche ? « Mig 29 »
 * exige « 29 » : « MiG-15 » est refusé. Une recherche sans chiffre (« EBRC
 * Jaguar ») accepte tout titre.
 */
export function carriesDesignation(title, query) {
  const designations = normalizeName(query).split(/[\s/(),]+/).filter((t) => /\d/.test(t)).map(squash);
  return designations.every((d) => squash(title).includes(d));
}

/** Requêtes Wikidata simultanées au plus (limite du service : 5 par adresse IP). */
export const PARALLEL_CLASSIFICATIONS = 5;

/**
 * Premier candidat (dans l'ordre de pertinence) qui est un véhicule : { match, info }, ou null.
 *
 * Chaque candidat est classé par sa propre requête, par lots parallèles. Une
 * requête groupée dépasserait le délai dès qu'un seul élément a une hiérarchie
 * P279 immense (« VBMR-L Serval » parmi les candidats de « EBRC Jaguar »), et
 * continuerait de consommer le quota de Wikidata, qui refuse ensuite (429).
 * Un candidat trop lent est ignoré ; un refus explicite (429…) interrompt tout.
 */
async function firstVehicle(candidates, fetchImpl, { knownIds = new Set(), query = "", unanswered: alreadyUnanswered = 0 } = {}) {
  let unanswered = alreadyUnanswered;
  for (let i = 0; i < candidates.length; i += PARALLEL_CLASSIFICATIONS) {
    const batch = candidates.slice(i, i + PARALLEL_CLASSIFICATIONS);
    const pending = batch.map((c) => (knownIds.has(c.wikidataId) ? Promise.resolve(null) : classifyVehicles([c.wikidataId], fetchImpl)));
    pending.forEach((p) => p.catch(() => {})); // les échecs sont lus ci-dessous, dans l'ordre

    // Dans l'ordre de pertinence : on répond dès que le premier véhicule est
    // confirmé, sans attendre les candidats suivants, plus lents.
    for (const [j, candidate] of batch.entries()) {
      try {
        const classes = await pending[j];
        const isVehicle = classes === null || classes.has(candidate.wikidataId);
        // Un candidat plus pertinent n'a pas répondu : un suivant ne l'emporte que s'il
        // porte la même désignation (« Mig 29 » ne doit pas donner le MiG-15).
        if (isVehicle && unanswered && !carriesDesignation(candidate.title, query)) {
          console.warn(`[wiki] « ${candidate.title} » écarté : un candidat plus pertinent n'a pas répondu`);
          continue;
        }
        if (classes === null) return { match: candidate, info: null };
        if (isVehicle) return { match: candidate, info: classes.get(candidate.wikidataId) };
      } catch (error) {
        if (!(error instanceof WikiUnavailableError && error.timeout)) throw error;
        unanswered++;
        console.warn(`[wiki] « ${candidate.title} » non classé (trop lent), ignoré`);
      }
    }
  }
  // Un candidat non classé était peut-être le véhicule : on ne conclut pas « non ».
  if (unanswered) throw new WikiUnavailableError("Wikidata ne répond pas", { timeout: true });
  return null;
}

// Objet mutable : les tests remplacent wikipedia.resolveVehicle par une
// doublure, sans jamais appeler les vraies API pendant `npm test`.
export const wikipedia = { resolveVehicle, classifyVehicles };
