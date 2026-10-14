import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { accessFilter, canAccess } from "../src/access.js";
import { Media } from "../src/models/Media.js";
import { Vehicle } from "../src/models/Vehicle.js";
import { UPLOADS } from "../src/uploads.js";
import {
  WikiUnavailableError,
  buildClassificationQuery,
  classifyVehicles,
  normalizeName,
  searchCandidates,
  wikipedia,
} from "../src/wikipedia.js";

/*
 * Tests de l'étape 2 (fiches véhicules + Wikipédia/Wikidata).
 * Aucun appel réseau réel : les API Wikimedia sont remplacées par un faux
 * `fetch` passé en paramètre, et les routes par une doublure de
 * wikipedia.resolveVehicle. Aucun accès MongoDB non plus.
 */

const SECRET = process.env.JWT_SECRET || "tp1-development-secret";
const USER = new mongoose.Types.ObjectId().toString();
const OTHER = new mongoose.Types.ObjectId().toString();
const VEHICLE_ID = new mongoose.Types.ObjectId().toString();
const bearer = (sub = USER) => ({ Authorization: `Bearer ${jwt.sign({ sub }, SECRET, { expiresIn: "1h" })}` });
const json = (sub) => ({ ...bearer(sub), "Content-Type": "application/json" });

let server, base;

test.before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

/** Remplace temporairement une propriété d'un objet (méthode statique, doublure...). */
function stub(t, target, name, implementation) {
  const original = target[name];
  target[name] = implementation;
  t.after(() => {
    target[name] = original;
  });
}

// ---------------------------------------------------------------------------
// Faux Wikimedia
// ---------------------------------------------------------------------------

/** Réponses de recherche Wikipédia volontairement dans le désordre (champ index). */
const LECLERC_SEARCH = {
  query: {
    pages: [
      { index: 5, title: "Char Leclerc", pageprops: { wikibase_item: "Q242398" }, extract: "Char de combat français.", thumbnail: { source: "https://upload.wikimedia.org/leclerc.jpg" }, fullurl: "https://fr.wikipedia.org/wiki/Char_Leclerc" },
      { index: 1, title: "E.Leclerc", pageprops: { wikibase_item: "Q1273376" }, extract: "Enseigne de distribution." },
      { index: 2, title: "Philippe Leclerc de Hauteclocque", pageprops: { wikibase_item: "Q312391" }, extract: "Général." },
      { index: 3, title: "Leclerc (homonymie)" }, // pas d'élément Wikidata : ignoré
    ],
  },
};

const sparql = (rows) => ({
  results: {
    bindings: rows.map(([qid, category, country]) => ({
      item: { value: `http://www.wikidata.org/entity/${qid}` },
      category: { value: category },
      ...(country && { countryLabel: { value: country } }),
    })),
  },
});

/** Faux fetch : choisit la réponse selon l'hôte appelé et mémorise les URL. */
function fakeFetch({ search, classification, status = 200, fail = false }) {
  const calls = [];
  const impl = async (url, options) => {
    calls.push({ url: String(url), options });
    if (fail) throw new TypeError("fetch failed");
    const body = String(url).includes("wikipedia.org") ? search : classification;
    return { ok: status < 400, status, json: async () => body };
  };
  return { impl, calls };
}

// ---------------------------------------------------------------------------
// Module wikipedia.js
// ---------------------------------------------------------------------------

test("normalizeName : minuscules, sans accents ni espaces superflus", () => {
  assert.equal(normalizeName("  Hélicoptère   TIGRE "), "helicoptere tigre");
});

test("searchCandidates : ordre de pertinence et pages sans Wikidata ignorées", async () => {
  const { impl, calls } = fakeFetch({ search: LECLERC_SEARCH });
  const candidates = await searchCandidates("Leclerc", impl);

  assert.deepEqual(candidates.map((c) => c.wikidataId), ["Q1273376", "Q312391", "Q242398"]);
  assert.equal(candidates[2].imageUrl, "https://upload.wikimedia.org/leclerc.jpg");
  assert.equal(candidates[0].imageUrl, null);
  assert.match(calls[0].url, /fr\.wikipedia\.org.*gsrsearch=Leclerc/);
  assert.ok(calls[0].options.headers["User-Agent"], "Wikimedia exige un User-Agent");
});

test("buildClassificationQuery : seuls des QID valides entrent dans la requête SPARQL", () => {
  const query = buildClassificationQuery(["Q42", "Q1 } DELETE {", "wd:Q2"]);
  assert.match(query, /VALUES \?item \{ wd:Q42 \}/);
  assert.doesNotMatch(query, /DELETE/);
});

test("classifyVehicles : catégorie la plus précise et pays regroupés", async () => {
  const { impl } = fakeFetch({
    classification: sparql([
      ["Q159601", "aircraft", "France"],
      ["Q159601", "helicopter", "Allemagne"],
      ["Q242398", "armored", "France"],
      ["Q242398", "tank", "France"],
    ]),
  });
  const result = await classifyVehicles(["Q159601", "Q242398"], impl);

  assert.equal(result.get("Q159601").category, "helicopter");
  assert.deepEqual([...result.get("Q159601").countries].sort(), ["Allemagne", "France"]);
  assert.equal(result.get("Q242398").category, "tank");
});

test("resolveVehicle : retient le premier résultat qui est un véhicule (Leclerc => le char)", async () => {
  const { impl } = fakeFetch({ search: LECLERC_SEARCH, classification: sparql([["Q242398", "tank", "France"]]) });
  const vehicle = await wikipedia.resolveVehicle("Leclerc", impl);

  assert.equal(vehicle.name, "Char Leclerc");
  assert.equal(vehicle.wikidataId, "Q242398");
  assert.equal(vehicle.category, "tank");
  assert.deepEqual(vehicle.countries, ["France"]);
  assert.equal(vehicle.summary, "Char de combat français.");
});

test("resolveVehicle : null si aucun candidat n'est un véhicule", async () => {
  const { impl } = fakeFetch({ search: LECLERC_SEARCH, classification: sparql([]) });
  assert.equal(await wikipedia.resolveVehicle("Leclerc", impl), null);
});

test("resolveVehicle : WikiUnavailableError si le réseau échoue ou si Wikimedia limite (429)", async () => {
  await assert.rejects(wikipedia.resolveVehicle("Rafale", fakeFetch({ fail: true }).impl), WikiUnavailableError);
  await assert.rejects(wikipedia.resolveVehicle("Rafale", fakeFetch({ status: 429 }).impl), WikiUnavailableError);
});

/**
 * Wikidata simulé : la requête groupée dépasse le délai ; candidat par
 * candidat, `slow` dépasse aussi le délai et `vehicles` sont des chars.
 */
function slowWikidata({ slow = [], vehicles = [], always = false }) {
  const calls = [];
  const timeout = () => Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
  const impl = async (url) => {
    calls.push(String(url));
    if (String(url).includes("wikipedia.org")) return { ok: true, status: 200, json: async () => LECLERC_SEARCH };
    const qids = [...decodeURIComponent(String(url)).matchAll(/wd:(Q\d+)/g)].map((m) => m[1]).filter((q) => !q.startsWith("Q34486") && !["Q11436", "Q12876", "Q1184840"].includes(q));
    if (always || qids.length > 1 || slow.includes(qids[0])) throw timeout();
    return { ok: true, status: 200, json: async () => sparql(vehicles.filter((q) => qids.includes(q)).map((q) => [q, "tank", "France"])) };
  };
  return { impl, calls: () => calls.filter((u) => u.includes("sparql")).length };
}

test("resolveVehicle : chaque candidat classé seul, le candidat trop lent est ignoré", async () => {
  // Candidats dans l'ordre : E.Leclerc (lent), le général, puis le char.
  const wikidata = slowWikidata({ slow: ["Q1273376"], vehicles: ["Q242398"] });
  const vehicle = await wikipedia.resolveVehicle("Leclerc", wikidata.impl);

  assert.equal(vehicle.name, "Char Leclerc");
  assert.equal(vehicle.category, "tank");
  assert.equal(wikidata.calls(), 3, "une requête par candidat, aucune requête groupée");
});

test("resolveVehicle : au plus 5 requêtes Wikidata simultanées, ordre de pertinence respecté", async () => {
  const pages = Array.from({ length: 7 }, (_, i) => ({ index: i, title: `C${i}`, pageprops: { wikibase_item: `Q${100 + i}` } }));
  let running = 0, peak = 0;
  const impl = async (url) => {
    if (String(url).includes("wikipedia.org")) return { ok: true, status: 200, json: async () => ({ query: { pages } }) };
    running++, (peak = Math.max(peak, running));
    await new Promise((r) => setTimeout(r, 5));
    running--;
    const qid = new URL(url).searchParams.get("query").match(/VALUES \?item \{ wd:(Q\d+) \}/)[1];
    // C1 et C6 sont des véhicules : C1 l'emporte, il est plus pertinent.
    return { ok: true, status: 200, json: async () => sparql(["Q101", "Q106"].includes(qid) ? [[qid, "aircraft", "France"]] : []) };
  };
  const vehicle = await wikipedia.resolveVehicle("x", impl);
  assert.equal(vehicle.name, "C1");
  assert.ok(peak <= 5, `au plus 5 en parallèle (${peak})`);
});

test("resolveVehicle : candidats un par un sans véhicule → null ; aucune réponse → WikiUnavailableError", async () => {
  assert.equal(await wikipedia.resolveVehicle("Leclerc", slowWikidata({ vehicles: [] }).impl), null);
  const error = await wikipedia.resolveVehicle("Leclerc", slowWikidata({ always: true }).impl).catch((e) => e);
  assert.ok(error instanceof WikiUnavailableError && error.timeout);
});

test("resolveVehicle : un candidat non classé et aucun véhicule trouvé → indisponible, pas « non »", async () => {
  // Le char est le candidat trop lent : conclure « aucun véhicule » serait faux.
  const error = await wikipedia.resolveVehicle("Leclerc", slowWikidata({ slow: ["Q242398"], vehicles: ["Q242398"] }).impl).catch((e) => e);
  assert.ok(error instanceof WikiUnavailableError, "503 Réessayez, et non 422 Ce n'est pas un véhicule");
});

test("resolveVehicle : un refus explicite (429) n'est pas retenté candidat par candidat", async () => {
  const { impl, calls } = fakeFetch({ search: LECLERC_SEARCH, status: 200 });
  const limited = async (url, options) => (String(url).includes("sparql") ? { ok: false, status: 429, json: async () => ({}) } : impl(url, options));
  await assert.rejects(wikipedia.resolveVehicle("Leclerc", limited), WikiUnavailableError);
  assert.equal(calls.length, 1, "seule la recherche Wikipédia passe par le faux fetch");
});

test("getJson : une réponse coupée pendant la lecture devient WikiUnavailableError", async () => {
  const cut = async () => ({ ok: true, status: 200, json: async () => { throw Object.assign(new Error("aborted"), { name: "TimeoutError" }); } });
  const error = await searchCandidates("Rafale", cut).catch((e) => e);
  assert.ok(error instanceof WikiUnavailableError && error.timeout);
});

// ---------------------------------------------------------------------------
// accessFilter (MongoDB) doit dire la même chose que canAccess (JavaScript)
// ---------------------------------------------------------------------------

/** Évalue le filtre produit par accessFilter sur un document, comme le ferait MongoDB. */
function matches(filter, doc) {
  const eq = (value, expected) =>
    Array.isArray(value) ? value.some((v) => String(v) === String(expected)) : String(value) === String(expected);
  return filter.$or.some((clause) =>
    Object.entries(clause).every(([field, cond]) =>
      cond?.$in ? cond.$in.some((x) => eq(doc[field], x)) : eq(doc[field], cond),
    ),
  );
}

test("accessFilter et canAccess concordent sur toutes les combinaisons", () => {
  const viewer = new mongoose.Types.ObjectId(USER);
  const friend = new mongoose.Types.ObjectId(OTHER);
  const stranger = new mongoose.Types.ObjectId();

  for (const owner of [viewer, friend, stranger]) {
    for (const visibility of ["private", "friends", "public"]) {
      for (const sharedWith of [[], [viewer]]) {
        const doc = { ownerId: owner, visibility, sharedWith };
        const expected = canAccess(String(viewer), doc, new Set([String(friend)]));
        assert.equal(matches(accessFilter(viewer, [friend]), doc), expected, JSON.stringify({ owner: String(owner), visibility, sharedWith }));
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Routes /api/vehicles
// ---------------------------------------------------------------------------

/** Faux document Vehicle. */
function fakeVehicle(overrides = {}) {
  const doc = { id: VEHICLE_ID, wikidataId: "Q190973", name: "Dassault Rafale", category: "aircraft", ...overrides };
  doc.toPublic = () => ({ id: doc.id, wikidataId: doc.wikidataId, name: doc.name, category: doc.category });
  return doc;
}

const RAFALE = {
  wikidataId: "Q190973",
  name: "Dassault Rafale",
  category: "aircraft",
  countries: ["France"],
  summary: "Avion de combat.",
  imageUrl: null,
  wikipediaUrl: "https://fr.wikipedia.org/wiki/Dassault_Rafale",
};

test("POST /api/vehicles : 401 sans JWT et 400 pour un nom invalide", async () => {
  assert.equal((await fetch(`${base}/api/vehicles`, { method: "POST" })).status, 401);
  const r = await fetch(`${base}/api/vehicles`, { method: "POST", headers: json(), body: JSON.stringify({ name: "x" }) });
  assert.equal(r.status, 400);
});

test("POST /api/vehicles : nom déjà saisi => 200 sans appeler Wikipédia", async (t) => {
  let resolveCalls = 0;
  let lookup;
  stub(t, Vehicle, "findOne", async (filter) => {
    lookup = filter;
    return fakeVehicle();
  });
  stub(t, wikipedia, "resolveVehicle", async () => resolveCalls++);

  const r = await fetch(`${base}/api/vehicles`, { method: "POST", headers: json(), body: JSON.stringify({ name: "  RAFALE " }) });
  assert.equal(r.status, 200);
  assert.deepEqual(lookup, { aliases: "rafale" });
  assert.equal(resolveCalls, 0);
});

test("POST /api/vehicles : 422 si Wikipédia ne trouve aucun véhicule (rien n'est créé)", async (t) => {
  let created = false;
  stub(t, Vehicle, "findOne", async () => null);
  stub(t, Vehicle, "create", async () => (created = true));
  stub(t, wikipedia, "resolveVehicle", async () => null);

  const r = await fetch(`${base}/api/vehicles`, { method: "POST", headers: json(), body: JSON.stringify({ name: "Paris" }) });
  assert.equal(r.status, 422);
  assert.match((await r.json()).message, /ne correspond à aucun avion, hélicoptère, char ou blindé/);
  assert.equal(created, false);
});

test("POST /api/vehicles : 503 si Wikipédia est indisponible (rien n'est créé)", async (t) => {
  let created = false;
  stub(t, Vehicle, "findOne", async () => null);
  stub(t, Vehicle, "create", async () => (created = true));
  stub(t, wikipedia, "resolveVehicle", async () => {
    throw new WikiUnavailableError("429");
  });

  const r = await fetch(`${base}/api/vehicles`, { method: "POST", headers: json(), body: JSON.stringify({ name: "Rafale" }) });
  assert.equal(r.status, 503);
  assert.equal(created, false);
});

test("POST /api/vehicles : même élément Wikidata sous un autre nom => 200 et alias ajouté", async (t) => {
  let update;
  stub(t, Vehicle, "findOne", async () => null);
  stub(t, Vehicle, "findOneAndUpdate", async (filter, u) => {
    update = { filter, u };
    return fakeVehicle();
  });
  stub(t, wikipedia, "resolveVehicle", async () => RAFALE);

  const r = await fetch(`${base}/api/vehicles`, { method: "POST", headers: json(), body: JSON.stringify({ name: "Rafale Marine" }) });
  assert.equal(r.status, 200);
  assert.deepEqual(update.filter, { wikidataId: "Q190973" });
  assert.deepEqual(update.u, { $addToSet: { aliases: "rafale marine" } });
});

test("POST /api/vehicles : 201 avec les données Wikipédia et le créateur issu du JWT", async (t) => {
  let data;
  stub(t, Vehicle, "findOne", async () => null);
  stub(t, Vehicle, "findOneAndUpdate", async () => null);
  stub(t, Vehicle, "create", async (d) => {
    data = d;
    return fakeVehicle(d);
  });
  stub(t, wikipedia, "resolveVehicle", async () => RAFALE);

  const r = await fetch(`${base}/api/vehicles`, {
    method: "POST",
    headers: json(),
    body: JSON.stringify({ name: "Rafale", createdBy: OTHER, category: "tank" }),
  });
  assert.equal(r.status, 201);
  assert.equal(data.createdBy, USER);
  assert.equal(data.category, "aircraft", "la catégorie vient de Wikidata, pas du client");
  assert.deepEqual(data.aliases, ["rafale", "dassault rafale"]);
});

test("GET /api/vehicles/:id : 404 pour un identifiant inconnu ou mal formé", async (t) => {
  stub(t, Vehicle, "findById", async () => null);
  assert.equal((await fetch(`${base}/api/vehicles/${VEHICLE_ID}`, { headers: bearer() })).status, 404);
  assert.equal((await fetch(`${base}/api/vehicles/pas-un-id`, { headers: bearer() })).status, 404);
});

test("GET /api/vehicles : recherche par nom/alias et catégorie validée", async (t) => {
  let pipeline;
  stub(t, Vehicle, "aggregatePaginate", async (aggregate, o) => {
    pipeline = aggregate.pipeline();
    return { docs: [], totalDocs: 0, limit: o.limit, page: o.page, totalPages: 1 };
  });

  const ok = await fetch(`${base}/api/vehicles?q=Mirage%20(2000&category=aircraft`, { headers: bearer() });
  assert.equal(ok.status, 200);
  const match = pipeline[0].$match;
  assert.equal(match.category, "aircraft");
  assert.equal(match.$or[0].name.$regex, "Mirage \\(2000", "regex échappée");

  assert.equal((await fetch(`${base}/api/vehicles?category=sous-marin`, { headers: bearer() })).status, 400);
});

test("GET /api/vehicles/:id/media : fiche + règle d'accès du lecteur", async (t) => {
  let match;
  stub(t, Media, "aggregatePaginate", async (aggregate, o) => {
    match = aggregate.pipeline()[0].$match;
    return { docs: [], totalDocs: 0, limit: o.limit, page: o.page, totalPages: 1 };
  });

  const r = await fetch(`${base}/api/vehicles/${VEHICLE_ID}/media?kind=video`, { headers: bearer(OTHER) });
  assert.equal(r.status, 200);
  assert.equal(String(match.vehicleId), VEHICLE_ID);
  assert.equal(match.kind, "video");
  assert.equal(String(match.$or[0].ownerId), OTHER, "le lecteur vient du JWT");
  assert.deepEqual(match.$or[2], { visibility: "public" });
});

test("GET /api/vehicles/:id/media : kind accepte une liste, chaque valeur est validée", async (t) => {
  let match;
  stub(t, Media, "aggregatePaginate", async (aggregate, o) => {
    match = aggregate.pipeline()[0].$match;
    return { docs: [], totalDocs: 0, limit: o.limit, page: o.page, totalPages: 1 };
  });

  const ok = await fetch(`${base}/api/vehicles/${VEHICLE_ID}/media?kind=image,video`, { headers: bearer() });
  assert.equal(ok.status, 200);
  assert.deepEqual(match.kind, { $in: ["image", "video"] });

  const bad = await fetch(`${base}/api/vehicles/${VEHICLE_ID}/media?kind=image,pdf`, { headers: bearer() });
  assert.equal(bad.status, 400);
});

// ---------------------------------------------------------------------------
// Rattachement d'un média à une fiche
// ---------------------------------------------------------------------------

test("upload avec un véhicule inconnu : 400 et fichier supprimé du disque", async (t) => {
  stub(t, Vehicle, "exists", async () => null);
  // Extension propre à ce test : les fichiers de test tournent en parallèle
  // et partagent le dossier d'uploads.
  const webpFiles = async () => (await fs.readdir(UPLOADS)).filter((f) => f.endsWith(".webp")).sort();
  const before = await webpFiles();

  const body = new FormData();
  body.append("file", new Blob(["img"], { type: "image/webp" }), "a.webp");
  body.append("vehicleId", VEHICLE_ID);
  const r = await fetch(`${base}/api/media`, { method: "POST", headers: bearer(), body });

  assert.equal(r.status, 400);
  assert.equal((await r.json()).message, "Véhicule inconnu");
  assert.deepEqual(await webpFiles(), before);
});

test("PATCH /api/media/:id : vehicleId null détache le média de sa fiche", async (t) => {
  let update;
  stub(t, Media, "findOneAndUpdate", async (_f, u) => {
    update = u;
    return { id: "m1", vehicleId: null, toPublic: () => ({ id: "m1", vehicle: null }) };
  });
  const r = await fetch(`${base}/api/media/${VEHICLE_ID}`, { method: "PATCH", headers: json(), body: JSON.stringify({ vehicleId: null }) });
  assert.equal(r.status, 200);
  assert.deepEqual(update, { $set: { vehicleId: null } });
});

test("Media.toPublic : véhicule peuplé => {id, name}, sinon null", () => {
  const base = { ownerId: USER, kind: "audio", title: "t", originalName: "t.mp3", storedName: "x", mimeType: "audio/mpeg", size: 1 };
  assert.equal(new Media(base).toPublic().vehicle, null);
  const withId = new Media({ ...base, vehicleId: VEHICLE_ID }).toPublic().vehicle;
  assert.deepEqual(withId, { id: VEHICLE_ID, name: null });
});

// ---------------------------------------------------------------------------
// Refonte de l'interface : drapeaux, tri du catalogue, listes enrichies
// ---------------------------------------------------------------------------

test("flagUrlFrom : URL Commons en HTTPS avec largeur, rien d'autre n'est accepté", async () => {
  const { flagUrlFrom } = await import("../src/wikipedia.js");
  assert.equal(
    flagUrlFrom("http://commons.wikimedia.org/wiki/Special:FilePath/Flag%20of%20France.svg"),
    "https://commons.wikimedia.org/wiki/Special:FilePath/Flag%20of%20France.svg?width=640",
  );
  assert.equal(flagUrlFrom("https://exemple.com/drapeau.png"), null);
  assert.equal(flagUrlFrom(undefined), null);
});

test("classifyVehicles : origines avec code ISO et drapeau, un seul drapeau par pays", async () => {
  const flag = (name) => ({ value: `http://commons.wikimedia.org/wiki/Special:FilePath/Flag%20of%20${name}.svg` });
  const row = (country, label, code, flagName) => ({
    item: { value: "http://www.wikidata.org/entity/Q159601" },
    category: { value: "helicopter" },
    country: { value: `http://www.wikidata.org/entity/${country}` },
    countryLabel: { value: label },
    ...(code && { code: { value: code } }),
    ...(flagName && { flag: flag(flagName) }),
  });
  const { impl } = fakeFetch({
    classification: {
      results: {
        bindings: [
          row("Q183", "Allemagne", "DE", "Germany"),
          row("Q183", "Allemagne", "DE", "Germany_(1867)"), // drapeau historique ignoré
          row("Q142", "France", "FR", "France"),
          row("Q15180", "Union soviétique", null, "the_Soviet_Union"),
        ],
      },
    },
  });
  const origins = (await classifyVehicles(["Q159601"], impl)).get("Q159601").origins;

  assert.deepEqual(origins.map((o) => [o.name, o.code]), [["Allemagne", "de"], ["France", "fr"], ["Union soviétique", null]]);
  assert.match(origins[0].flagUrl, /Flag%20of%20Germany\.svg\?width=640$/);
});

test("GET /api/vehicles : tri par popularité par défaut, tri validé", async (t) => {
  const pipelines = [];
  stub(t, Vehicle, "aggregatePaginate", async (aggregate, o) => {
    pipelines.push(aggregate.pipeline());
    return { docs: [], totalDocs: 0, limit: o.limit, page: o.page, totalPages: 1 };
  });
  const sortStage = (p) => p.find((s) => s.$sort).$sort;

  await fetch(`${base}/api/vehicles`, { headers: bearer() });
  await fetch(`${base}/api/vehicles?sort=recent`, { headers: bearer() });
  assert.deepEqual(sortStage(pipelines[0]), { mediaCount: -1, name: 1 });
  assert.deepEqual(sortStage(pipelines[1]), { createdAt: -1 });

  // Le compteur ne compte que les médias publics.
  const lookup = pipelines[0].find((s) => s.$lookup).$lookup;
  assert.equal(lookup.from, "media");
  assert.equal(lookup.pipeline[0].$match.visibility, "public");

  assert.equal((await fetch(`${base}/api/vehicles?sort=prix`, { headers: bearer() })).status, 400);
});

test("GET /api/vehicles/:id/media : chaque média reçoit une URL de lecture valable pour le lecteur", async (t) => {
  const MEDIA_ID = new mongoose.Types.ObjectId().toString();
  stub(t, Media, "aggregatePaginate", async (_a, o) => ({
    docs: [{ id: MEDIA_ID, kind: "image", owner: { id: OTHER, name: "Lucas" } }],
    totalDocs: 1,
    limit: o.limit,
    page: o.page,
    totalPages: 1,
  }));

  const json = await (await fetch(`${base}/api/vehicles/${VEHICLE_ID}/media`, { headers: bearer() })).json();
  const url = new URL(json.docs[0].url, base);
  assert.equal(url.pathname, `/api/media/${MEDIA_ID}/file`);
  const payload = jwt.verify(url.searchParams.get("token"), SECRET);
  assert.deepEqual([payload.sub, payload.mid, payload.scope], [USER, MEDIA_ID, "stream"]);
});

test("liste de médias : l'auteur joint n'expose que son nom", async () => {
  const { publicMediaPipeline } = await import("../src/models/Media.js");
  const ownerLookup = publicMediaPipeline({}).find((s) => s.$lookup?.from === "users").$lookup;
  assert.deepEqual(ownerLookup.pipeline, [{ $project: { _id: 0, id: { $toString: "$_id" }, name: 1 } }]);
});

test("buildClassificationQuery : pays d'origine, sinon pays, sinon pays du constructeur", () => {
  const query = buildClassificationQuery(["Q200038"]);
  assert.match(query, /\?item wdt:P495 \?origin/);
  assert.match(query, /\?item wdt:P17 \?itemCountry/);
  assert.match(query, /\?item wdt:P176\/wdt:P17 \?makerCountry/);
  assert.match(query, /COALESCE\(\?origin, \?itemCountry, \?makerCountry\) AS \?country/);
});
