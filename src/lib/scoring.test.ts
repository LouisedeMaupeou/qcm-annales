import assert from "node:assert/strict";
import { test } from "node:test";
import {
  coutEvite,
  evaluer,
  pointsDe,
  totaliser,
  type Bareme,
  type Proposition,
} from "./scoring.ts";

// Barème ACCÈS-like : points négatifs, abstention neutre.
const AVEC_NEGATIF: Bareme = {
  pointsBonne: 1,
  pointsMauvaise: -1,
  pointsAbstention: 0,
};
// Barème SÉSAME-like : pas de points négatifs.
const SANS_NEGATIF: Bareme = {
  pointsBonne: 1,
  pointsMauvaise: 0,
  pointsAbstention: 0,
};

const QUATRE: Proposition[] = [
  { id: "a", estCorrecte: true },
  { id: "b", estCorrecte: false },
  { id: "c", estCorrecte: false },
  { id: "d", estCorrecte: true },
];

test("vrai/faux : 4 jugements exacts sur 4 = correcte", () => {
  const r = evaluer(
    { type: "vrai_faux", jugements: { a: true, b: false, c: false, d: true } },
    QUATRE,
  );
  assert.equal(r, "correcte");
});

test("vrai/faux : 3 exacts sur 4 = incorrecte, pas de demi-point (§2.3)", () => {
  const r = evaluer(
    { type: "vrai_faux", jugements: { a: true, b: false, c: true, d: true } },
    QUATRE,
  );
  assert.equal(r, "incorrecte");
});

test("vrai/faux : entièrement vide = abstention", () => {
  assert.equal(evaluer({ type: "vrai_faux", jugements: {} }, QUATRE), "abstention");
});

test("vrai/faux : partiellement remplie = incorrecte, pas abstention (§2.3)", () => {
  const r = evaluer({ type: "vrai_faux", jugements: { a: true, b: false } }, QUATRE);
  assert.equal(r, "incorrecte");
});

test("vrai/faux : tout faux reste incorrecte", () => {
  const r = evaluer(
    { type: "vrai_faux", jugements: { a: false, b: true, c: true, d: false } },
    QUATRE,
  );
  assert.equal(r, "incorrecte");
});

test("choix unique : bonne réponse", () => {
  assert.equal(
    evaluer({ type: "choix_unique", reponseId: "a" }, QUATRE),
    "correcte",
  );
});

test("choix unique : mauvaise réponse", () => {
  assert.equal(
    evaluer({ type: "choix_unique", reponseId: "b" }, QUATRE),
    "incorrecte",
  );
});

test("choix unique : identifiant inconnu n'est jamais correct", () => {
  assert.equal(
    evaluer({ type: "choix_unique", reponseId: "forge" }, QUATRE),
    "incorrecte",
  );
});

test("abstention explicite", () => {
  assert.equal(evaluer({ type: "abstention" }, QUATRE), "abstention");
});

test("points : le barème négatif s'applique (§2.4)", () => {
  assert.equal(pointsDe("correcte", AVEC_NEGATIF), 1);
  assert.equal(pointsDe("incorrecte", AVEC_NEGATIF), -1);
  assert.equal(pointsDe("abstention", AVEC_NEGATIF), 0);
});

test("coût évité : nul quand l'erreur ne coûte rien (§2.5)", () => {
  assert.equal(coutEvite(SANS_NEGATIF), 0);
  assert.equal(coutEvite(AVEC_NEGATIF), 1);
  assert.equal(
    coutEvite({ pointsBonne: 2, pointsMauvaise: -0.5, pointsAbstention: 0 }),
    0.5,
  );
});

test("totaux : points bruts et taux de bonnes réponses", () => {
  const t = totaliser(
    ["correcte", "correcte", "incorrecte", "abstention"],
    AVEC_NEGATIF,
  );
  assert.equal(t.points, 1); // 1 + 1 - 1 + 0
  assert.equal(t.pointsMax, 4);
  assert.equal(t.nbCorrectes, 2);
  assert.equal(t.nbAbstentions, 1);
  assert.equal(t.tauxBonnesReponses, 0.5);
});

test("score normalisé : plancher à 0 malgré un total négatif (§2.4)", () => {
  const t = totaliser(["incorrecte", "incorrecte", "abstention"], AVEC_NEGATIF);
  assert.equal(t.points, -2);
  assert.equal(t.scoreNormalise, 0);
});

test("score normalisé : comparable entre barèmes différents", () => {
  const acces = totaliser(["correcte", "correcte", "incorrecte", "abstention"], AVEC_NEGATIF);
  const advance = totaliser(["correcte", "correcte", "incorrecte", "abstention"], {
    pointsBonne: 2,
    pointsMauvaise: -0.5,
    pointsAbstention: 0,
  });
  // Mêmes réponses, barèmes différents : les points bruts divergent, le score
  // normalisé reste une fraction du maximum atteignable.
  assert.equal(acces.points, 1);
  assert.equal(advance.points, 3.5);
  assert.equal(acces.scoreNormalise, 0.25);
  assert.equal(advance.scoreNormalise, 0.4375);
});

test("totaux : session vide ne divise pas par zéro", () => {
  const t = totaliser([], AVEC_NEGATIF);
  assert.equal(t.scoreNormalise, 0);
  assert.equal(t.tauxBonnesReponses, 0);
});
