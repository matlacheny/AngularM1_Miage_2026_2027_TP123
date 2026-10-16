import test from "node:test";
import assert from "node:assert/strict";
import { isRealVideo, keyTokens, mentions, toImage } from "../scripts/more-media.js";

/* Filtres de scripts/more-media.js (photos des articles, vidéos YouTube). */

test("mots-clés : constructeurs et mots génériques retirés", () => {
  assert.deepEqual(keyTokens("General Dynamics F-16 Fighting Falcon"), ["f-16", "falcon"]);
  assert.deepEqual(keyTokens("Leopard 2"), ["leopard"]);
  assert.deepEqual(keyTokens("Mil Mi-24"), ["mi-24"]);
});

test("titre : le véhicule est reconnu sans tirets ni accents", () => {
  assert.ok(mentions("F16 demo at RIAT", keyTokens("General Dynamics F-16 Fighting Falcon")));
  assert.ok(!mentions("General Dynamics annual report", keyTokens("General Dynamics F-16 Fighting Falcon")));
});

test("vidéos YouTube : jeux, maquettes, mèmes et durées extrêmes écartés", () => {
  const tokens = keyTokens("Leopard 2");
  const video = (title, duration = 120) => ({ title, duration });
  assert.ok(isRealVideo(video("Leopard 2A7 live firing"), tokens));
  assert.ok(!isRealVideo(video("War Thunder Leopard 2 gameplay"), tokens));
  assert.ok(!isRealVideo(video("Leopard 2 1/35 model kit build"), tokens));
  assert.ok(!isRealVideo(video("Panzermensch but you're a Leopard II Commander"), tokens));
  assert.ok(!isRealVideo(video("Leopard 2 full documentary", 7200), tokens));
  assert.ok(!isRealVideo(video("T-72 firing"), tokens));
});

test("photos : cartes, drapeaux, logos et petites images écartés", () => {
  const file = (title, width = 1200) => ({ title, mediatype: "BITMAP", width, height: 800, thumburl: `https://upload.example/${title}` });
  assert.equal(toImage(file("File:Leopard 2A6.jpg")).mime, "image/jpeg");
  assert.equal(toImage(file("File:Leopard 2 operators map.png")), null);
  assert.equal(toImage(file("File:Flag of Germany.png")), null);
  assert.equal(toImage(file("File:Leopard 2A6.jpg", 200)), null);
  assert.equal(toImage({ ...file("File:Leopard.svg"), mediatype: "DRAWING" }), null);
});
