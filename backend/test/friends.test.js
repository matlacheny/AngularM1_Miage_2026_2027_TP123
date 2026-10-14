import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { friendIdsOf, friendships, relationTo } from "../src/friends.js";
import { Friendship, pairKey } from "../src/models/Friendship.js";
import { Media } from "../src/models/Media.js";
import { Post } from "../src/models/Post.js";
import { User } from "../src/models/User.js";
import { Vehicle } from "../src/models/Vehicle.js";

/* Tests de l'escadrille : amis, invitations, partages et activité (sans MongoDB). */

const SECRET = process.env.JWT_SECRET || "tp1-development-secret";
const ME = new mongoose.Types.ObjectId().toString();
const BOB = new mongoose.Types.ObjectId().toString();
const EVE = new mongoose.Types.ObjectId().toString();
const LINK = new mongoose.Types.ObjectId().toString();
const MEDIA_ID = new mongoose.Types.ObjectId().toString();
const bearer = (sub = ME) => ({ Authorization: `Bearer ${jwt.sign({ sub }, SECRET, { expiresIn: "1h" })}` });
const json = (sub) => ({ ...bearer(sub), "Content-Type": "application/json" });
const oid = (id) => new mongoose.Types.ObjectId(id);

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

/** Imite Model.find(...).select(...).lean(). */
const query = (docs) => ({ select: () => ({ lean: async () => docs, sort: () => ({ limit: () => ({ lean: async () => docs }) }) }), sort: () => ({ lean: async () => docs }), lean: async () => docs });

// ---------------------------------------------------------------------------
// Règles
// ---------------------------------------------------------------------------

test("pairKey ne dépend pas du sens de la demande", () => {
  assert.equal(pairKey(ME, BOB), pairKey(BOB, ME));
  assert.notEqual(pairKey(ME, BOB), pairKey(ME, EVE));
});

test("friendIdsOf : l'autre membre de chaque amitié acceptée", async (t) => {
  let filter;
  stub(t, Friendship, "find", (f) => {
    filter = f;
    return query([
      { requesterId: oid(ME), recipientId: oid(BOB) },
      { requesterId: oid(EVE), recipientId: oid(ME) },
    ]);
  });
  assert.deepEqual([...(await friendIdsOf(ME))].sort(), [BOB, EVE].sort());
  assert.equal(filter.status, "accepted");
});

test("relationTo : self, none, friend, outgoing, incoming", async (t) => {
  assert.equal((await relationTo(ME, ME)).status, "self");
  const links = new Map();
  stub(t, friendships, "between", async (a, b) => links.get(pairKey(a, b)) ?? null);

  assert.equal((await relationTo(ME, BOB)).status, "none");
  links.set(pairKey(ME, BOB), { id: LINK, status: "accepted", requesterId: oid(BOB) });
  assert.deepEqual(await relationTo(ME, BOB), { status: "friend", requestId: LINK });
  links.set(pairKey(ME, EVE), { id: LINK, status: "pending", requesterId: oid(ME) });
  assert.equal((await relationTo(ME, EVE)).status, "outgoing");
  assert.equal((await relationTo(EVE, ME)).status, "incoming");
});

test("visibilité « Escadrille » : un ami voit le média, un autre membre non", async (t) => {
  const media = { id: MEDIA_ID, ownerId: BOB, visibility: "friends", sharedWith: [], mimeType: "image/png", toPublic: () => ({ id: MEDIA_ID }) };
  stub(t, Media, "findById", () => ({ select: async () => media }));
  stub(t, friendships, "idsOf", async (id) => new Set(id === ME ? [BOB] : []));

  assert.equal((await fetch(`${base}/api/media/${MEDIA_ID}`, { headers: bearer(ME) })).status, 200);
  assert.equal((await fetch(`${base}/api/media/${MEDIA_ID}`, { headers: bearer(EVE) })).status, 404);
});

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------

test("POST /api/friends/requests : 400 pour soi-même, 404 pour un inconnu", async (t) => {
  stub(t, User, "exists", async () => null);
  const self = await fetch(`${base}/api/friends/requests`, { method: "POST", headers: json(), body: JSON.stringify({ userId: ME }) });
  assert.equal(self.status, 400);
  const unknown = await fetch(`${base}/api/friends/requests`, { method: "POST", headers: json(), body: JSON.stringify({ userId: BOB }) });
  assert.equal(unknown.status, 404);
});

test("POST /api/friends/requests : 409 si déjà amis ou invitation déjà envoyée", async (t) => {
  stub(t, User, "exists", async () => ({ _id: BOB }));
  let link = { status: "accepted", requesterId: oid(BOB) };
  stub(t, friendships, "between", async () => link);

  const friends = await fetch(`${base}/api/friends/requests`, { method: "POST", headers: json(), body: JSON.stringify({ userId: BOB }) });
  assert.equal(friends.status, 409);
  link = { status: "pending", requesterId: oid(ME) };
  const sent = await fetch(`${base}/api/friends/requests`, { method: "POST", headers: json(), body: JSON.stringify({ userId: BOB }) });
  assert.equal(sent.status, 409);
});

test("POST /api/friends/requests : invitations croisées => amitié acceptée directement", async (t) => {
  stub(t, User, "exists", async () => ({ _id: BOB }));
  const link = { id: LINK, status: "pending", requesterId: oid(BOB), save: async () => {} };
  stub(t, friendships, "between", async () => link);

  const r = await fetch(`${base}/api/friends/requests`, { method: "POST", headers: json(), body: JSON.stringify({ userId: BOB }) });
  assert.equal(r.status, 200);
  assert.equal(link.status, "accepted");
});

test("POST /api/friends/requests : 201, expéditeur issu du JWT, clé de paire unique", async (t) => {
  let created;
  stub(t, User, "exists", async () => ({ _id: BOB }));
  stub(t, Friendship, "create", async (data) => {
    created = data;
    return { id: LINK };
  });
  const r = await fetch(`${base}/api/friends/requests`, { method: "POST", headers: json(), body: JSON.stringify({ userId: BOB }) });
  assert.equal(r.status, 201);
  assert.deepEqual(await r.json(), { status: "outgoing", requestId: LINK });
  assert.equal(created.requesterId, ME);
  assert.equal(created.pairKey, pairKey(ME, BOB));
});

test("accepter : seul le destinataire d'une invitation en attente peut le faire", async (t) => {
  let filter;
  stub(t, Friendship, "findOneAndUpdate", async (f) => {
    filter = f;
    return null;
  });
  const r = await fetch(`${base}/api/friends/requests/${LINK}/accept`, { method: "POST", headers: bearer() });
  assert.equal(r.status, 404);
  assert.deepEqual(filter, { _id: LINK, recipientId: ME, status: "pending" });
});

test("refuser / annuler : expéditeur ou destinataire, invitation en attente uniquement", async (t) => {
  let filter;
  stub(t, Friendship, "findOneAndDelete", async (f) => {
    filter = f;
    return { id: LINK };
  });
  const r = await fetch(`${base}/api/friends/requests/${LINK}`, { method: "DELETE", headers: bearer() });
  assert.equal(r.status, 204);
  assert.equal(filter.status, "pending");
  assert.deepEqual(filter.$or, [{ requesterId: ME }, { recipientId: ME }]);
});

test("retirer un ami arrête les partages dans les deux sens", async (t) => {
  const pulls = [];
  stub(t, Friendship, "findOneAndDelete", async (f) => (f.pairKey === pairKey(ME, BOB) && f.status === "accepted" ? { id: LINK } : null));
  stub(t, Media, "updateMany", async (filter, update) => {
    pulls.push({ filter, update });
    return { modifiedCount: 1 };
  });

  const r = await fetch(`${base}/api/friends/${BOB}`, { method: "DELETE", headers: bearer() });
  assert.equal(r.status, 204);
  assert.deepEqual(pulls.map((p) => [p.filter.ownerId, String(p.update.$pull.sharedWith)]), [[ME, BOB], [BOB, ME]]);

  assert.equal((await fetch(`${base}/api/friends/${EVE}`, { method: "DELETE", headers: bearer() })).status, 404);
});

test("GET /api/friends : amis, invitations reçues et envoyées, sans email", async (t) => {
  stub(t, Friendship, "find", () =>
    query([
      { _id: oid(LINK), requesterId: oid(ME), recipientId: oid(BOB), status: "accepted", updatedAt: new Date() },
      { _id: oid(LINK), requesterId: oid(EVE), recipientId: oid(ME), status: "pending", createdAt: new Date() },
    ]),
  );
  stub(t, User, "find", () =>
    query([
      { _id: oid(BOB), name: "Bob", email: "bob@x.fr" },
      { _id: oid(EVE), name: "Eve", email: "eve@x.fr" },
    ]),
  );

  const body = await (await fetch(`${base}/api/friends`, { headers: bearer() })).json();
  assert.deepEqual(body.friends.map((f) => f.name), ["Bob"]);
  assert.deepEqual(body.incoming.map((i) => i.user.name), ["Eve"]);
  assert.deepEqual(body.outgoing, []);
  assert.equal(body.friends[0].email, undefined);
});

// ---------------------------------------------------------------------------
// Recherche de membres et profil
// ---------------------------------------------------------------------------

test("GET /api/users?q= : recherche par nom, sans soi-même, avec la relation", async (t) => {
  let filter;
  stub(t, User, "find", (f) => {
    filter = f;
    return query([{ _id: oid(BOB), name: "Bob" }, { _id: oid(EVE), name: "Eve" }]);
  });
  stub(t, Friendship, "find", () => query([{ _id: oid(LINK), pairKey: pairKey(ME, EVE), status: "pending", requesterId: oid(EVE) }]));

  const results = await (await fetch(`${base}/api/users?q=b(o`, { headers: bearer() })).json();
  assert.deepEqual(filter._id, { $ne: ME });
  assert.equal(filter.name.$regex, "b\\(o", "regex échappée");
  assert.deepEqual(results.map((u) => u.relation.status), ["none", "incoming"]);

  assert.deepEqual(await (await fetch(`${base}/api/users?q=b`, { headers: bearer() })).json(), []);
});

test("GET /api/users/:id : nombre d'amis, relation et amis en commun", async (t) => {
  stub(t, User, "findById", async () => new User({ _id: BOB, name: "Bob", email: "b@x.fr", passwordHash: "x" }));
  stub(t, Post, "countDocuments", async () => 0);
  stub(t, Vehicle, "find", async () => []);
  stub(t, friendships, "idsOf", async (id) => new Set(id === BOB ? [ME, EVE, "x1"] : [EVE, BOB]));
  stub(t, friendships, "between", async () => ({ id: LINK, status: "accepted", requesterId: oid(ME) }));
  let shownFilter;
  stub(t, User, "find", (f) => {
    shownFilter = f;
    return query([{ _id: oid(EVE), name: "Eve" }]);
  });

  const profile = await (await fetch(`${base}/api/users/${BOB}`, { headers: bearer() })).json();
  assert.equal(profile.friendCount, 3);
  assert.equal(profile.relation.status, "friend");
  assert.equal(profile.mutualFriendCount, 1);
  assert.deepEqual(shownFilter._id.$in, [EVE]);
  assert.deepEqual(profile.mutualFriends.map((f) => f.name), ["Eve"]);
});

// ---------------------------------------------------------------------------
// Partages et activité
// ---------------------------------------------------------------------------

test("partager un média : seulement avec un ami, et par son propriétaire", async (t) => {
  stub(t, friendships, "idsOf", async () => new Set([BOB]));
  let filter;
  let update;
  stub(t, Media, "findOneAndUpdate", (f, u) => {
    filter = f;
    update = u;
    return { populate: async () => ({ sharedWith: [{ _id: oid(BOB), name: "Bob" }] }) };
  });

  const notFriend = await fetch(`${base}/api/media/${MEDIA_ID}/shares/${EVE}`, { method: "PUT", headers: bearer() });
  assert.equal(notFriend.status, 400);

  const ok = await fetch(`${base}/api/media/${MEDIA_ID}/shares/${BOB}`, { method: "PUT", headers: bearer() });
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), [{ id: BOB, name: "Bob" }]);
  assert.deepEqual(filter, { _id: MEDIA_ID, ownerId: ME });
  assert.equal(String(update.$addToSet.sharedWith), BOB);
});

test("arrêter un partage : $pull, sans exiger d'amitié (ancien ami)", async (t) => {
  let update;
  stub(t, Media, "findOneAndUpdate", (_f, u) => {
    update = u;
    return { populate: async () => ({ sharedWith: [] }) };
  });
  const r = await fetch(`${base}/api/media/${MEDIA_ID}/shares/${EVE}`, { method: "DELETE", headers: bearer() });
  assert.equal(r.status, 200);
  assert.equal(String(update.$pull.sharedWith), EVE);
});

test("GET /api/media/shared-with-me : médias partagés avec le lecteur, avec URL de lecture", async (t) => {
  let match;
  stub(t, Media, "aggregatePaginate", async (aggregate, o) => {
    match = aggregate.pipeline()[0].$match;
    return { docs: [{ id: MEDIA_ID }], totalDocs: 1, limit: o.limit, page: o.page, totalPages: 1 };
  });
  const body = await (await fetch(`${base}/api/media/shared-with-me`, { headers: bearer() })).json();
  assert.equal(String(match.sharedWith), ME);
  assert.match(body.docs[0].url, new RegExp(`/api/media/${MEDIA_ID}/file\\?token=`));
});

test("GET /api/posts/feed?scope=friends : posts de l'escadrille uniquement", async (t) => {
  stub(t, friendships, "idsOf", async () => new Set([BOB, EVE]));
  let match;
  stub(t, Post, "aggregatePaginate", async (aggregate, o) => {
    match = aggregate.pipeline()[0].$match;
    return { docs: [], totalDocs: 0, limit: o.limit, page: o.page, totalPages: 1 };
  });
  await fetch(`${base}/api/posts/feed?scope=friends`, { headers: bearer() });
  assert.deepEqual(match.ownerId.$in.map(String).sort(), [BOB, EVE].sort());
  assert.ok(match.$or, "les droits restent appliqués");
});
