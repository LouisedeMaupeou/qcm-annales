import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calculerTendance,
  chapitresARetravailler,
  courbesParMatiere,
  parMatiere,
  regularite,
  type SessionJouee,
} from "./progression.ts";

const session = (
  epreuveId: string,
  score: number,
  jour: string,
  epreuveNom = epreuveId,
): SessionJouee => ({
  id: `${epreuveId}-${jour}`,
  concoursId: "c1",
  concoursNom: "ACCÈS",
  epreuveId,
  epreuveNom,
  scoreNormalise: score,
  points: score * 10,
  pointsMax: 10,
  nbQuestions: 10,
  nbCorrectes: Math.round(score * 10),
  termineeLe: `2026-07-${jour}T10:00:00Z`,
});

test("tendance : sous 3 sessions, on ne conclut pas", () => {
  assert.equal(calculerTendance([0.2, 0.9]).tendance, "insuffisant");
  assert.equal(calculerTendance([0.5]).tendance, "insuffisant");
});

test("tendance : progression détectée", () => {
  const { tendance, delta } = calculerTendance([0.2, 0.3, 0.7, 0.8]);
  assert.equal(tendance, "hausse");
  assert.ok(delta > 0);
});

test("tendance : régression détectée", () => {
  assert.equal(calculerTendance([0.9, 0.8, 0.3, 0.2]).tendance, "baisse");
});

test("tendance : petite variation reste stable", () => {
  assert.equal(calculerTendance([0.5, 0.52, 0.51, 0.53]).tendance, "stable");
});

test("par matière : agrège sessions, moyenne, dernier score", () => {
  const lignes = parMatiere([
    session("maths", 0.4, "01"),
    session("maths", 0.6, "02"),
    session("anglais", 0.9, "03"),
  ]);

  assert.equal(lignes.length, 2);
  const maths = lignes.find((l) => l.epreuveId === "maths")!;
  assert.equal(maths.nbSessions, 2);
  assert.equal(maths.scoreMoyen, 0.5);
  assert.equal(maths.dernierScore, 0.6); // la plus récente, pas la dernière reçue
});

test("par matière : le dernier score suit la date, pas l'ordre d'arrivée", () => {
  const lignes = parMatiere([
    session("maths", 0.9, "05"),
    session("maths", 0.1, "02"),
  ]);
  assert.equal(lignes[0].dernierScore, 0.9);
});

test("courbes : une série par matière, indexée par numéro de session", () => {
  const { points, series } = courbesParMatiere([
    session("maths", 0.4, "01", "Maths"),
    session("maths", 0.6, "02", "Maths"),
    session("anglais", 0.9, "03", "Anglais"),
  ]);

  assert.equal(series.length, 2);
  assert.equal(points.length, 2); // la matière la plus jouée fixe la longueur
  assert.equal(points[0].maths, 40);
  assert.equal(points[1].maths, 60);
});

test("courbes : une matière moins jouée reçoit null, pas 0", () => {
  const { points } = courbesParMatiere([
    session("maths", 0.4, "01"),
    session("maths", 0.6, "02"),
    session("anglais", 0.9, "03"),
  ]);
  // Sans cette règle, la courbe anglais plongerait à 0 au 2e point.
  assert.equal(points[1].anglais, null);
});

test("chapitres : classés par nombre d'erreurs puis par taux", () => {
  const chapitres = chapitresARetravailler([
    { chapitre: "Probabilités", statut: "incorrecte" },
    { chapitre: "Probabilités", statut: "incorrecte" },
    { chapitre: "Probabilités", statut: "correcte" },
    { chapitre: "Fonctions", statut: "incorrecte" },
    { chapitre: "Fonctions", statut: "correcte" },
    { chapitre: "Logique", statut: "correcte" },
  ]);

  assert.equal(chapitres[0].chapitre, "Probabilités");
  assert.equal(chapitres[0].rates, 2);
  // Un chapitre sans erreur n'est pas « à retravailler ».
  assert.equal(chapitres.some((c) => c.chapitre === "Logique"), false);
});

test("chapitres : une abstention compte comme non acquise", () => {
  const chapitres = chapitresARetravailler([
    { chapitre: "Suites", statut: "abstention" },
  ]);
  assert.equal(chapitres[0].rates, 1);
});

test("régularité : compte les semaines distinctes, pas les sessions", () => {
  const aujourdhui = new Date();
  const ilYA = (jours: number) => {
    const d = new Date(aujourdhui);
    d.setDate(d.getDate() - jours);
    return d.toISOString();
  };

  const s = (iso: string): SessionJouee => ({
    ...session("maths", 0.5, "01"),
    termineeLe: iso,
  });

  // Deux sessions le MÊME jour (donc sûrement la même semaine ISO) + une
  // troisième 20 jours avant (toujours une autre semaine, à 19 jours d'écart).
  // Formulation déterministe : l'ancienne version (il y a 1 et 2 jours) pouvait
  // enjamber une frontière de semaine selon le jour où tournait le test.
  const r = regularite([s(ilYA(1)), s(ilYA(1)), s(ilYA(20))], 8);
  assert.equal(r.sessionsRecentes, 3);
  // Les deux sessions du même jour ne comptent que pour une semaine.
  assert.equal(r.semainesJouees, 2);
});

test("aucune session : agrégats vides sans planter", () => {
  assert.deepEqual(parMatiere([]), []);
  assert.deepEqual(courbesParMatiere([]).points, []);
  assert.deepEqual(chapitresARetravailler([]), []);
});
