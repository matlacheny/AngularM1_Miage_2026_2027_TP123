import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { Media } from "../src/models/Media.js";
import { Post } from "../src/models/Post.js";
import { User } from "../src/models/User.js";
import { Vehicle } from "../src/models/Vehicle.js";

/* Tests du profil public, des véhicules préférés et des filtres du fil (sans MongoDB). */

const SECRET = process.env.JWT_SECRET || "tp1-development-secret";
const USER = new mongoose.Types.ObjectId().toString();
const OTHER = new mongoose.Types.ObjectId().toString();
const V1 = new mongoose.Types.ObjectId().toString();
const V2 = new mongoose.Types.ObjectId().toString();
const bearer = (sub = USER) => ({ Authorization: `Bearer ${jwt.sign({ sub }, SECRET, { expiresIn: "1h" })}` });
const json = (sub) => ({ ...bearer(sub), "Content-Type": "application/json" });

let server, base;

test.before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

function stub(t, target, name, implementation) {
  const original = target[name];
  target[name] = implementation;
  t.after(() => {
    target[name] = original;
  });
}

const fakeUser = (favorites = []) =>
  new User({ _id: OTHER, name: "Lucas Bernard", email: "lucas@example.com", passwordHash: "x", bio: "Spotter", location: "Salon-de-Provence", favoriteVehicleIds: favorites });

const fakeVehicle = (id, name) =>
  new Vehicle({ _id: id, wikidataId: "Q1", name, category: "aircraft", countries: ["France"], origins: [{ name: "France", code: "fr", flagUrl: "f.png" }], imageUrl: `https://upload.wikimedia.org/${name}.jpg`, wikipediaUrl: "w", createdBy: USER });

test("schéma User : biographie et ville bornées, favoris exposés en chaînes", () => {
  const user = new User({ name: "Test", email: "t@example.com", passwordHash: "x", bio: "a".repeat(301) });
  assert.ok(user.validateSync().errors.bio);
  const ok = new User({ name: "Test", email: "t@example.com", passwordHash: "x", favoriteVehicleIds: [V1] });
  assert.deepEqual(ok.toPublic().favoriteVehicleIds, [V1]);
});

test("GET /api/users/:id : profil public sans email, publications visibles comptées, favoris dans l'ordre", async (t) => {
  let countFilter;
  stub(t, User, "findById", async () => fakeUser([V2, V1]));
  stub(t, Post, "countDocuments", async (filter) => {
    countFilter = filter;
    return 34;
  });
  stub(t, Vehicle, "find", async () => [fakeVehicle(V1, "Leclerc"), fakeVehicle(V2, "Dassault Rafale")]);

  const r = await fetch(`${base}/api/users/${OTHER}`, { headers: bearer() });
  assert.equal(r.status, 200);
  const profile = await r.json();

  assert.equal(profile.email, undefined);
  assert.equal(profile.location, "Salon-de-Provence");
  assert.equal(profile.postCount, 34);
  assert.deepEqual(profile.favorites.map((v) => v.name), ["Dassault Rafale", "Leclerc"]);
  assert.deepEqual(profile.favorites[0].origins, [{ name: "France", code: "fr", flagUrl: "f.png" }]);
  assert.equal(profile.favorites[0].imageUrl, "https://upload.wikimedia.org/Dassault Rafale.jpg", "photo de l'aperçu");
  assert.equal(String(countFilter.ownerId), OTHER);
  assert.equal(String(countFilter.$or[0].ownerId), USER, "comptage selon les droits du lecteur");
});

test("GET /api/users/:id : 404 inconnu ou mal formé", async (t) => {
  stub(t, User, "findById", async () => null);
  assert.equal((await fetch(`${base}/api/users/${OTHER}`, { headers: bearer() })).status, 404);
  assert.equal((await fetch(`${base}/api/users/pas-un-id`, { headers: bearer() })).status, 404);
});

test("PUT /api/users/me : ne modifie que les champs envoyés et valide leur type", async (t) => {
  let update;
  stub(t, User, "findByIdAndUpdate", async (_id, u) => {
    update = u;
    return new User({ name: "Matteo", email: "m@example.com", passwordHash: "x", ...u.$set });
  });

  const ok = await fetch(`${base}/api/users/me`, { method: "PUT", headers: json(), body: JSON.stringify({ bio: "Passionné", location: "Istres" }) });
  assert.equal(ok.status, 200);
  assert.deepEqual(update, { $set: { bio: "Passionné", location: "Istres" } });

  const bad = await fetch(`${base}/api/users/me`, { method: "PUT", headers: json(), body: JSON.stringify({ bio: 42 }) });
  assert.equal(bad.status, 400);
});

test("PUT /api/users/me/favorites/:id : ajout conditionné à la limite de 6", async (t) => {
  let filter;
  let update;
  stub(t, Vehicle, "exists", async () => ({ _id: V1 }));
  stub(t, User, "findOneAndUpdate", async (f, u) => {
    filter = f;
    update = u;
    return fakeUser([V1]);
  });

  const r = await fetch(`${base}/api/users/me/favorites/${V1}`, { method: "PUT", headers: bearer() });
  assert.equal(r.status, 200);
  assert.equal(filter._id, USER);
  assert.deepEqual(filter["favoriteVehicleIds.5"], { $exists: false });
  assert.equal(String(update.$addToSet.favoriteVehicleIds), V1);
});

test("PUT favori : 400 si la limite est atteinte, 404 pour un véhicule inconnu", async (t) => {
  stub(t, Vehicle, "exists", async (f) => (String(f._id) === V1 ? { _id: V1 } : null));
  stub(t, User, "findOneAndUpdate", async () => null);
  stub(t, User, "findById", async () => fakeUser([new mongoose.Types.ObjectId().toString()]));

  const full = await fetch(`${base}/api/users/me/favorites/${V1}`, { method: "PUT", headers: bearer() });
  assert.equal(full.status, 400);
  assert.match((await full.json()).message, /6 véhicules préférés au maximum/);

  assert.equal((await fetch(`${base}/api/users/me/favorites/${V2}`, { method: "PUT", headers: bearer() })).status, 404);
});

test("DELETE favori : $pull du véhicule", async (t) => {
  let update;
  stub(t, User, "findByIdAndUpdate", async (_id, u) => {
    update = u;
    return fakeUser([]);
  });
  const r = await fetch(`${base}/api/users/me/favorites/${V1}`, { method: "DELETE", headers: bearer() });
  assert.equal(r.status, 200);
  assert.equal(String(update.$pull.favoriteVehicleIds), V1);
});

test("GET /api/posts/feed?author=&kind= : posts d'un auteur, filtrés par type de média", async (t) => {
  const AUDIO_ID = new mongoose.Types.ObjectId();
  let kindFilter;
  stub(t, Media, "distinct", async (field, filter) => ((kindFilter = filter), [AUDIO_ID]));
  let pipeline;
  stub(t, Post, "aggregatePaginate", async (aggregate, o) => {
    pipeline = aggregate.pipeline();
    return { docs: [], totalDocs: 0, limit: o.limit, page: o.page, totalPages: 1 };
  });

  const r = await fetch(`${base}/api/posts/feed?author=${OTHER}&kind=audio`, { headers: bearer() });
  assert.equal(r.status, 200);
  assert.equal(String(pipeline[0].$match.ownerId), OTHER);
  assert.ok(pipeline[0].$match.$or, "les droits du lecteur restent appliqués");
  assert.deepEqual(pipeline[0].$match.mediaId, { $in: [AUDIO_ID] }, "le type est filtré dans le premier $match");
  assert.deepEqual(kindFilter, { kind: "audio" });

  assert.equal((await fetch(`${base}/api/posts/feed?kind=pdf`, { headers: bearer() })).status, 400);
  assert.equal((await fetch(`${base}/api/posts/feed?author=x`, { headers: bearer() })).status, 400);
});
