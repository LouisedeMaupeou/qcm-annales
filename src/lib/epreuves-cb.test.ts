import { test } from "node:test";
import assert from "node:assert/strict";
import {
  baremeOfficiel,
  decoderEpreuveId,
  dureeOfficielle,
} from "./epreuves-cb.ts";

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

test("durée officielle : connue pour une épreuve du tableau §3", () => {
  assert.equal(dureeOfficielle("SÉSAME", "Analyse documentaire"), 120);
  assert.equal(dureeOfficielle("Avenir", "Mathématiques"), 90);
});

test("durée officielle : null plutôt qu'une valeur inventée", () => {
  assert.equal(dureeOfficielle("Avenir", "Philosophie"), null);
  assert.equal(dureeOfficielle("Inconnu", "Mathématiques"), null);
});

test("barème Avenir : +3 / −1 / 0, relevé sur le sujet", () => {
  const b = baremeOfficiel("Avenir", "Mathématiques");
  assert.equal(b?.pointsBonne, 3);
  assert.equal(b?.pointsMauvaise, -1);
  assert.equal(b?.pointsAbstention, 0);
});

test("barème GEIPI : plancher par exercice, que le triplet ne sait pas dire", () => {
  const b = baremeOfficiel("GEIPI Polytech", "Mathématiques");
  assert.equal(b?.regles.plancher_par_bloc, true);
});

test("barème Puissance Alpha : bonification et exercices au choix", () => {
  const b = baremeOfficiel("Puissance Alpha", "Mathématiques");
  assert.equal(b?.regles.bonification_bloc_complet, 1);
  assert.deepEqual(b?.regles.blocs_au_choix, { obligatoires: 4, a_choisir: 4 });
});

test("analyse documentaire SÉSAME : tout ou rien, contrairement aux autres SÉSAME", () => {
  assert.equal(
    baremeOfficiel("SÉSAME", "Analyse documentaire")?.regles.tout_ou_rien_par_question,
    true,
  );
  assert.equal(
    baremeOfficiel("SÉSAME", "Français")?.regles.tout_ou_rien_par_question,
    undefined,
  );
});

test("barème : null pour un concours hors référentiel", () => {
  assert.equal(baremeOfficiel("Inconnu", "Mathématiques"), null);
});

test("filière non précisée : Puissance Alpha vise l'épreuve générale", () => {
  assert.equal(decoderEpreuveId("PA-MAT-TOUS26")?.matiere, "Mathématiques (générale)");
  assert.equal(decoderEpreuveId("PA-NSI-2022")?.matiere, "NSI (générale)");
});

test("les autres concours gardent le nom générique", () => {
  assert.equal(decoderEpreuveId("AV-MAT-TOUS26")?.matiere, "Mathématiques");
  // Advance n'a pas d'épreuve « générale » : son concours blanc l'est.
  assert.equal(decoderEpreuveId("ADV-MAT-OCT26")?.matiere, "Mathématiques");
});

test("durée officielle : connue sous le nom de filière retenu", () => {
  assert.equal(dureeOfficielle("Puissance Alpha", "Mathématiques (générale)"), 90);
});
