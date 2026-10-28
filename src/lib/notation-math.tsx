import React from "react";

/**
 * Rend à l'affichage les notations mathématiques peu lisibles en texte brut,
 * sans jamais modifier les données (réversible) :
 *
 *   ^   exposant   → <sup>   e^(iπ/12), x^4, imbriqués e^(1/2^(n−1))
 *   _   indice     → <sub>   P_B(A), x_A, z_C
 *   ·   produit    → ×       UNIQUEMENT hors contexte vectoriel
 *
 * Deux pièges, vérifiés dans les données réelles :
 *
 *  - « _ » sert aussi de trou à compléter dans les questions d'anglais
 *    (« The __________ for… »). Une SUITE de « _ » est donc laissée telle
 *    quelle ; seul un « _ » isolé introduit un indice.
 *  - « · » entre vecteurs est un produit scalaire (u⃗ · v⃗) : le passer en « × »
 *    en ferait un produit vectoriel, une faute. On ne convertit donc que les
 *    « · » sans flèche de vecteur à proximité.
 */

const FLECHE = "⃗"; // ⃗ combinante (marque un vecteur)

/** « · »/« ⋅ » → « × », sauf s'il y a une flèche de vecteur à proximité. */
function multiplication(s: string): string {
  return s.replace(/[·⋅]/g, (m, i: number) => {
    const fenetre = s.slice(Math.max(0, i - 3), i + 4);
    return fenetre.includes(FLECHE) ? m : "×";
  });
}

type Noeud = string | { haut: Noeud[] } | { bas: Noeud[] };

const TOKEN = /^[A-Za-zÀ-ÿ0-9π]+/;

function tokeniser(texte: string): Noeud[] {
  const sortie: Noeud[] = [];
  let tampon = "";
  const vider = () => {
    if (tampon) {
      sortie.push(tampon);
      tampon = "";
    }
  };

  let i = 0;
  while (i < texte.length) {
    const c = texte[i];

    // Suite de « _ » : un trou à compléter (anglais), jamais un indice.
    if (c === "_" && texte[i + 1] === "_") {
      let j = i;
      while (j < texte.length && texte[j] === "_") j += 1;
      tampon += texte.slice(i, j);
      i = j;
      continue;
    }

    if (c === "^" || c === "_") {
      const clef = c === "^" ? "haut" : "bas";

      if (texte[i + 1] === "(") {
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
          vider();
          sortie.push({ [clef]: tokeniser(texte.slice(i + 2, j)) } as Noeud);
          i = j + 1;
          continue;
        }
        tampon += c;
        i += 1;
        continue;
      }

      const m = TOKEN.exec(texte.slice(i + 1));
      if (m) {
        vider();
        sortie.push({ [clef]: [m[0]] } as Noeud);
        i += 1 + m[0].length;
        continue;
      }

      tampon += c;
      i += 1;
      continue;
    }

    tampon += c;
    i += 1;
  }

  vider();
  return sortie;
}

function enNoeuds(noeuds: Noeud[], cle: string): React.ReactNode[] {
  return noeuds.map((n, k) => {
    if (typeof n === "string")
      return <React.Fragment key={`${cle}-${k}`}>{n}</React.Fragment>;
    if ("haut" in n)
      return <sup key={`${cle}-${k}`}>{enNoeuds(n.haut, `${cle}-${k}`)}</sup>;
    return <sub key={`${cle}-${k}`}>{enNoeuds(n.bas, `${cle}-${k}`)}</sub>;
  });
}

/** Rend un texte mathématique ; renvoie la chaîne inchangée s'il n'y a rien à traiter. */
export function formaterMath(
  texte: string | null | undefined,
): React.ReactNode {
  if (!texte) return texte ?? null;
  if (!/[\^_·⋅]/.test(texte)) return texte;
  return enNoeuds(tokeniser(multiplication(texte)), "m");
}

/**
 * Aperçu du rendu, sous un champ de saisie.
 *
 * Une zone de saisie montre forcément la source — c'est elle qu'on corrige, et
 * on ne peut pas taper dans un exposant. L'aperçu donne donc à voir ce que
 * l'élève lira, juste en dessous, et disparaît quand le texte ne contient
 * aucune notation à traduire.
 */
export function ApercuMath({ texte }: { texte: string }) {
  if (!/\^|[·⋅]|_[A-Za-zÀ-ÿ0-9(]/.test(texte)) return null;
  return (
    <p
      aria-live="polite"
      className="mt-1.5 rounded-[10px] bg-fond-doux px-3 py-2 text-[0.95rem] whitespace-pre-line"
    >
      <span className="mr-2 text-[0.7rem] font-bold tracking-[.08em] uppercase opacity-60">
        Aperçu
      </span>
      {formaterMath(texte)}
    </p>
  );
}
