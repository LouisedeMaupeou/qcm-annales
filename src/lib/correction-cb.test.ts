import assert from "node:assert/strict";
import test from "node:test";
import {
  corriger,
  evaluer,
  type Bareme,
  type QuestionACorriger,
  type ReponseCopie,
} from "./correction-cb.ts";

/**
 * Les barèmes réels relevés sur les sujets (§10). Les cas de ce fichier sont
 * tirés des quatre concours, pas inventés : c'est la note des élèves.
 */
const AVENIR: Bareme = {
  pointsBonne: 3,
  pointsMauvaise: -1,
  pointsAbstention: 0,
  noteSur: 20,
  regles: {},
};
const GEIPI: Bareme = {
  pointsBonne: 1,
  pointsMauvaise: -1,
  pointsAbstention: 0,
  noteSur: 20,
  regles: { plancher_par_bloc: true },
};
const PUISSANCE_ALPHA: Bareme = {
  pointsBonne: 1,
  pointsMauvaise: -0.5,
  pointsAbstention: 0,
  noteSur: 20,
  regles: { bonification_bloc_complet: 1 },
};
const ADOC: Bareme = {
  pointsBonne: 1,
  pointsMauvaise: 0,
  pointsAbstention: 0,
  noteSur: 20,
  regles: { tout_ou_rien_par_question: true },
};

let compteur = 0;
function question(
  attrs: Partial<QuestionACorriger> & { bonne?: string } = {},
): QuestionACorriger {
  compteur += 1;
  const id = attrs.id ?? `q${compteur}`;
  return {
    id,
    type: attrs.type ?? "choix_unique",
    ordre: attrs.ordre ?? compteur,
    blocId: attrs.blocId ?? `bloc-${id}`,
    poids: attrs.poids ?? 1,
    autoCorrection: attrs.autoCorrection ?? true,
    propositions: attrs.propositions ?? [
      { id: `${id}-a`, estCorrecte: (attrs.bonne ?? "a") === "a" },
      { id: `${id}-b`, estCorrecte: (attrs.bonne ?? "a") === "b" },
    ],
  };
}

const copie = (paires: [string, ReponseCopie][]) => new Map(paires);

// ---------------------------------------------------------------------------
// Jugement d'une réponse
// ---------------------------------------------------------------------------

test("choix unique : la bonne proposition est correcte", () => {
  const q = question({ id: "u1", bonne: "a" });
  assert.equal(evaluer(q, { reponseId: "u1-a" }), "correcte");
  assert.equal(evaluer(q, { reponseId: "u1-b" }), "incorrecte");
});

test("ne rien cocher vaut abstention, comme le bouton « Je ne réponds pas »", () => {
  const q = question({ id: "u2" });
  assert.equal(evaluer(q, null), "abstention");
  assert.equal(evaluer(q, {}), "abstention");
  assert.equal(evaluer(q, { abstention: true }), "abstention");
});

test("un identifiant forgé ne rapporte rien", () => {
  const q = question({ id: "u3", bonne: "a" });
  assert.equal(evaluer(q, { reponseId: "inexistant" }), "incorrecte");
});

test("choix multiple : l'ensemble doit correspondre exactement", () => {
  const q: QuestionACorriger = {
    ...question({ id: "m1", type: "choix_multiple" }),
    propositions: [
      { id: "m1-a", estCorrecte: true },
      { id: "m1-b", estCorrecte: false },
      { id: "m1-c", estCorrecte: true },
    ],
  };
  assert.equal(evaluer(q, { reponseIds: ["m1-a", "m1-c"] }), "correcte");
  // Une seule mauvaise coche annule, règle officielle du concours.
  assert.equal(evaluer(q, { reponseIds: ["m1-a", "m1-b", "m1-c"] }), "incorrecte");
  // Une bonne réponse oubliée ne suffit pas non plus.
  assert.equal(evaluer(q, { reponseIds: ["m1-a"] }), "incorrecte");
});

test("une rédaction part toujours en correction manuelle", () => {
  const q = question({ id: "r1", type: "redaction" });
  assert.equal(evaluer(q, { texte: "une démonstration" }), "a_corriger");
});

test("auto_correction = NON force la correction manuelle, quel que soit le type", () => {
  const q = question({ id: "r2", autoCorrection: false });
  assert.equal(evaluer(q, { reponseId: "r2-a" }), "a_corriger");
});

// ---------------------------------------------------------------------------
// Barème Avenir : +3 / −1 / 0
// ---------------------------------------------------------------------------

test("Avenir : deux justes, une fausse, une abstention → 5 points", () => {
  const qs = [
    question({ id: "a1", bonne: "a" }),
    question({ id: "a2", bonne: "a" }),
    question({ id: "a3", bonne: "a" }),
    question({ id: "a4", bonne: "a" }),
  ];
  const r = corriger(
    qs,
    copie([
      ["a1", { reponseId: "a1-a" }],
      ["a2", { reponseId: "a2-a" }],
      ["a3", { reponseId: "a3-b" }],
      ["a4", null],
    ]),
    AVENIR,
  );
  assert.equal(r.points, 5); // 3 + 3 − 1 + 0
  assert.equal(r.pointsMax, 12);
  assert.equal(r.nbBonnes, 2);
  assert.equal(r.nbFausses, 1);
  assert.equal(r.nbAbstentions, 1);
});

test("une note ne descend jamais sous zéro, même avec un total négatif", () => {
  const qs = [question({ id: "n1", bonne: "a" }), question({ id: "n2", bonne: "a" })];
  const r = corriger(
    qs,
    copie([
      ["n1", { reponseId: "n1-b" }],
      ["n2", { reponseId: "n2-b" }],
    ]),
    AVENIR,
  );
  assert.equal(r.points, -2);
  assert.equal(r.noteSur20, 0);
});

// ---------------------------------------------------------------------------
// GEIPI : plancher par exercice
// ---------------------------------------------------------------------------

test("GEIPI : un exercice entièrement faux vaut 0, pas −3", () => {
  const qs = ["g1", "g2", "g3"].map((id) =>
    question({ id, blocId: "exercice-I", bonne: "a" }),
  );
  const r = corriger(
    qs,
    copie(qs.map((q) => [q.id, { reponseId: `${q.id}-b` }] as [string, ReponseCopie])),
    GEIPI,
  );
  assert.equal(r.points, 0);
});

test("GEIPI : le plancher s'applique par exercice, pas sur la copie entière", () => {
  const faux = ["g4", "g5"].map((id) => question({ id, blocId: "ex-I", bonne: "a" }));
  const juste = question({ id: "g6", blocId: "ex-II", bonne: "a" });
  const r = corriger(
    [...faux, juste],
    copie([
      ["g4", { reponseId: "g4-b" }],
      ["g5", { reponseId: "g5-b" }],
      ["g6", { reponseId: "g6-a" }],
    ]),
    GEIPI,
  );
  // Exercice I ramené à 0, exercice II conserve son point.
  assert.equal(r.points, 1);
});

// ---------------------------------------------------------------------------
// Puissance Alpha : bonification par exercice complet
// ---------------------------------------------------------------------------

test("Puissance Alpha : un exercice tout juste rapporte un point de plus", () => {
  const qs = ["p1", "p2", "p3", "p4"].map((id) =>
    question({ id, blocId: "ex-1", bonne: "a" }),
  );
  const r = corriger(
    qs,
    copie(qs.map((q) => [q.id, { reponseId: `${q.id}-a` }] as [string, ReponseCopie])),
    PUISSANCE_ALPHA,
  );
  assert.equal(r.points, 5); // 4 × 1 + 1 de bonification
});

test("Puissance Alpha : pas de bonification si une affirmation est ratée", () => {
  const qs = ["p5", "p6", "p7", "p8"].map((id) =>
    question({ id, blocId: "ex-2", bonne: "a" }),
  );
  const r = corriger(
    qs,
    copie([
      ["p5", { reponseId: "p5-a" }],
      ["p6", { reponseId: "p6-a" }],
      ["p7", { reponseId: "p7-a" }],
      ["p8", { reponseId: "p8-b" }],
    ]),
    PUISSANCE_ALPHA,
  );
  assert.equal(r.points, 2.5); // 3 × 1 − 0,5, aucune bonification
});

test("Puissance Alpha : une abstention n'empêche pas la bonification d'être refusée", () => {
  const qs = ["p9", "p10"].map((id) => question({ id, blocId: "ex-3", bonne: "a" }));
  const r = corriger(
    qs,
    copie([
      ["p9", { reponseId: "p9-a" }],
      ["p10", null],
    ]),
    PUISSANCE_ALPHA,
  );
  assert.equal(r.points, 1); // pas de bonification : l'exercice n'est pas complet
});

// ---------------------------------------------------------------------------
// Analyse documentaire SÉSAME : tout ou rien par question
// ---------------------------------------------------------------------------

test("analyse documentaire : une question à trous se note en entier", () => {
  const cases = [
    question({ id: "d1", ordre: 13.01, blocId: "corpus", bonne: "a" }),
    question({ id: "d2", ordre: 13.02, blocId: "corpus", bonne: "a" }),
  ];
  const toutesJustes = corriger(
    cases,
    copie([
      ["d1", { reponseId: "d1-a" }],
      ["d2", { reponseId: "d2-a" }],
    ]),
    ADOC,
  );
  assert.equal(toutesJustes.points, 2);

  const uneRatee = corriger(
    cases,
    copie([
      ["d1", { reponseId: "d1-a" }],
      ["d2", { reponseId: "d2-b" }],
    ]),
    ADOC,
  );
  // « Sinon 0 » : la case juste ne rapporte plus rien non plus.
  assert.equal(uneRatee.points, 0);
});

test("analyse documentaire : le tout ou rien ne contamine pas les autres questions", () => {
  const qs = [
    question({ id: "d3", ordre: 13.01, blocId: "corpus", bonne: "a" }),
    question({ id: "d4", ordre: 13.02, blocId: "corpus", bonne: "a" }),
    question({ id: "d5", ordre: 14, blocId: "corpus", bonne: "a" }),
  ];
  const r = corriger(
    qs,
    copie([
      ["d3", { reponseId: "d3-a" }],
      ["d4", { reponseId: "d4-b" }],
      ["d5", { reponseId: "d5-a" }],
    ]),
    ADOC,
  );
  assert.equal(r.points, 1); // question 13 annulée, question 14 conservée
});

// ---------------------------------------------------------------------------
// Correction manuelle
// ---------------------------------------------------------------------------

test("les rédactions sont comptées à part et n'entrent pas dans le maximum", () => {
  const qs = [
    question({ id: "x1", bonne: "a" }),
    question({ id: "x2", type: "redaction" }),
  ];
  const r = corriger(
    qs,
    copie([
      ["x1", { reponseId: "x1-a" }],
      ["x2", { texte: "ma démonstration" }],
    ]),
    AVENIR,
  );
  assert.equal(r.nbACorriger, 1);
  assert.equal(r.pointsMax, 3); // la rédaction n'y entre pas tant qu'elle n'est pas notée
  assert.equal(r.points, 3);
});

// ---------------------------------------------------------------------------
// Exercices au choix
// ---------------------------------------------------------------------------

test("exercices au choix : seuls les meilleurs exercices traités sont retenus", () => {
  const bareme: Bareme = {
    ...PUISSANCE_ALPHA,
    regles: { blocs_au_choix: { obligatoires: 1, a_choisir: 1 } },
  };
  const qs = [
    question({ id: "c1", blocId: "ex-A", bonne: "a" }),
    question({ id: "c2", blocId: "ex-B", bonne: "a" }),
    question({ id: "c3", blocId: "ex-C", bonne: "a" }),
  ];
  const r = corriger(
    qs,
    copie([
      ["c1", { reponseId: "c1-a" }], // juste
      ["c2", { reponseId: "c2-a" }], // juste
      ["c3", { reponseId: "c3-b" }], // faux : écarté, la limite est de 2
    ]),
    bareme,
  );
  assert.equal(r.points, 2);
  assert.equal(r.pointsMax, 2);
  assert.equal(r.nbFausses, 0);
});

test("exercices au choix : un exercice non traité ne compte pas dans le maximum", () => {
  const bareme: Bareme = {
    ...PUISSANCE_ALPHA,
    regles: { blocs_au_choix: { obligatoires: 1, a_choisir: 1 } },
  };
  const qs = [
    question({ id: "c4", blocId: "ex-D", bonne: "a" }),
    question({ id: "c5", blocId: "ex-E", bonne: "a" }),
  ];
  const r = corriger(qs, copie([["c4", { reponseId: "c4-a" }]]), bareme);
  assert.equal(r.points, 1);
  assert.equal(r.pointsMax, 1); // l'exercice jamais ouvert n'est pas noté
  assert.equal(r.noteSur20, 20);
});
