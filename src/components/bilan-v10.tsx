import { LIBELLE_CHAPITRE } from "@/lib/bilan-cb";
import type { BilanAssemble } from "@/lib/bilans-generation";

/**
 * Bilan au format Parkours V10.
 *
 * Reproduit les modèles PDF fournis : un tableau d'une page, une colonne par
 * épreuve groupée sous son concours, et en lignes les indicateurs. Ce n'est
 * pas le document deux pages décrit au §5.4 de la spécification — les modèles
 * réels, qui partent aux familles, l'emportent.
 *
 * Les deux filières ne portent pas les mêmes lignes : le détail
 * justes/fausses/sans réponse et les quatre blocs d'appréciation n'existent
 * que sur le modèle ingénieurs. Le modèle commerce s'en tient à la note, la
 * moyenne de la classe, le niveau de maîtrise et un commentaire.
 *
 * Rendu pour l'écran et pour l'impression : c'est l'impression navigateur qui
 * produit le PDF, il n'y a pas de seconde mise en page à maintenir.
 */

const nombre = (n: number | null, suffixe = "") =>
  n === null ? "—" : `${String(n).replace(".", ",")}${suffixe}`;

export function BilanV10({ bilan }: { bilan: BilanAssemble }) {
  const detaille = bilan.cohorte?.filiere !== "commerce";
  const { colonnes } = bilan;

  // Les colonnes se groupent par concours, comme sur le modèle.
  const groupes: { concours: string; nb: number }[] = [];
  for (const c of colonnes) {
    const dernier = groupes[groupes.length - 1];
    if (dernier && dernier.concours === c.concours) dernier.nb += 1;
    else groupes.push({ concours: c.concours, nb: 1 });
  }

  return (
    <article className="bilan-v10 space-y-6">
      <header>
        <h1 className="text-2xl font-black text-encre">
          {bilan.eleve.prenom} {bilan.eleve.nom.toUpperCase()}
        </h1>
        <p className="text-sm">
          Concours blancs — {bilan.session}
          {bilan.cohorte && ` · ${bilan.cohorte.nom}`}
        </p>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[0.82rem]">
          <thead>
            <tr>
              <th className="border border-ligne bg-fond-doux p-2 text-left align-bottom">
                Concours blanc
              </th>
              {groupes.map((g, i) => (
                <th
                  key={`${g.concours}-${i}`}
                  colSpan={g.nb}
                  className="border border-ligne bg-fond-doux p-2 text-center"
                >
                  {g.concours}
                </th>
              ))}
            </tr>
            <tr>
              <th className="border border-ligne p-2 text-left">Épreuve</th>
              {colonnes.map((c) => (
                <th key={c.epreuveCbId} className="border border-ligne p-2 text-center">
                  {c.matiere}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            <Ligne titre="Note" colonnes={colonnes} valeur={(c) =>
              c.absent ? "non composée" : nombre(c.noteSur20, "/20")
            } fort />

            <Ligne
              titre={detaille ? "Moyenne groupe" : "Moyenne de la classe"}
              colonnes={colonnes}
              valeur={(c) => nombre(c.moyenneGroupe, "/20")}
            />

            {detaille && (
              <>
                <Ligne
                  titre="Ton classement par rapport au groupe"
                  colonnes={colonnes}
                  valeur={(c) =>
                    c.rang === null ? "—" : `${c.rang}/${c.participants}`
                  }
                />
                <Ligne
                  titre="% de bonnes réponses"
                  colonnes={colonnes}
                  valeur={(c) => nombre(c.tauxBonnesReponses, " %")}
                />
                <Ligne
                  titre="Réponses justes"
                  colonnes={colonnes}
                  valeur={(c) => (c.absent || c.oral ? "—" : String(c.nbBonnes))}
                />
                <Ligne
                  titre="Réponses fausses"
                  colonnes={colonnes}
                  valeur={(c) => (c.absent || c.oral ? "—" : String(c.nbFausses))}
                />
                <Ligne
                  titre="Pas de réponse"
                  colonnes={colonnes}
                  valeur={(c) =>
                    c.oral ? "Détail sur la fiche oral" : c.absent ? "—" : String(c.nbAbstentions)
                  }
                />
              </>
            )}

            <Ligne
              titre="Niveau de maîtrise de l'épreuve"
              colonnes={colonnes}
              valeur={(c) => c.niveau ?? "—"}
            />

            {detaille ? (
              <>
                <LigneTexte
                  titre="Forces identifiées (chapitres et méthode)"
                  colonnes={colonnes}
                  texte={(c) => c.forces}
                />
                <LigneTexte
                  titre="Points d'amélioration (chapitres et méthode)"
                  colonnes={colonnes}
                  texte={(c) => c.ameliorations}
                />
                <LigneTexte
                  titre="Maîtrise de la méthode"
                  colonnes={colonnes}
                  texte={(c) => c.methode}
                />
                <LigneTexte
                  titre="Conseils de reprise de copie"
                  colonnes={colonnes}
                  texte={(c) => c.conseils}
                />
              </>
            ) : (
              <LigneTexte
                titre="Commentaire"
                colonnes={colonnes}
                texte={(c) => c.conseils || c.ameliorations}
              />
            )}
          </tbody>
        </table>
      </div>

      <section className="rounded-carte border-2 border-primaire p-5">
        <h2 className="mb-2 text-sm font-extrabold tracking-[.08em] text-primaire-fonce uppercase">
          En quelques mots
        </h2>
        <p className="whitespace-pre-line">{bilan.enQuelquesMots}</p>
      </section>

      {bilan.priorites.length > 0 && (
        <section className="rounded-carte bg-fond-doux p-5">
          <h2 className="mb-3 text-sm font-extrabold tracking-[.08em] text-primaire-fonce uppercase">
            À travailler en priorité
          </h2>
          <ol className="space-y-2">
            {bilan.priorites.map((p) => (
              <li key={`${p.matiere}-${p.chapitre}`}>
                <strong className="text-encre">{p.chapitre}</strong>
                <span className="opacity-70">
                  {" "}
                  — {p.erreurs} erreur{p.erreurs > 1 ? "s" : ""}, {p.tauxReussite} % de
                  réussite
                </span>
                <br />
                {p.action}
              </li>
            ))}
          </ol>
        </section>
      )}

      {bilan.chapitres.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-extrabold tracking-[.08em] text-primaire-fonce uppercase">
            Détail par chapitre
          </h2>
          <table className="w-full border-collapse text-[0.85rem]">
            <thead>
              <tr className="bg-fond-doux text-left">
                <th className="border border-ligne p-2">Chapitre</th>
                <th className="border border-ligne p-2">Réussite</th>
                <th className="border border-ligne p-2">Niveau</th>
              </tr>
            </thead>
            <tbody>
              {bilan.chapitres.map((c) => (
                <tr key={`${c.matiere}-${c.chapitre}`}>
                  <td className="border border-ligne p-2">{c.chapitre}</td>
                  <td className="border border-ligne p-2 tabular-nums">
                    {c.justes}/{c.posees} ({c.tauxReussite} %)
                  </td>
                  <td className="border border-ligne p-2">
                    {LIBELLE_CHAPITRE[c.niveau]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </article>
  );
}

function Ligne({
  titre,
  colonnes,
  valeur,
  fort = false,
}: {
  titre: string;
  colonnes: BilanAssemble["colonnes"];
  valeur: (c: BilanAssemble["colonnes"][number]) => string;
  fort?: boolean;
}) {
  return (
    <tr>
      <th className="border border-ligne bg-fond-doux/60 p-2 text-left font-bold">
        {titre}
      </th>
      {colonnes.map((c) => (
        <td
          key={c.epreuveCbId}
          className={`border border-ligne p-2 text-center ${fort ? "font-black text-encre" : ""}`}
        >
          {valeur(c)}
        </td>
      ))}
    </tr>
  );
}

function LigneTexte({
  titre,
  colonnes,
  texte,
}: {
  titre: string;
  colonnes: BilanAssemble["colonnes"];
  texte: (c: BilanAssemble["colonnes"][number]) => string;
}) {
  return (
    <tr>
      <th className="border border-ligne bg-fond-doux/60 p-2 text-left align-top font-bold">
        {titre}
      </th>
      {colonnes.map((c) => (
        <td
          key={c.epreuveCbId}
          className="border border-ligne p-2 align-top whitespace-pre-line"
        >
          {texte(c) || <span className="opacity-40">—</span>}
        </td>
      ))}
    </tr>
  );
}
