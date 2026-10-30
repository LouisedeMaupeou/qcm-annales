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
                  valeur={(c) => (c.absent ? "—" : String(c.nbBonnes))}
                />
                <Ligne
                  titre="Réponses fausses"
                  colonnes={colonnes}
                  valeur={(c) => (c.absent ? "—" : String(c.nbFausses))}
                />
                <Ligne
                  titre="Pas de réponse"
                  colonnes={colonnes}
                  valeur={(c) => (c.absent ? "—" : String(c.nbAbstentions))}
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

      {bilan.oraux.oraux.length > 0 && <SectionOraux oraux={bilan.oraux} />}

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

/**
 * Section « Oraux blancs », placée après les résultats des écrits.
 *
 * Chaque oral montre le détail de sa grille — le jury note item par item, la
 * famille doit pouvoir lire la même chose — puis les trois retours libres. La
 * note globale n'est affichée que lorsque toutes les épreuves qui pèsent sont
 * notées : une moyenne calculée sur la moitié des oraux induirait en erreur.
 */
function SectionOraux({ oraux }: { oraux: BilanAssemble["oraux"] }) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-sm font-extrabold tracking-[.08em] text-primaire-fonce uppercase">
          Oraux blancs
        </h2>
        {oraux.noteGlobale !== null && oraux.complet && (
          <p className="text-sm">
            Note globale des oraux :{" "}
            <strong className="text-lg text-encre tabular-nums">
              {String(oraux.noteGlobale).replace(".", ",")}/20
            </strong>
          </p>
        )}
        {oraux.noteGlobale !== null && !oraux.complet && (
          <p className="text-sm opacity-75">
            Note globale en attente : tous les oraux ne sont pas encore évalués.
          </p>
        )}
      </div>

      {oraux.oraux.map((o) => (
        <article key={o.nom} className="rounded-carte border border-ligne p-5">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
            <h3 className="font-extrabold text-encre">
              {o.nom}
              {o.contexte && (
                <span className="ml-2 text-[0.9rem] font-normal opacity-75">
                  — {o.contexte}
                </span>
              )}
            </h3>
            <p className="text-sm">
              {o.note === null ? (
                <span className="opacity-70">non évalué</span>
              ) : (
                <>
                  <strong className="text-lg text-encre tabular-nums">
                    {String(o.note).replace(".", ",")}/{o.maximum}
                  </strong>
                  <span className="ml-2 opacity-70">
                    {o.ponderation > 0
                      ? `${Math.round(o.ponderation * 100)} % de la note d'oral`
                      : "hors moyenne"}
                  </span>
                </>
              )}
            </p>
          </div>

          {o.note !== null && (
            <>
              <table className="mb-4 w-full border-collapse text-[0.85rem]">
                <tbody>
                  {o.criteres.map((c) => (
                    <tr key={c.libelle}>
                      <td className="border border-ligne p-2">{c.libelle}</td>
                      <td className="w-28 border border-ligne p-2 text-center tabular-nums">
                        {c.note === null
                          ? "—"
                          : `${String(c.note).replace(".", ",")} / ${c.maximum}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <dl className="space-y-2 text-[0.92rem]">
                <Retour titre="Point fort" texte={o.pointFort} />
                <Retour titre="Progrès prioritaire" texte={o.progresPrioritaire} />
                <Retour titre="Commentaire du jury" texte={o.commentaireJury} />
              </dl>
            </>
          )}
        </article>
      ))}
    </section>
  );
}

function Retour({ titre, texte }: { titre: string; texte: string | null }) {
  if (!texte) return null;
  return (
    <div>
      <dt className="text-[0.7rem] font-bold tracking-[.08em] uppercase opacity-60">
        {titre}
      </dt>
      <dd className="whitespace-pre-line">{texte}</dd>
    </div>
  );
}
