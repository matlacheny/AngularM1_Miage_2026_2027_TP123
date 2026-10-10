import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { createApp, redactUrl } from "../src/app.js";
import { canAccess } from "../src/access.js";
import { streamToken } from "../src/auth.js";
import { Media, SIZE_LIMITS, mediaKind } from "../src/models/Media.js";
import { UPLOADS } from "../src/uploads.js";

/*
 * Tests de l'étape 1 (médias multi-types, visibilité, lecture signée, Range).
 * Comme contract.test.js, aucun test ne se connecte à MongoDB : les accès au
 * modèle Media sont remplacés par des doublures le temps d'un test.
 */

const SECRET = process.env.JWT_SECRET || "tp1-development-secret";
const OWNER = new mongoose.Types.ObjectId().toString();
const OTHER = new mongoose.Types.ObjectId().toString();
const MEDIA_ID = new mongoose.Types.ObjectId().toString();
const OTHER_MEDIA_ID = new mongoose.Types.ObjectId().toString();

const tokenFor = (sub) => jwt.sign({ sub, email: "demo@example.com" }, SECRET, { expiresIn: "1h" });
const bearer = (sub) => ({ Authorization: `Bearer ${tokenFor(sub)}` });

let server, base;

test.before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

/** Remplace temporairement une méthode statique du modèle Media. */
function stub(t, name, implementation) {
  const original = Media[name];
  Media[name] = implementation;
  t.after(() => {
    Media[name] = original;
  });
}

/** Faux document Media tel que renvoyé par findById(...).select(...). */
function fakeMedia(overrides = {}) {
  const doc = {
    id: MEDIA_ID,
    ownerId: OWNER,
    kind: "audio",
    title: "Rafale - passage bas",
    mimeType: "audio/mpeg",
    storedName: "inexistant.mp3",
    visibility: "private",
    sharedWith: [],
    ...overrides,
  };
  doc.toPublic = () => ({ id: doc.id, ownerId: doc.ownerId, kind: doc.kind, title: doc.title, visibility: doc.visibility });
  return doc;
}

/** findById renvoie le document seulement si l'identifiant correspond. */
function stubFindById(t, doc) {
  stub(t, "findById", (id) => ({ select: async () => (id === doc.id ? doc : null) }));
}

// Chaque test d'upload utilise sa propre extension (.jpg, .png...) : les
// fichiers de test tournent en parallèle et partagent le dossier d'uploads.
const filesInUploads = async (ext) => (await fs.readdir(UPLOADS)).filter((f) => f.endsWith(ext)).sort();

// ---------------------------------------------------------------------------
// Règles pures
// ---------------------------------------------------------------------------

test("canAccess : le propriétaire voit toujours son média", () => {
  assert.equal(canAccess(OWNER, { ownerId: OWNER, visibility: "private" }), true);
});

test("canAccess : un média public est visible par tout utilisateur connecté", () => {
  assert.equal(canAccess(OTHER, { ownerId: OWNER, visibility: "public" }), true);
});

test("canAccess : un média privé est invisible pour les autres", () => {
  assert.equal(canAccess(OTHER, { ownerId: OWNER, visibility: "private" }), false);
});

test("canAccess : 'friends' exige que le propriétaire soit un ami du lecteur", () => {
  const media = { ownerId: OWNER, visibility: "friends" };
  assert.equal(canAccess(OTHER, media), false);
  assert.equal(canAccess(OTHER, media, new Set([OWNER])), true);
});

test("canAccess : un partage explicite ouvre un média privé", () => {
  const media = { ownerId: new mongoose.Types.ObjectId(OWNER), visibility: "private", sharedWith: [new mongoose.Types.ObjectId(OTHER)] };
  assert.equal(canAccess(OTHER, media), true);
});

test("canAccess : pas de lecteur ou pas de média => refus", () => {
  assert.equal(canAccess(undefined, { ownerId: OWNER, visibility: "public" }), false);
  assert.equal(canAccess(OTHER, null), false);
});

test("mediaKind et limites de taille par catégorie", () => {
  assert.equal(mediaKind("audio/mpeg"), "audio");
  assert.equal(mediaKind("image/webp"), "image");
  assert.equal(mediaKind("video/mp4"), "video");
  assert.equal(mediaKind("application/pdf"), null);
  assert.equal(SIZE_LIMITS.video, 100 * 1024 * 1024);
  assert.equal(SIZE_LIMITS.image, 10 * 1024 * 1024);
});

test("schéma Media : visibilité privée par défaut et valeurs contrôlées", () => {
  const media = new Media({
    ownerId: OWNER,
    kind: "video",
    title: "Leclerc",
    originalName: "l.mp4",
    storedName: "x.mp4",
    mimeType: "video/mp4",
    size: 1,
  });
  assert.equal(media.visibility, "private");
  media.visibility = "tout-le-monde";
  assert.ok(media.validateSync().errors.visibility);
});

test("redactUrl masque le jeton de lecture dans les logs", () => {
  assert.equal(redactUrl("/api/media/1/file?token=abc.def"), "/api/media/1/file?token=[masqué]");
  assert.equal(redactUrl("/api/media?page=2"), "/api/media?page=2");
});

// ---------------------------------------------------------------------------
// Authentification
// ---------------------------------------------------------------------------

test("401 sans JWT sur GET /api/media", async () => {
  const r = await fetch(`${base}/api/media`);
  assert.equal(r.status, 401);
});

test("un jeton de lecture ne donne pas accès au reste de l'API", async () => {
  const r = await fetch(`${base}/api/media`, {
    headers: { Authorization: `Bearer ${streamToken(OWNER, MEDIA_ID)}` },
  });
  assert.equal(r.status, 401);

  const profile = await fetch(`${base}/api/users/me`, {
    headers: { Authorization: `Bearer ${streamToken(OWNER, MEDIA_ID)}` },
  });
  assert.equal(profile.status, 401);
});

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

test("400 pour un upload sans fichier", async () => {
  const body = new FormData();
  body.append("title", "vide");
  const r = await fetch(`${base}/api/media`, { method: "POST", headers: bearer(OWNER), body });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).message, "Fichier requis");
});

test("400 pour un type de fichier refusé", async () => {
  const body = new FormData();
  body.append("file", new Blob(["%PDF"], { type: "application/pdf" }), "notice.pdf");
  const r = await fetch(`${base}/api/media`, { method: "POST", headers: bearer(OWNER), body });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).message, "Format de fichier non accepté");
});

test("400 pour une photo au-delà de 10 Mo, et fichier supprimé du disque", async () => {
  const before = await filesInUploads(".jpg");
  const body = new FormData();
  body.append("file", new Blob([new Uint8Array(SIZE_LIMITS.image + 1)], { type: "image/jpeg" }), "grosse.jpg");
  const r = await fetch(`${base}/api/media`, { method: "POST", headers: bearer(OWNER), body });
  assert.equal(r.status, 400);
  assert.match((await r.json()).message, /10 Mo maximum pour une photo/);
  assert.deepEqual(await filesInUploads(".jpg"), before);
});

test("400 pour une visibilité invalide, et fichier supprimé du disque", async () => {
  const before = await filesInUploads(".png");
  const body = new FormData();
  body.append("file", new Blob(["img"], { type: "image/png" }), "a.png");
  body.append("visibility", "tout-le-monde");
  const r = await fetch(`${base}/api/media`, { method: "POST", headers: bearer(OWNER), body });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).message, "Visibilité invalide");
  assert.deepEqual(await filesInUploads(".png"), before);
});

test("201 : la catégorie est déduite du type MIME et le propriétaire vient du JWT", async (t) => {
  let created;
  stub(t, "create", async (data) => {
    created = data;
    return fakeMedia({ ...data, id: MEDIA_ID });
  });
  t.after(() => fs.rm(path.join(UPLOADS, created.storedName), { force: true }));

  const body = new FormData();
  body.append("file", new Blob(["webm"], { type: "video/webm" }), "Tigre.webm");
  body.append("title", "Tigre en vol stationnaire");
  body.append("visibility", "public");
  body.append("ownerId", OTHER); // tentative d'usurpation : doit être ignorée
  const r = await fetch(`${base}/api/media`, { method: "POST", headers: bearer(OWNER), body });

  assert.equal(r.status, 201);
  assert.equal(created.kind, "video");
  assert.equal(created.visibility, "public");
  assert.equal(created.ownerId, OWNER);
  assert.equal(created.title, "Tigre en vol stationnaire");
});

// ---------------------------------------------------------------------------
// Lecture des métadonnées et droits
// ---------------------------------------------------------------------------

test("GET /api/media/:id : 404 pour le média privé d'un autre utilisateur", async (t) => {
  stubFindById(t, fakeMedia({ visibility: "private" }));
  const r = await fetch(`${base}/api/media/${MEDIA_ID}`, { headers: bearer(OTHER) });
  assert.equal(r.status, 404);
  assert.equal((await r.json()).message, "Média inconnu");
});

test("GET /api/media/:id : 200 pour le média public d'un autre utilisateur", async (t) => {
  stubFindById(t, fakeMedia({ visibility: "public" }));
  const r = await fetch(`${base}/api/media/${MEDIA_ID}`, { headers: bearer(OTHER) });
  assert.equal(r.status, 200);
  const json = await r.json();
  assert.equal(json.id, MEDIA_ID);
  assert.equal(json.storedName, undefined);
});

test("GET /api/media/:id : 404 pour un identifiant mal formé", async () => {
  const r = await fetch(`${base}/api/media/pas-un-id`, { headers: bearer(OWNER) });
  assert.equal(r.status, 404);
});

test("GET /api/media : filtre restreint au propriétaire et catégorie validée", async (t) => {
  let pipeline;
  stub(t, "aggregatePaginate", async (aggregate, o) => {
    pipeline = aggregate.pipeline();
    return { docs: [], totalDocs: 0, limit: o.limit, page: o.page, totalPages: 1 };
  });

  const ok = await fetch(`${base}/api/media?kind=video`, { headers: bearer(OWNER) });
  assert.equal(ok.status, 200);
  assert.equal(String(pipeline[0].$match.ownerId), OWNER);
  assert.equal(pipeline[0].$match.kind, "video");

  const bad = await fetch(`${base}/api/media?kind=pdf`, { headers: bearer(OWNER) });
  assert.equal(bad.status, 400);
});

// ---------------------------------------------------------------------------
// Modification et suppression (propriétaire uniquement)
// ---------------------------------------------------------------------------

test("PATCH /api/media/:id : filtre sur le propriétaire du JWT et valide la visibilité", async (t) => {
  let filter;
  stub(t, "findOneAndUpdate", async (f, update) => {
    filter = f;
    return fakeMedia(update.$set);
  });
  const headers = { ...bearer(OTHER), "Content-Type": "application/json" };

  const bad = await fetch(`${base}/api/media/${MEDIA_ID}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ visibility: "tout-le-monde" }),
  });
  assert.equal(bad.status, 400);

  const ok = await fetch(`${base}/api/media/${MEDIA_ID}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ visibility: "public" }),
  });
  assert.equal(ok.status, 200);
  assert.deepEqual(filter, { _id: MEDIA_ID, ownerId: OTHER });
});

test("DELETE /api/media/:id : 404 pour le média d'un autre utilisateur", async (t) => {
  const filters = [];
  stub(t, "findOneAndDelete", (f) => {
    filters.push(f);
    return { select: async () => (f.ownerId === OWNER ? fakeMedia() : null) };
  });
  const r = await fetch(`${base}/api/media/${MEDIA_ID}`, { method: "DELETE", headers: bearer(OTHER) });
  assert.equal(r.status, 404);
  assert.deepEqual(filters, [{ _id: MEDIA_ID, ownerId: OTHER }]);
});

// ---------------------------------------------------------------------------
// Lecture du fichier : URL signée et Range
// ---------------------------------------------------------------------------

test("URL de lecture : fichier complet, puis Range => 206 Partial Content", async (t) => {
  const storedName = `test-${MEDIA_ID}.mp4`;
  await fs.writeFile(path.join(UPLOADS, storedName), "0123456789");
  t.after(() => fs.rm(path.join(UPLOADS, storedName), { force: true }));
  stubFindById(t, fakeMedia({ kind: "video", mimeType: "video/mp4", storedName }));

  const signed = await fetch(`${base}/api/media/${MEDIA_ID}/stream-url`, { method: "POST", headers: bearer(OWNER) });
  assert.equal(signed.status, 200);
  const { url, expiresIn } = await signed.json();
  assert.match(url, new RegExp(`^/api/media/${MEDIA_ID}/file\\?token=`));
  assert.equal(expiresIn, 600);

  // Aucun en-tête Authorization : uniquement le jeton dans l'URL, comme <video src>.
  const full = await fetch(base + url);
  assert.equal(full.status, 200);
  assert.equal(full.headers.get("content-type"), "video/mp4");
  assert.equal(full.headers.get("accept-ranges"), "bytes");
  assert.equal(await full.text(), "0123456789");

  const partial = await fetch(base + url, { headers: { Range: "bytes=2-5" } });
  assert.equal(partial.status, 206);
  assert.equal(partial.headers.get("content-range"), "bytes 2-5/10");
  assert.equal(await partial.text(), "2345");
});

test("URL de lecture : refusée pour un média privé d'un autre utilisateur", async (t) => {
  stubFindById(t, fakeMedia({ visibility: "private" }));
  const r = await fetch(`${base}/api/media/${MEDIA_ID}/stream-url`, { method: "POST", headers: bearer(OTHER) });
  assert.equal(r.status, 404);
});

test("un jeton de lecture n'ouvre que le média pour lequel il a été émis", async () => {
  const r = await fetch(`${base}/api/media/${OTHER_MEDIA_ID}/file?token=${streamToken(OWNER, MEDIA_ID)}`);
  assert.equal(r.status, 401);
});

test("un jeton d'API classique passé dans l'URL est refusé", async () => {
  const r = await fetch(`${base}/api/media/${MEDIA_ID}/file?token=${tokenFor(OWNER)}`);
  assert.equal(r.status, 401);
});

test("les droits sont revérifiés à chaque lecture : média repassé en privé => 404", async (t) => {
  stubFindById(t, fakeMedia({ visibility: "private" }));
  // Jeton obtenu par OTHER quand le média était encore public.
  const r = await fetch(`${base}/api/media/${MEDIA_ID}/file?token=${streamToken(OTHER, MEDIA_ID)}`);
  assert.equal(r.status, 404);
});
