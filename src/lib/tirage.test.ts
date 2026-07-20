import assert from "node:assert/strict";
import { test } from "node:test";
import { tirerSession, type BlocTirable } from "./tirage.ts";

const bloc = (id: string, taille: number, vues = 0): BlocTirable => ({
  id,
  taille,
  vues,
});

/** Générateur déterministe, pour que les tests ne dépendent pas du hasard. */
const fixe = (valeurs: number[]) => {
  let i = 0;
  return () => valeurs[i++ % valeurs.length];
};

test("ne dépasse jamais la taille cible", () => {
  const candidats = Array.from({ length: 30 }, (_, i) => bloc(`b${i}`, 1));
  const r = tirerSession(candidats, 10, fixe([0.5]));
  assert.equal(r.nbQuestions, 10);
  assert.equal(r.blocs.length, 10);
});

test("ne coupe jamais un bloc lié", () => {
  // Un bloc de 5 et des blocs de 1 : le total doit rester composé de blocs entiers.
  const candidats = [bloc("chaine", 5), ...Array.from({ length: 20 }, (_, i) => bloc(`s${i}`, 1))];
  const r = tirerSession(candidats, 10, fixe([0.5]));
  const tailles = r.blocs.map((b) => b.taille);
  assert.equal(
    tailles.reduce((s, t) => s + t, 0),
    r.nbQuestions,
  );
  assert.ok(r.nbQuestions <= 10);
  // Si le bloc chaîné est retenu, il l'est en entier.
  const chaine = r.blocs.find((b) => b.id === "chaine");
  if (chaine) assert.equal(chaine.taille, 5);
});

test("écarte un bloc trop gros pour la place restante plutôt que de le tronquer", () => {
  const candidats = [bloc("gros", 8), bloc("a", 1), bloc("b", 1)];
  const r = tirerSession(candidats, 3, fixe([0.5]));
  assert.equal(r.blocs.some((b) => b.id === "gros"), false);
  assert.equal(r.nbQuestions, 2);
});

test("signale une session réduite quand le stock est insuffisant (§5.3.3)", () => {
  const r = tirerSession([bloc("a", 1), bloc("b", 1)], 10, fixe([0.5]));
  assert.equal(r.nbQuestions, 2);
  assert.equal(r.reduite, true);
});

test("ne signale pas « réduite » quand le stock suffit mais que les tailles ne tombent pas juste", () => {
  // 12 questions disponibles pour une cible de 10, mais en blocs de 4 :
  // on sert 8 sans prévenir l'élève d'un problème de stock.
  const candidats = [bloc("a", 4), bloc("b", 4), bloc("c", 4)];
  const r = tirerSession(candidats, 10, fixe([0.5]));
  assert.equal(r.nbQuestions, 8);
  assert.equal(r.reduite, false);
});

test("priorise les blocs jamais vus", () => {
  const candidats = [
    bloc("vu-souvent", 1, 20),
    bloc("vu-souvent-2", 1, 20),
    bloc("neuf", 1, 0),
  ];
  const r = tirerSession(candidats, 1, fixe([0.5]));
  assert.equal(r.blocs[0].id, "neuf");
});

test("un bloc déjà vu reste tirable quand il n'y a que lui", () => {
  const r = tirerSession([bloc("seul", 1, 99)], 10, fixe([0.5]));
  assert.equal(r.blocs.length, 1);
  assert.equal(r.reduite, true);
});

test("pool vide : session vide, sans planter", () => {
  const r = tirerSession([], 10, fixe([0.5]));
  assert.deepEqual(r.blocs, []);
  assert.equal(r.nbQuestions, 0);
  assert.equal(r.reduite, true);
});

test("deux tirages successifs ne donnent pas le même ordre", () => {
  const candidats = Array.from({ length: 12 }, (_, i) => bloc(`b${i}`, 1));
  const a = tirerSession(candidats, 5, fixe([0.1, 0.9, 0.3, 0.7, 0.5]));
  const b = tirerSession(candidats, 5, fixe([0.9, 0.1, 0.7, 0.3, 0.5]));
  assert.notDeepEqual(
    a.blocs.map((x) => x.id),
    b.blocs.map((x) => x.id),
  );
});
