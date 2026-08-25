import React from "react";

/**
 * Rend les exposants notés « ^ » en vrais exposants (<sup>), à l'affichage.
 *
 * Les données stockent déjà en exposant Unicode les cas simples (e⁵, x², eᵃ) ;
 * ne subsistent en « ^ » que les exposants qu'aucun caractère Unicode ne sait
 * écrire — π, ln, fractions, racines, exposants imbriqués. `<sup>`, lui, accepte
 * n'importe quel contenu, y compris imbriqué. Aucune donnée n'est modifiée.
 *
 * Formes reconnues :
 *   e^(iπ/12)      → e + exposant « iπ/12 »          (parenthèses, profondeur gérée)
 *   e^x, x^4, 2^n  → base + exposant d'un seul token
 *   e^(1/2^(n−1))  → exposant lui-même exposé (récursif)
 */

type Noeud = string | { sup: Noeud[] };

function tokeniser(texte: string): Noeud[] {
  const sortie: Noeud[] = [];
  let tampon = "";
  const viderTampon = () => {
    if (tampon) {
      sortie.push(tampon);
      tampon = "";
    }
  };

  let i = 0;
  while (i < texte.length) {
    if (texte[i] !== "^") {
      tampon += texte[i];
      i += 1;
      continue;
    }

    // Un « ^ » : on ferme le texte courant et on lit l'exposant.
    if (texte[i + 1] === "(") {
      // Exposant parenthésé : on cherche la parenthèse fermante correspondante.
      let profondeur = 0;
      let j = i + 1;
      for (; j < texte.length; j += 1) {
        if (texte[j] === "(") profondeur += 1;
        else if (texte[j] === ")") {
          profondeur -= 1;
          if (profondeur === 0) break;
        }
      }
      if (j < texte.length) {
        viderTampon();
        sortie.push({ sup: tokeniser(texte.slice(i + 2, j)) });
        i = j + 1;
        continue;
      }
      // Parenthèse jamais fermée : on garde le « ^ » littéral.
      tampon += texte[i];
      i += 1;
      continue;
    }

    // Exposant d'un seul token : lettres, chiffres, π (mais pas un signe, qui
    // en notation sans parenthèses appartient au niveau de base : e^x−1).
    const m = /^[A-Za-zÀ-ÿ0-9π]+/.exec(texte.slice(i + 1));
    if (m) {
      viderTampon();
      sortie.push({ sup: [m[0]] });
      i += 1 + m[0].length;
      continue;
    }

    tampon += texte[i];
    i += 1;
  }

  viderTampon();
  return sortie;
}

function enNoeuds(noeuds: Noeud[], cle: string): React.ReactNode[] {
  return noeuds.map((n, k) =>
    typeof n === "string" ? (
      <React.Fragment key={`${cle}-${k}`}>{n}</React.Fragment>
    ) : (
      <sup key={`${cle}-${k}`}>{enNoeuds(n.sup, `${cle}-${k}`)}</sup>
    ),
  );
}

/** Rend un texte mathématique avec ses exposants ; renvoie le texte tel quel s'il n'y a pas de « ^ ». */
export function formaterMath(
  texte: string | null | undefined,
): React.ReactNode {
  if (!texte) return texte ?? null;
  if (!texte.includes("^")) return texte;
  return enNoeuds(tokeniser(texte), "m");
}
