import test from "node:test";
import assert from "node:assert/strict";
import { creditOf, isSpottingVideo } from "../scripts/video-sounds.js";

/* Choix des vidéos dont scripts/video-sounds.js extrait la bande son. */

test("bande son : passages, démonstrations et tirs retenus", () => {
  assert.ok(isSpottingVideo("MiG 29 Fulcrum Full Display RIAT 2015"));
  assert.ok(isSpottingVideo("Awesome Hawker Hurricane Low Flypast"));
  assert.ok(isSpottingVideo("British Army Challenger 2 Tanks During Live Fire"));
  assert.ok(isSpottingVideo("Su-57 Crazy flying demonstration at ZhuHai Airshow 2024"));
});

test("bande son : documentaires, visites et interviews écartés (voix off, musique)", () => {
  assert.ok(!isSpottingVideo("Inside the Chieftain's Hatch: M26 Pershing Part 1"));
  assert.ok(!isSpottingVideo("Tank Chats #110 | T-72 | The Tank Museum"));
  assert.ok(!isSpottingVideo("Red Arrows Hawk Jet Tour"));
  assert.ok(!isSpottingVideo("F-15 Eagle | Documentary"));
  assert.ok(!isSpottingVideo("Why The US Army Has Spent $21.6 Billion On Stryker Combat Vehicles"));
  assert.ok(!isSpottingVideo("Russia's Best Fighter Jet Ever Made - The Mig 21"), "ni passage ni démonstration");
  assert.ok(!isSpottingVideo("Morane-Saulnier MS-406 low passes at Villacoublay (1937-38)"), "film d'archive");
});

test("bande son : la ligne de crédit de la vidéo est reprise", () => {
  assert.equal(creditOf("Vidéo : Tornado en action.\nSource : YouTube — chaîne (tous droits réservés) https://y"), "Source : YouTube — chaîne (tous droits réservés) https://y");
  assert.equal(creditOf("Sans crédit"), "");
  assert.equal(creditOf(undefined), "");
});
