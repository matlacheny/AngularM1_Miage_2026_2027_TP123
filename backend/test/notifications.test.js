import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { Notification } from "../src/models/Notification.js";
import { Post } from "../src/models/Post.js";
import { notifications } from "../src/notifications.js";

/* Tests des notifications (J'aime et commentaires reçus), sans MongoDB. */

const SECRET = process.env.JWT_SECRET || "tp1-development-secret";
const ME = new mongoose.Types.ObjectId().toString();
const BOB = new mongoose.Types.ObjectId().toString();
const POST_ID = new mongoose.Types.ObjectId().toString();
const bearer = (sub = ME) => ({ Authorization: `Bearer ${jwt.sign({ sub }, SECRET, { expiresIn: "1h" })}` });
const oid = (id) => new mongoose.Types.ObjectId(id);

// setup.js remplace `notifications` par des doublures : on garde les vraies ici.
const real = await import(`../src/notifications.js?real=${Date.now()}`);

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

test("GET /api/notifications : JWT requis", async () => {
  assert.equal((await fetch(`${base}/api/notifications`)).status, 401);
});

test("GET /api/notifications : les miennes, plus récentes d'abord, et le nombre de non lues", async (t) => {
  let pipeline, countFilter;
  const items = [{ id: "n1", type: "like", actor: { id: BOB, name: "Bob" }, post: { id: POST_ID, title: "Rafale" }, read: false }];
  stub(t, Notification, "aggregate", async (p) => ((pipeline = p), items));
  stub(t, Notification, "countDocuments", async (f) => ((countFilter = f), 3));

  const r = await fetch(`${base}/api/notifications?limit=500`, { headers: bearer() });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { items, unreadCount: 3 });
  assert.equal(String(pipeline[0].$match.recipientId), ME);
  assert.deepEqual(pipeline[1].$sort, { createdAt: -1 });
  assert.equal(pipeline[2].$limit, 50);
  assert.deepEqual([String(countFilter.recipientId), countFilter.read], [ME, false]);
});

test("POST /api/notifications/read : marque les miennes comme lues", async (t) => {
  let filter, update;
  stub(t, Notification, "updateMany", async (f, u) => ((filter = f), (update = u), { modifiedCount: 2 }));
  const r = await fetch(`${base}/api/notifications/read`, { method: "POST", headers: bearer() });
  assert.equal(r.status, 204);
  assert.equal(filter.recipientId, ME);
  assert.deepEqual(update, { $set: { read: true } });
});

test("J'aime : une notification par personne (upsert), aucune sur son propre post, retirée avec le J'aime", async (t) => {
  const calls = [];
  stub(t, Notification, "updateOne", async (...args) => calls.push(["updateOne", ...args]));
  stub(t, Notification, "deleteOne", async (...args) => calls.push(["deleteOne", ...args]));
  const post = { _id: oid(POST_ID), ownerId: oid(ME) };

  await real.notifications.liked(post, oid(ME));
  assert.equal(calls.length, 0, "pas de notification pour soi-même");

  await real.notifications.liked(post, oid(BOB));
  const [, filter, update, options] = calls[0];
  assert.deepEqual([filter.type, String(filter.actorId)], ["like", BOB]);
  assert.equal(String(update.$setOnInsert.recipientId), ME);
  assert.equal(options.upsert, true);

  await real.notifications.unliked(post, oid(BOB));
  assert.equal(calls[1][0], "deleteOne");
});

test("Commentaire : notification avec un extrait, une erreur ne bloque pas le commentaire", async (t) => {
  let created;
  stub(t, Notification, "create", async (data) => (created = data));
  const post = { _id: oid(POST_ID), ownerId: oid(ME) };
  await real.notifications.commented(post, { _id: oid(), ownerId: oid(BOB), text: "x".repeat(300) });
  assert.equal(created.type, "comment");
  assert.equal(created.excerpt.length, 140);

  stub(t, Notification, "create", async () => {
    throw new Error("panne");
  });
  stub(t, console, "error", () => {});
  await real.notifications.commented(post, { _id: oid(), ownerId: oid(BOB), text: "ok" }); // ne lève pas
});

test("PUT /api/posts/:id/like déclenche la notification de l'auteur", async (t) => {
  const post = { _id: oid(POST_ID), ownerId: oid(BOB), likes: [oid(ME)] };
  stub(t, Post, "findOneAndUpdate", async () => post);
  let notified;
  stub(t, notifications, "liked", async (p, actor) => (notified = [p, String(actor)]));
  assert.equal((await fetch(`${base}/api/posts/${POST_ID}/like`, { method: "PUT", headers: bearer() })).status, 200);
  assert.deepEqual(notified, [post, ME]);
});
