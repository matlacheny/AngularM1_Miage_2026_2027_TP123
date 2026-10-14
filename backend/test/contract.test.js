import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";

/*
 * Tests de contrat et de sécurité de l'authentification JWT.
 * Aucun test ne se connecte à MongoDB : createApp() ne se connecte pas
 * (seul server.js le fait). Les règles propres aux médias sont couvertes
 * par media.test.js.
 */

// Même valeur par défaut que backend/src/auth.js quand JWT_SECRET est absent.
const SECRET = process.env.JWT_SECRET || "tp1-development-secret";
const OWNER = new mongoose.Types.ObjectId().toString();
const MEDIA_ID = new mongoose.Types.ObjectId().toString();

let server, base;

test.before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

test("401 sans JWT sur une route protégée", async () => {
  const r = await fetch(`${base}/api/media`);
  assert.equal(r.status, 401);
  assert.equal((await r.json()).message, "Authentification requise");
});

test("401 avec un JWT invalide (mauvaise signature)", async () => {
  const forged = jwt.sign({ sub: OWNER }, "pas-le-bon-secret");
  const r = await fetch(`${base}/api/media`, {
    headers: { Authorization: `Bearer ${forged}` },
  });
  assert.equal(r.status, 401);
  assert.equal((await r.json()).message, "Jeton invalide ou expiré");
});

test("401 avec un JWT expiré", async () => {
  const expired = jwt.sign({ sub: OWNER, exp: Math.floor(Date.now() / 1000) - 60 }, SECRET);
  const r = await fetch(`${base}/api/media`, {
    headers: { Authorization: `Bearer ${expired}` },
  });
  assert.equal(r.status, 401);
});

test("401 sans JWT sur DELETE /api/media/:id", async () => {
  const r = await fetch(`${base}/api/media/${MEDIA_ID}`, { method: "DELETE" });
  assert.equal(r.status, 401);
});

test("les anciennes routes /api/tracks n'existent plus", async () => {
  const r = await fetch(`${base}/api/tracks`);
  assert.equal(r.status, 404);
});
