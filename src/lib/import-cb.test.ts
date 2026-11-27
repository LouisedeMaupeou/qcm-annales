import assert from "node:assert/strict";
import test from "node:test";
import { analyserFichierCb } from "./import-cb.ts";

/**
 * Un fichier Parkours minimal, au format point-virgule, avec le BOM UTF-8
 * qu'Excel écrit : sans lui, SheetJS lit le CSV en Latin-1.
 */
function fichier(lignes: string[]): ArrayBuffer {
  return new TextEncoder().encode("﻿" + lignes.join("\n")).buffer as ArrayBuffer;
}

const ENTETE =
  "id_question;epreuve_id;ordre;type;enonce;proposition_a;proposition_b;proposition_c;cle;" +
  "chapitre;methode;travail_a_realiser;retroaction_a;retroaction_b;retroaction_c";

test("le retour de chaque proposition suit sa lettre, et la méthode est gardée", () => {
  const rapport = analyserFichierCb(
    fichier([
      ENTETE,
      "Q1;EP;1;choix_unique;x² − 1 > 0 ?;x > 1 ou x < −1;−1 < x < 1;x > 1;A;" +
        "Algèbre;Factoriser puis tableau de signes;Résoudre x² − 9 ≤ 0;Correct;Produit négatif entre les racines;Oublie x < −1",
    ]),
  );
  assert.equal(rapport.anomalies.filter((a) => a.gravite === "bloquante").length, 0);
  const [q] = rapport.questions;
  assert.equal(q.methode, "Factoriser puis tableau de signes");
  assert.equal(q.travail, "Résoudre x² − 9 ≤ 0");
  assert.deepEqual(
    q.propositions.map((p) => [p.ordre, p.estCorrecte, p.retroaction]),
    [
      [1, true, "Correct"],
      [2, false, "Produit négatif entre les racines"],
      [3, false, "Oublie x < −1"],
    ],
  );
});

test("sans colonnes de retour, l'import d'un ancien fichier reste valable", () => {
  const rapport = analyserFichierCb(
    fichier([
      "id_question;epreuve_id;type;enonce;proposition_a;proposition_b;cle;chapitre",
      "Q1;EP;choix_unique;Énoncé;Oui;Non;B;Logique",
    ]),
  );
  const [q] = rapport.questions;
  assert.equal(q.methode, null);
  assert.ok(q.propositions.every((p) => p.retroaction === null));
});
