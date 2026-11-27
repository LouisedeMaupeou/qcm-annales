import { strict as assert } from "node:assert";
import { test } from "node:test";
import { libellePiece, rassemblerDossier } from "./dossier-passage.ts";

const q = (...titres: string[]) => ({
  enonceCommun: null,
  documents: titres.map((t) => ({ titre: t, url: `https://exemple.test/${t}` })),
});

test("le dossier est rassemblé sans doublon", () => {
  // Forme réelle de l'analyse documentaire : vingt questions, soixante-treize
  // citations, seize pièces distinctes.
  const pieces = rassemblerDossier([
    q("texte-7.png"),
    q("texte-7.png"),
    q("texte-2.png", "encart-C.png"),
    q("texte-7.png", "encart-J.png"),
  ]);
  assert.deepEqual(
    pieces.map((p) => p.titre),
    ["texte-2.png", "texte-7.png", "encart-C.png", "encart-J.png"],
  );
});

test("les textes passent avant les encarts, et se trient par numéro", () => {
  const pieces = rassemblerDossier([q("texte-10.png", "encart-A.png", "texte-2.png")]);
  assert.deepEqual(
    pieces.map((p) => p.titre),
    ["texte-2.png", "texte-10.png", "encart-A.png"],
  );
});

test("une épreuve sans document n'a pas de dossier", () => {
  assert.deepEqual(
    rassemblerDossier([{ enonceCommun: "Un passage de langue", documents: [] }]),
    [],
  );
});

test("deux pièces de même titre mais d'URL différente restent distinctes", () => {
  // Le cas d'un même nom de fichier dans deux épreuves : c'est l'URL qui
  // identifie la pièce servie.
  const pieces = rassemblerDossier([
    { enonceCommun: null, documents: [{ titre: "texte-1.png", url: "a" }] },
    { enonceCommun: null, documents: [{ titre: "texte-1.png", url: "b" }] },
  ]);
  assert.equal(pieces.length, 2);
});

test("les libellés se lisent", () => {
  assert.equal(libellePiece("texte-7.png"), "Texte 7");
  assert.equal(libellePiece("encart-c.png"), "Encart C");
  assert.equal(libellePiece("Annexe 3.png"), "Annexe 3");
  assert.equal(libellePiece(null), null);
});

test("les pages d'un sujet servi en dossier s'intitulent « Page N », dans l'ordre", () => {
  assert.equal(libellePiece("AV-PHY-NOEL26-page-03.png"), "Page 3");
  const ordre = rassemblerDossier([
    {
      enonceCommun: null,
      documents: ["page-10", "page-02", "page-09"].map((t) => ({ titre: `AV-PHY-NOEL26-${t}.png`, url: t })),
    },
  ]).map((p) => libellePiece(p.titre));
  assert.deepEqual(ordre, ["Page 2", "Page 9", "Page 10"]);
});
