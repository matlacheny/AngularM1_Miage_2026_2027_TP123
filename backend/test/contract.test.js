import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { Track } from "../src/models/Track.js";

/*
 * Tests de contrat et de sécurité (TP3, extension backend facultative).
 * Aucun test ne se connecte à MongoDB : createApp() ne se connecte pas
 * (seul server.js le fait), et les rares accès au modèle Track sont
 * remplacés par des doublures le temps d'un test.
 */

// Même valeur par défaut que backend/src/app.js quand JWT_SECRET est absent.
const SECRET = process.env.JWT_SECRET || "tp1-development-secret";
const OWNER = new mongoose.Types.ObjectId().toString();
const OTHER = new mongoose.Types.ObjectId().toString();
const TRACK_ID = new mongoose.Types.ObjectId().toString();

const tokenFor = (sub) => jwt.sign({ sub, email: "demo@example.com" }, SECRET, { expiresIn: "1h" });

let server, base;

test.before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

/** Remplace temporairement une méthode statique du modèle Track. */
function stub(t, name, implementation) {
  const original = Track[name];
  Track[name] = implementation;
  t.after(() => {
    Track[name] = original;
  });
}

test("401 sans JWT sur une route protégée", async () => {
  const r = await fetch(`${base}/api/tracks`);
  assert.equal(r.status, 401);
  assert.equal((await r.json()).message, "Authentification requise");
});

test("401 avec un JWT invalide (mauvaise signature)", async () => {
  const forged = jwt.sign({ sub: OWNER }, "pas-le-bon-secret");
  const r = await fetch(`${base}/api/tracks`, {
    headers: { Authorization: `Bearer ${forged}` },
  });
  assert.equal(r.status, 401);
  assert.equal((await r.json()).message, "Jeton invalide ou expiré");
});

test("401 avec un JWT expiré", async () => {
  const expired = jwt.sign({ sub: OWNER, exp: Math.floor(Date.now() / 1000) - 60 }, SECRET);
  const r = await fetch(`${base}/api/tracks`, {
    headers: { Authorization: `Bearer ${expired}` },
  });
  assert.equal(r.status, 401);
});

test("400 pour un upload sans fichier", async () => {
  const body = new FormData();
  body.append("title", "Sans fichier");
  const r = await fetch(`${base}/api/tracks`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenFor(OWNER)}` },
    body,
  });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).message, "Fichier audio requis");
});

test("400 pour un type MIME refusé", async () => {
  const body = new FormData();
  body.append("audio", new Blob(["pas de l'audio"], { type: "text/plain" }), "note.txt");
  body.append("title", "Texte");
  const r = await fetch(`${base}/api/tracks`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenFor(OWNER)}` },
    body,
  });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).message, "Format audio non accepté");
});

test("pagination : page et limit transmis au plugin, filtre restreint au propriétaire", async (t) => {
  let received;
  stub(t, "aggregatePaginate", async (aggregate, options) => {
    received = { pipeline: aggregate.pipeline(), options };
    return {
      docs: [],
      totalDocs: 7,
      limit: options.limit,
      page: options.page,
      totalPages: 3,
      pagingCounter: 1,
      hasPrevPage: true,
      hasNextPage: true,
      prevPage: 1,
      nextPage: 3,
    };
  });

  const r = await fetch(`${base}/api/tracks?page=2&limit=3`, {
    headers: { Authorization: `Bearer ${tokenFor(OWNER)}` },
  });
  assert.equal(r.status, 200);
  const json = await r.json();

  assert.deepEqual(received.options, { page: 2, limit: 3 });
  assert.equal(String(received.pipeline[0].$match.ownerId), OWNER);
  assert.deepEqual(
    Object.keys(json).sort(),
    ["docs", "hasNextPage", "hasPrevPage", "limit", "nextPage", "page", "pagingCounter", "prevPage", "totalDocs", "totalPages"],
  );
  assert.equal(json.page, 2);
  assert.equal(json.limit, 3);
});

test("pagination : limit borné à 20 et page minimale 1", async (t) => {
  let options;
  stub(t, "aggregatePaginate", async (_aggregate, o) => {
    options = o;
    return { docs: [], totalDocs: 0, limit: o.limit, page: o.page, totalPages: 1 };
  });

  await fetch(`${base}/api/tracks?page=-4&limit=500`, {
    headers: { Authorization: `Bearer ${tokenFor(OWNER)}` },
  });
  assert.deepEqual(options, { page: 1, limit: 20 });
});

test("404 pour lire ou supprimer la piste d'un autre utilisateur", async (t) => {
  // La doublure reproduit le filtre { _id, ownerId } de la vraie requête :
  // la piste n'est trouvée que si ownerId correspond au propriétaire.
  const filters = [];
  const lookup = (filter) => {
    filters.push(filter);
    return filter.ownerId === OWNER ? { id: TRACK_ID, storedName: "x.mp3", mimeType: "audio/mpeg" } : null;
  };
  stub(t, "findOne", (filter) => ({ select: async () => lookup(filter) }));
  stub(t, "findOneAndDelete", (filter) => ({ select: async () => lookup(filter) }));

  const headers = { Authorization: `Bearer ${tokenFor(OTHER)}` };

  const audio = await fetch(`${base}/api/tracks/${TRACK_ID}/audio`, { headers });
  assert.equal(audio.status, 404);
  assert.equal((await audio.json()).message, "Piste inconnue");

  const removal = await fetch(`${base}/api/tracks/${TRACK_ID}`, { method: "DELETE", headers });
  assert.equal(removal.status, 404);

  // Les deux requêtes ont bien filtré sur l'identité issue du JWT, pas sur un paramètre client.
  assert.deepEqual(filters, [
    { _id: TRACK_ID, ownerId: OTHER },
    { _id: TRACK_ID, ownerId: OTHER },
  ]);
});

test("401 sans JWT sur DELETE /api/tracks/:id", async () => {
  const r = await fetch(`${base}/api/tracks/${TRACK_ID}`, { method: "DELETE" });
  assert.equal(r.status, 401);
});
