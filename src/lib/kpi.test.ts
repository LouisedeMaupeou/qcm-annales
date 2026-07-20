import assert from "node:assert/strict";
import { test } from "node:test";
import {
  compteursTransverses,
  couvertureParConcours,
  deltaProgression,
  scoresMoyens,
  usageParEleve,
  versCsv,
  type SessionKpi,
} from "./kpi.ts";

const s = (
  userId: string,
  score: number,
  jour: string,
  epreuveId = "e1",
): SessionKpi => ({
  userId,
  concoursId: "c1",
  concoursNom: "ACCÈS",
  epreuveId,
  epreuveNom: epreuveId === "e1" ? "Maths" : "Anglais",
  scoreNormalise: score,
  termineeLe: `2026-07-${jour}T10:00:00Z`,
});

test("usage : classement par nombre de sessions", () => {
  const u = usageParEleve([
    s("a", 0.5, "01"),
    s("b", 0.5, "01"),
    s("b", 0.6, "02"),
    s("b", 0.7, "03"),
  ]);
  assert.equal(u[0].userId, "b");
  assert.equal(u[0].nbSessions, 3);
});

test("progression : pas de delta sous 4 sessions", () => {
  assert.equal(deltaProgression([0.1, 0.9]), null);
  assert.equal(deltaProgression([0.1, 0.5, 0.9]), null);
  assert.notEqual(deltaProgression([0.1, 0.2, 0.8, 0.9]), null);
});

test("progression : delta positif quand l'élève monte", () => {
  const d = deltaProgression([0.2, 0.2, 0.8, 0.8])!;
  assert.ok(Math.abs(d - 0.6) < 1e-9);
});

test("progression : delta négatif quand l'élève baisse", () => {
  assert.ok(deltaProgression([0.9, 0.9, 0.3, 0.3])! < 0);
});

test("couverture : taux de questions vues au moins une fois (§6.3)", () => {
  const questions = [
    { questionId: "q1", concoursId: "c1", concoursNom: "ACCÈS" },
    { questionId: "q2", concoursId: "c1", concoursNom: "ACCÈS" },
    { questionId: "q3", concoursId: "c1", concoursNom: "ACCÈS" },
    { questionId: "q4", concoursId: "c2", concoursNom: "SÉSAME" },
  ];
  const c = couvertureParConcours(questions, new Set(["q1", "q2"]));

  const acces = c.find((x) => x.concoursId === "c1")!;
  assert.equal(acces.publiees, 3);
  assert.equal(acces.vues, 2);
  assert.ok(Math.abs(acces.taux - 2 / 3) < 1e-9);

  // Un concours sans aucune question vue affiche 0, pas une division par zéro.
  assert.equal(c.find((x) => x.concoursId === "c2")!.taux, 0);
});

test("couverture : aucune question publiée ne divise pas par zéro", () => {
  assert.deepEqual(couvertureParConcours([], new Set()), []);
});

test("scores moyens : agrégés par concours et par épreuve", () => {
  const { parConcours, parEpreuve } = scoresMoyens([
    s("a", 0.4, "01", "e1"),
    s("a", 0.6, "02", "e1"),
    s("a", 0.8, "03", "e2"),
  ]);

  assert.equal(parConcours.length, 1);
  assert.ok(Math.abs(parConcours[0].scoreMoyen - 0.6) < 1e-9);

  assert.equal(parEpreuve.length, 2);
  const maths = parEpreuve.find((x) => x.epreuveNom === "Maths")!;
  assert.equal(maths.nbSessions, 2);
  assert.ok(Math.abs(maths.scoreMoyen - 0.5) < 1e-9);
});

test("compteurs : sessions 7j et 30j selon la date de référence", () => {
  const ref = new Date("2026-07-20T12:00:00Z");
  const c = compteursTransverses(
    [s("a", 0.5, "19"), s("a", 0.5, "10"), s("a", 0.5, "01")],
    [{ id: "a", consentMarketing: true }],
    ref,
  );
  assert.equal(c.sessions7j, 1);
  assert.equal(c.sessions30j, 3);
});

test("compteurs : taux inscription → première session", () => {
  const ref = new Date("2026-07-20T12:00:00Z");
  const c = compteursTransverses(
    [s("a", 0.5, "19")],
    [
      { id: "a", consentMarketing: true },
      { id: "b", consentMarketing: false },
      { id: "c", consentMarketing: false },
    ],
    ref,
  );
  assert.equal(c.inscrits, 3);
  assert.equal(c.ayantJoue, 1);
  assert.ok(Math.abs(c.tauxPremiereSession - 1 / 3) < 1e-9);
  assert.ok(Math.abs(c.tauxConsentement - 1 / 3) < 1e-9);
});

test("compteurs : sans inscrit, les taux valent 0 sans planter", () => {
  const c = compteursTransverses([], []);
  assert.equal(c.tauxPremiereSession, 0);
  assert.equal(c.tauxConsentement, 0);
});

test("compteurs : une session orpheline ne gonfle pas le taux", () => {
  // Sessions d'un compte supprimé : elles ne doivent pas compter comme
  // « inscrit ayant joué ».
  const c = compteursTransverses(
    [s("supprime", 0.5, "19")],
    [{ id: "a", consentMarketing: false }],
    new Date("2026-07-20T12:00:00Z"),
  );
  assert.equal(c.ayantJoue, 0);
});

test("csv : séparateur point-virgule et BOM pour Excel", () => {
  const csv = versCsv(["Nom", "Score"], [["Élève", 0.5]]);
  assert.ok(csv.startsWith("﻿"), "le BOM manque, Excel casserait les accents");
  assert.ok(csv.includes("Nom;Score"));
});

test("csv : décimales à la virgule", () => {
  assert.ok(versCsv(["a"], [[0.75]]).includes("0,75"));
});

test("csv : échappe les guillemets et les séparateurs", () => {
  const csv = versCsv(["a"], [['Il a dit "oui"; puis non']]);
  assert.ok(csv.includes('"Il a dit ""oui""; puis non"'));
});

test("csv : valeur nulle rendue vide", () => {
  assert.ok(versCsv(["a", "b"], [[null, "x"]]).includes(";x"));
});
