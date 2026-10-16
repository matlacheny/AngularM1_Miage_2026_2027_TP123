import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { Comment } from "../src/models/Comment.js";
import { Media } from "../src/models/Media.js";
import { Post, postTitle, publicPostPipeline } from "../src/models/Post.js";
import { User } from "../src/models/User.js";
import { Vehicle } from "../src/models/Vehicle.js";
import { searchCondition, widest } from "../src/routes/posts.js";

/*
 * Tests du fil d'actualité (posts, J'aime, commentaires).
 * Sans MongoDB : les accès aux modèles sont remplacés par des doublures.
 */

const SECRET = process.env.JWT_SECRET || "tp1-development-secret";
const USER = new mongoose.Types.ObjectId().toString();
const OTHER = new mongoose.Types.ObjectId().toString();
const POST_ID = new mongoose.Types.ObjectId().toString();
const MEDIA_ID = new mongoose.Types.ObjectId().toString();
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

function stub(t, target, name, implementation) {
  const original = target[name];
  target[name] = implementation;
  t.after(() => {
    target[name] = original;
  });
}

/** Fausse agrégation : capture le pipeline et renvoie des documents fixes. */
function stubAggregate(t, model, docs, captured = {}) {
  stub(t, model, "aggregate", (pipeline) => {
    captured.pipeline = pipeline;
    const result = Promise.resolve(docs);
    result.pipeline = () => pipeline;
    result.match = () => result;
    return result;
  });
  return captured;
}

const shapedPost = (overrides = {}) => ({
  id: POST_ID,
  ownerId: USER,
  owner: { id: USER, name: "Matteo" },
  text: "Passage bas",
  media: { id: MEDIA_ID, kind: "image", title: "Rafale", mimeType: "image/jpeg" },
  vehicle: { id: VEHICLE_ID, name: "Dassault Rafale", category: "aircraft" },
  visibility: "public",
  likeCount: 0,
  likedByMe: false,
  commentCount: 0,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Règles
// ---------------------------------------------------------------------------

test("widest : la visibilité la plus ouverte l'emporte", () => {
  assert.equal(widest("private", "public"), "public");
  assert.equal(widest("public", "friends"), "public");
  assert.equal(widest("friends", "private"), "friends");
});

test("pipeline du fil : compteur de J'aime et « j'aime » sans exposer la liste", () => {
  const viewer = new mongoose.Types.ObjectId(USER);
  const pipeline = publicPostPipeline({}, viewer);
  const fields = pipeline.find((s) => s.$addFields).$addFields;
  assert.deepEqual(fields.likeCount, { $size: "$likes" });
  assert.deepEqual(fields.likedByMe, { $in: [viewer, "$likes"] });
  assert.equal(pipeline.at(-1).$project.likes, 0);
  const ownerLookup = pipeline.find((s) => s.$lookup?.from === "users").$lookup;
  assert.deepEqual(Object.keys(ownerLookup.pipeline[0].$project).sort(), ["_id", "id", "name"]);
});

// ---------------------------------------------------------------------------
// Fil
// ---------------------------------------------------------------------------

test("GET /api/posts/feed : 401 sans JWT", async () => {
  assert.equal((await fetch(`${base}/api/posts/feed`)).status, 401);
});

test("GET /api/posts/feed : règle d'accès du lecteur, URL de lecture par média", async (t) => {
  let pipeline;
  stub(t, Post, "aggregatePaginate", async (aggregate, o) => {
    pipeline = aggregate.pipeline();
    return { docs: [shapedPost()], totalDocs: 1, limit: o.limit, page: o.page, totalPages: 1 };
  });

  const r = await fetch(`${base}/api/posts/feed`, { headers: bearer(OTHER) });
  assert.equal(r.status, 200);
  const match = pipeline[0].$match;
  assert.equal(String(match.$or[0].ownerId), OTHER);
  assert.deepEqual(match.$or[2], { visibility: "public" });
  assert.equal(match.ownerId, undefined);

  const { docs } = await r.json();
  const url = new URL(docs[0].media.url, base);
  const payload = jwt.verify(url.searchParams.get("token"), SECRET);
  assert.deepEqual([payload.sub, payload.mid], [OTHER, MEDIA_ID]);
});

test("GET /api/posts/feed?others=1 : exclut les posts du lecteur", async (t) => {
  let match;
  stub(t, Post, "aggregatePaginate", async (aggregate, o) => {
    match = aggregate.pipeline()[0].$match;
    return { docs: [], totalDocs: 0, limit: o.limit, page: o.page, totalPages: 1 };
  });
  await fetch(`${base}/api/posts/feed?others=1&limit=4`, { headers: bearer() });
  assert.equal(String(match.ownerId.$ne), USER);
});

// ---------------------------------------------------------------------------
// Publication
// ---------------------------------------------------------------------------

test("POST /api/posts : texte ou média obligatoire, visibilité validée", async () => {
  const empty = await fetch(`${base}/api/posts`, { method: "POST", headers: json(), body: JSON.stringify({ text: "  " }) });
  assert.equal(empty.status, 400);
  const bad = await fetch(`${base}/api/posts`, { method: "POST", headers: json(), body: JSON.stringify({ text: "x", visibility: "monde" }) });
  assert.equal(bad.status, 400);
});

test("POST /api/posts : refuse le média d'un autre utilisateur", async (t) => {
  let filter;
  stub(t, Media, "findOne", async (f) => {
    filter = f;
    return null;
  });
  const r = await fetch(`${base}/api/posts`, { method: "POST", headers: json(), body: JSON.stringify({ mediaId: MEDIA_ID }) });
  assert.equal(r.status, 400);
  assert.deepEqual(filter, { _id: MEDIA_ID, ownerId: USER });
});

test("POST /api/posts : hérite du véhicule du média et élargit sa visibilité", async (t) => {
  let saved = false;
  const media = { id: MEDIA_ID, _id: new mongoose.Types.ObjectId(MEDIA_ID), visibility: "private", vehicleId: VEHICLE_ID, save: async () => (saved = true) };
  let created;
  stub(t, Media, "findOne", async () => media);
  stub(t, Vehicle, "exists", async () => ({ _id: VEHICLE_ID }));
  stub(t, Post, "create", async (data) => {
    created = data;
    return { id: POST_ID };
  });
  stubAggregate(t, Post, [shapedPost()]);

  const r = await fetch(`${base}/api/posts`, {
    method: "POST",
    headers: json(),
    body: JSON.stringify({ text: "Passage bas", mediaId: MEDIA_ID, visibility: "public", ownerId: OTHER }),
  });
  assert.equal(r.status, 201);
  assert.equal(created.ownerId, USER, "l'auteur vient du JWT");
  assert.equal(created.vehicleId, VEHICLE_ID);
  assert.equal(media.visibility, "public");
  assert.equal(saved, true);
  assert.equal((await r.json()).id, POST_ID);
});

// ---------------------------------------------------------------------------
// Lecture, suppression
// ---------------------------------------------------------------------------

test("GET /api/posts/:id : 404 si le post n'est pas visible par le lecteur", async (t) => {
  const captured = stubAggregate(t, Post, []);
  const r = await fetch(`${base}/api/posts/${POST_ID}`, { headers: bearer(OTHER) });
  assert.equal(r.status, 404);
  assert.equal(String(captured.pipeline[0].$match._id), POST_ID);
  assert.ok(captured.pipeline[0].$match.$or, "filtre d'accès appliqué");
});

test("DELETE /api/posts/:id : supprime aussi le média s'il n'est plus publié", async (t) => {
  const mediaId = new mongoose.Types.ObjectId(MEDIA_ID);
  let stillPublished = false;
  let removedMedia;
  stub(t, Post, "findOneAndDelete", async () => ({ id: POST_ID, _id: new mongoose.Types.ObjectId(POST_ID), mediaId }));
  stub(t, Comment, "deleteMany", async () => ({}));
  stub(t, Post, "exists", async () => stillPublished);
  stub(t, Media, "findOneAndDelete", (f) => {
    removedMedia = f;
    return { select: async () => ({ id: MEDIA_ID, storedName: "absent.jpg" }) };
  });

  stillPublished = true;
  assert.equal((await fetch(`${base}/api/posts/${POST_ID}`, { method: "DELETE", headers: bearer() })).status, 204);
  assert.equal(removedMedia, undefined, "média gardé : un autre post le publie");

  stillPublished = false;
  assert.equal((await fetch(`${base}/api/posts/${POST_ID}`, { method: "DELETE", headers: bearer() })).status, 204);
  assert.deepEqual([String(removedMedia._id), removedMedia.ownerId], [MEDIA_ID, USER]);
});

test("DELETE /api/posts/:id : auteur uniquement, commentaires supprimés", async (t) => {
  let filter;
  let removedComments;
  stub(t, Post, "findOneAndDelete", async (f) => {
    filter = f;
    return f.ownerId === USER ? { id: POST_ID, _id: new mongoose.Types.ObjectId(POST_ID) } : null;
  });
  stub(t, Comment, "deleteMany", async (f) => (removedComments = f));

  const other = await fetch(`${base}/api/posts/${POST_ID}`, { method: "DELETE", headers: bearer(OTHER) });
  assert.equal(other.status, 404);
  const mine = await fetch(`${base}/api/posts/${POST_ID}`, { method: "DELETE", headers: bearer() });
  assert.equal(mine.status, 204);
  assert.equal(filter.ownerId, USER);
  assert.equal(String(removedComments.postId), POST_ID);
});

test("postTitle : intitulé choisi, sinon titre du média, sinon première ligne du texte", () => {
  assert.equal(postTitle("  Décollage plein PC ", "IMG_0042"), "Décollage plein PC");
  assert.equal(postTitle("", "Rafale au roulage", "Passage bas"), "Rafale au roulage");
  assert.equal(postTitle(undefined, null, " Passage bas\nSource : Commons"), "Passage bas");
  assert.equal(postTitle("", null, ""), "");
  assert.equal(postTitle("x".repeat(200)).length, 120);
});

test("POST /api/posts : intitulé enregistré, repris du média s'il manque, 120 caractères au plus", async (t) => {
  const media = { id: MEDIA_ID, _id: new mongoose.Types.ObjectId(MEDIA_ID), title: "Rafale au roulage", visibility: "public", vehicleId: null };
  const created = [];
  stub(t, Media, "findOne", async () => media);
  stub(t, Post, "create", async (data) => {
    created.push(data);
    return { id: POST_ID };
  });
  stubAggregate(t, Post, [shapedPost()]);
  const publish = (body) => fetch(`${base}/api/posts`, { method: "POST", headers: json(), body: JSON.stringify(body) });

  assert.equal((await publish({ title: " Décollage plein PC ", mediaId: MEDIA_ID })).status, 201);
  assert.equal((await publish({ mediaId: MEDIA_ID })).status, 201);
  assert.deepEqual(created.map((c) => c.title), ["Décollage plein PC", "Rafale au roulage"]);
  assert.equal((await publish({ title: "x".repeat(121), text: "ok" })).status, 400);
});

// ---------------------------------------------------------------------------
// J'aime
// ---------------------------------------------------------------------------

test("PUT / DELETE /api/posts/:id/like : $addToSet / $pull du lecteur, compteur renvoyé", async (t) => {
  const updates = [];
  stub(t, Post, "findOneAndUpdate", async (filter, update) => {
    updates.push({ filter, update });
    const viewer = new mongoose.Types.ObjectId(USER);
    return { likes: update.$addToSet ? [viewer, new mongoose.Types.ObjectId()] : [new mongoose.Types.ObjectId()] };
  });

  const liked = await (await fetch(`${base}/api/posts/${POST_ID}/like`, { method: "PUT", headers: bearer() })).json();
  assert.deepEqual(liked, { likeCount: 2, likedByMe: true });
  const unliked = await (await fetch(`${base}/api/posts/${POST_ID}/like`, { method: "DELETE", headers: bearer() })).json();
  assert.deepEqual(unliked, { likeCount: 1, likedByMe: false });

  assert.equal(String(updates[0].update.$addToSet.likes), USER);
  assert.equal(String(updates[1].update.$pull.likes), USER);
  assert.ok(updates[0].filter.$or, "on ne peut aimer qu'un post visible");
});

test("J'aime sur un post invisible : 404", async (t) => {
  stub(t, Post, "findOneAndUpdate", async () => null);
  assert.equal((await fetch(`${base}/api/posts/${POST_ID}/like`, { method: "PUT", headers: bearer() })).status, 404);
});

// ---------------------------------------------------------------------------
// Commentaires
// ---------------------------------------------------------------------------

test("POST /api/posts/:id/comments : texte validé, compteur incrémenté, auteur du JWT", async (t) => {
  let increment;
  let created;
  stub(t, Post, "findOneAndUpdate", async (_f, update) => {
    increment = update;
    return { id: POST_ID, _id: new mongoose.Types.ObjectId(POST_ID), commentCount: 4 };
  });
  stub(t, Comment, "create", async (data) => {
    created = data;
    return { id: "c1" };
  });
  stubAggregate(t, Comment, [{ id: "c1", text: "Superbe", owner: { id: USER, name: "Matteo" } }]);

  const empty = await fetch(`${base}/api/posts/${POST_ID}/comments`, { method: "POST", headers: json(), body: JSON.stringify({ text: " " }) });
  assert.equal(empty.status, 400);

  const r = await fetch(`${base}/api/posts/${POST_ID}/comments`, { method: "POST", headers: json(), body: JSON.stringify({ text: " Superbe " }) });
  assert.equal(r.status, 201);
  assert.deepEqual(increment, { $inc: { commentCount: 1 } });
  assert.equal(created.ownerId, USER);
  assert.equal(created.text, "Superbe");
  const body = await r.json();
  assert.equal(body.commentCount, 4);
  assert.equal(body.comment.owner.name, "Matteo");
});

test("GET /api/posts/:id/comments : 404 si le post est invisible", async (t) => {
  stub(t, Post, "exists", async () => null);
  assert.equal((await fetch(`${base}/api/posts/${POST_ID}/comments`, { headers: bearer(OTHER) })).status, 404);
});

// ---------------------------------------------------------------------------
// Recherche (étape 4)
// ---------------------------------------------------------------------------

/** Doublures des recherches de fiches et de membres : renvoient ids[…] et capturent les filtres. */
function stubSearch(t, ids = {}) {
  const filters = {};
  for (const [name, model] of [["vehicle", Vehicle], ["user", User]]) {
    stub(t, model, "distinct", async (field, filter) => {
      filters[name] = filter;
      return ids[name] ?? [];
    });
  }
  return filters;
}

/** La regex ne trouve que le texte littéral : ".*" n'est pas un joker. */
const literal = (source, text = "Mirage.*") => new RegExp(source).test(text) && !new RegExp(source).test("Mirage 2000");

test("searchCondition : intitulé, véhicule (nom ou alias) ou auteur, jamais le texte, regex échappée", async (t) => {
  const vehicleId = new mongoose.Types.ObjectId();
  const ownerId = new mongoose.Types.ObjectId();
  const filters = stubSearch(t, { vehicle: [vehicleId], user: [ownerId] });

  const condition = await searchCondition("Mirage.*");
  const [title, ...others] = condition.$or;
  assert.deepEqual(others, [{ vehicleId: { $in: [vehicleId] } }, { ownerId: { $in: [ownerId] } }]);
  assert.ok(literal(title.title.$regex), "intitulé cherché, regex échappée");
  assert.equal(title.title.$options, "i");
  const [name, alias] = filters.vehicle.$or;
  assert.ok(literal(name.name.$regex));
  assert.equal(name.name.$options, "i");
  assert.ok(literal(alias.aliases.$regex, "mirage.*"), "alias comparé au nom normalisé");
  assert.ok(literal(filters.user.name.$regex));
  assert.equal(filters.user.name.$options, "i");
});

test("GET /api/posts/feed?q=&media=1 : recherche par intitulé, véhicule ou auteur, droits conservés", async (t) => {
  const vehicleId = new mongoose.Types.ObjectId();
  const filters = stubSearch(t, { vehicle: [vehicleId] });
  let match;
  stub(t, Post, "aggregatePaginate", async (aggregate, o) => {
    match = aggregate.pipeline()[0].$match;
    return { docs: [], totalDocs: 0, limit: o.limit, page: o.page, totalPages: 1 };
  });

  const r = await fetch(`${base}/api/posts/feed?q=${encodeURIComponent("  hugo ")}&media=1`, { headers: bearer() });
  assert.equal(r.status, 200);
  assert.equal(filters.user.name.$regex, "hugo", "q est nettoyé");
  assert.deepEqual(match.$and[0].$or[1], { vehicleId: { $in: [vehicleId] } });
  assert.deepEqual(match.$and[0].$or[0], { title: { $regex: "hugo", $options: "i" } });
  assert.equal(match.text, undefined, "le texte du post n'est pas cherché");
  assert.deepEqual(match.mediaId, { $ne: null });
  assert.equal(String(match.$or[0].ownerId), USER, "les droits du lecteur restent la clé $or");
});

test("GET /api/posts/feed : sans q, aucune condition de recherche", async (t) => {
  const filters = stubSearch(t);
  let match;
  stub(t, Post, "aggregatePaginate", async (aggregate, o) => {
    match = aggregate.pipeline()[0].$match;
    return { docs: [], totalDocs: 0, limit: o.limit, page: o.page, totalPages: 1 };
  });

  await fetch(`${base}/api/posts/feed?q=%20%20`, { headers: bearer() });
  assert.equal(match.$and, undefined);
  assert.equal(match.mediaId, undefined);
  assert.equal(filters.vehicle, undefined, "aucune recherche préalable inutile");
});

test("GET /api/posts/feed?q= : combinable avec kind, catégorie inconnue refusée", async (t) => {
  stubSearch(t);
  const AUDIO_ID = new mongoose.Types.ObjectId();
  stub(t, Media, "distinct", async () => [AUDIO_ID]);
  let pipeline;
  stub(t, Post, "aggregatePaginate", async (aggregate, o) => {
    pipeline = aggregate.pipeline();
    return { docs: [], totalDocs: 0, limit: o.limit, page: o.page, totalPages: 1 };
  });

  await fetch(`${base}/api/posts/feed?q=leclerc&kind=audio`, { headers: bearer() });
  assert.ok(pipeline[0].$match.$and);
  assert.deepEqual(pipeline[0].$match.mediaId, { $in: [AUDIO_ID] }, "le type est filtré dans le premier $match");
  assert.equal((await fetch(`${base}/api/posts/feed?q=leclerc&kind=pdf`, { headers: bearer() })).status, 400);
});
