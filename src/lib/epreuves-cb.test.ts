import { test } from "node:test";
import assert from "node:assert/strict";
import { decoderEpreuveId } from "./epreuves-cb.ts";

test("décode un identifiant avec session", () => {
  assert.deepEqual(decoderEpreuveId("AV-MAT-TOUS26"), {
    concours: "Avenir",
    matiere: "Mathématiques",
    session: "TOUS26",
  });
});

test("décode un identifiant sans session", () => {
  assert.deepEqual(decoderEpreuveId("SES-ADOC"), {
    concours: "SÉSAME",
    matiere: "Analyse documentaire",
    session: null,
  });
});

test("une nouvelle session se décode sans toucher au code", () => {
  const decodee = decoderEpreuveId("AV-MAT-NOEL27");
  assert.equal(decodee?.concours, "Avenir");
  assert.equal(decodee?.session, "NOEL27");
});

test("refuse un concours inconnu plutôt que de deviner", () => {
  assert.equal(decoderEpreuveId("XX-MAT-TOUS26"), null);
});

test("refuse une matière inconnue", () => {
  assert.equal(decoderEpreuveId("AV-ZZZ-TOUS26"), null);
});

test("refuse un identifiant sans matière", () => {
  assert.equal(decoderEpreuveId("AV"), null);
});

test("la casse et les espaces n'empêchent pas la lecture", () => {
  assert.equal(decoderEpreuveId("  ses-fr-s2  ")?.matiere, "Français");
});
