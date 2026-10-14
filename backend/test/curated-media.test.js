import test from "node:test";
import assert from "node:assert/strict";
import { FREESOUND_SOUNDS, IMAGES, NEW_VEHICLES, RETAGGED_MEDIA, SOUNDS, VIDEO_SOUNDS, WRONG_MEDIA } from "../scripts/curated-media.js";
import { freesoundFiles, licenseName } from "../scripts/freesound.js";
import { MEDIA_TYPES } from "../src/models/Media.js";

/* Cohérence des médias de démonstration vérifiés à la main (scripts/curated-media.js). */

const curated = [...IMAGES, ...SOUNDS];
const name = (file) => file.replace(/^File:/, "");

test("médias vérifiés : titres Commons complets, sans doublon", () => {
  for (const { file, vehicle } of curated) {
    assert.match(file, /^File:.+\.[a-z0-9]+$/i, file);
    assert.ok(vehicle, `fiche manquante pour ${file}`);
  }
  assert.equal(new Set(curated.map((m) => m.file)).size, curated.length);
});

test("médias vérifiés : aucun n'est dans la liste des médias erronés", () => {
  const wrong = new Set(WRONG_MEDIA);
  for (const { file } of curated) assert.ok(!wrong.has(name(file)), file);
  for (const { file } of RETAGGED_MEDIA) assert.ok(!wrong.has(file), file);
});

test("sons : formats audio acceptés par l'application et titre lisible", () => {
  const audioExtensions = { ogg: "audio/ogg", mp3: "audio/mpeg", wav: "audio/wav" };
  for (const { file, title } of SOUNDS) {
    const mime = audioExtensions[file.split(".").pop().toLowerCase()];
    assert.equal(MEDIA_TYPES.get(mime), "audio", file);
    assert.ok(title && title.length <= 120, file);
  }
});

test("fiches à créer : chaque média qui y est rattaché vise une fiche connue", () => {
  const created = new Set(NEW_VEHICLES.map((v) => v.name));
  assert.ok(SOUNDS.some((s) => created.has(s.vehicle)), "les sons du Centurion visent la fiche créée");
  assert.ok(RETAGGED_MEDIA.every((m) => created.has(m.vehicle)));
});

test("Freesound : identifiants uniques, fiche et titre lisible pour chaque son", () => {
  assert.equal(new Set(FREESOUND_SOUNDS.map((s) => s.id)).size, FREESOUND_SOUNDS.length);
  for (const { id, vehicle, title } of FREESOUND_SOUNDS) {
    assert.ok(Number.isInteger(id) && id > 0, String(id));
    assert.ok(vehicle && title && title.length <= 120, String(id));
  }
});

test("Freesound : seules CC0 et CC BY sont acceptées", () => {
  assert.equal(licenseName("http://creativecommons.org/publicdomain/zero/1.0/"), "CC0 1.0");
  assert.equal(licenseName("https://creativecommons.org/licenses/by/4.0/"), "CC BY 4.0");
  assert.equal(licenseName("http://creativecommons.org/licenses/by/3.0/"), "CC BY 3.0");
  assert.equal(licenseName("http://creativecommons.org/licenses/by-nc/4.0/"), null);
  assert.equal(licenseName("http://creativecommons.org/licenses/sampling+/1.0/"), null);
});

test("Freesound : sans clé, aucun appel et aucune entrée", async (t) => {
  const original = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => ((called = true), new Response("{}"));
  t.after(() => (globalThis.fetch = original));
  assert.deepEqual(await freesoundFiles(FREESOUND_SOUNDS.slice(0, 1), ""), []);
  assert.equal(called, false);
});

test("Freesound : aperçu OGG, crédit et nom d'origine stable ; licence NC écartée", async (t) => {
  const original = globalThis.fetch;
  const replies = {
    1: { id: 1, name: "a", username: "alice", license: "http://creativecommons.org/licenses/by/4.0/", url: "https://freesound.org/s/1/", previews: { "preview-hq-ogg": "https://cdn.freesound.org/1.ogg" } },
    2: { id: 2, name: "b", username: "bob", license: "http://creativecommons.org/licenses/by-nc/4.0/", url: "https://freesound.org/s/2/", previews: {} },
  };
  globalThis.fetch = async (url) => {
    assert.match(String(url), /token=cle/);
    return new Response(JSON.stringify(replies[new URL(url).pathname.split("/").at(-2)]));
  };
  t.after(() => (globalThis.fetch = original));

  const files = await freesoundFiles([{ id: 1, vehicle: "Dassault Rafale", title: "Rafale" }, { id: 2, vehicle: "X", title: "Y" }], "cle");
  assert.equal(files.length, 1);
  assert.deepEqual(
    { originalName: files[0].originalName, title: files[0].title, artist: files[0].artist, license: files[0].license, src: files[0].src, mime: files[0].mime },
    { originalName: "freesound-1.ogg", title: "Rafale", artist: "alice", license: "CC BY 4.0", src: "https://cdn.freesound.org/1.ogg", mime: "audio/ogg" },
  );
});

test("bandes son de vidéos : volume moyen lu dans la sortie de ffmpeg", async () => {
  const { meanVolume } = await import("../scripts/video-audio.js");
  assert.equal(meanVolume("[Parsed_volumedetect_0 @ 0x1] mean_volume: -23.4 dB\n[...] max_volume: -1.2 dB"), -23.4);
  assert.equal(meanVolume("mean_volume: -inf dB"), -Infinity);
  assert.equal(meanVolume("aucune mesure"), null);
});

test("bandes son de vidéos : fichiers vidéo Commons, sans doublon avec les autres sons", () => {
  for (const { file, vehicle, title } of VIDEO_SOUNDS) {
    assert.match(file, /^File:.+\.(webm|ogv)$/i, file);
    assert.ok(vehicle && title, file);
  }
  assert.equal(new Set(VIDEO_SOUNDS.map((s) => s.file)).size, VIDEO_SOUNDS.length);
});
