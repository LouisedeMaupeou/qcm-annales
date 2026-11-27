import type { PointAnalyse } from "@/lib/bilan-cb";
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
 *
 * V11 (retours de la responsable des prépas, novembre 2026) : le tableau
 * montre à toutes les filières le détail attendues / réussies / ratées / sans
 * réponse ; forces et points d'amélioration nomment les chapitres (les
 * domaines en langues) ; la suite du bilan devient un plan de travail, faute
 * par faute.
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
              titre="Moyenne du groupe"
              colonnes={colonnes}
              valeur={(c) => nombre(c.moyenneGroupe, "/20")}
            />
            <Ligne
              titre="Ta place dans le groupe"
              colonnes={colonnes}
              valeur={(c) => (c.rang === null ? "—" : `${c.rang}/${c.participants}`)}
            />
            <Ligne
              titre="Questions attendues"
              colonnes={colonnes}
              valeur={(c) => String(c.nbQuestions)}
            />
            <Ligne
              titre="Questions réussies"
              colonnes={colonnes}
              valeur={(c) => (c.absent ? "—" : String(c.nbBonnes))}
            />
            <Ligne
              titre="Questions ratées"
              colonnes={colonnes}
              valeur={(c) => (c.absent ? "—" : String(c.nbFausses))}
            />
            {/* Ne pas répondre n'est pas rater : avec des points négatifs,
                c'est parfois la bonne stratégie. */}
            <Ligne
              titre="Sans réponse"
              colonnes={colonnes}
              valeur={(c) => (c.absent ? "—" : String(c.nbAbstentions))}
            />

            <Ligne
              titre="Niveau de maîtrise de l'épreuve"
              colonnes={colonnes}
              valeur={(c) => c.niveau ?? "—"}
            />

            {/* Les chapitres sont calculés : ces deux lignes ont donc un
                contenu même quand la responsable n'a rien écrit, et valent
                pour les deux filières. Elles disparaissent si l'épreuve n'a
                aucun chapitre classé. */}
            <LigneTexte
              titre="Forces identifiées"
              colonnes={colonnes}
              texte={(c) => c.forces}
              points={(c) => c.forcesPoints}
              detailPoint={(p) => `${p.justes}/${p.posees} réussies`}
            />
            <LigneTexte
              titre="Points d'amélioration (faux plus de 2 fois)"
              colonnes={colonnes}
              texte={(c) => c.ameliorations}
              points={(c) => c.ameliorationsPoints}
              detailPoint={(p) => `${p.fausses} fautes`}
              alerte
            />

            {detaille ? (
              <>
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
            ) : null}
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

      {bilan.plan.length > 0 && <PlanDeTravail plan={bilan.plan} />}
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

/**
 * Une ligne de texte du tableau, éventuellement précédée de ses chapitres.
 *
 * Deux règles s'y rejoignent. Les chapitres sont calculés depuis la
 * correction : la responsable n'a pas à recopier ce que la copie dit déjà,
 * elle commente à côté. Et une ligne vide sur toutes les épreuves disparaît —
 * un bilan envoyé aux familles n'a pas à montrer des cases à remplir.
 */
function LigneTexte({
  titre,
  colonnes,
  texte,
  points,
  detailPoint,
  alerte = false,
}: {
  titre: string;
  colonnes: BilanAssemble["colonnes"];
  texte: (c: BilanAssemble["colonnes"][number]) => string;
  points?: (c: BilanAssemble["colonnes"][number]) => PointAnalyse[];
  detailPoint?: (p: PointAnalyse) => string;
  alerte?: boolean;
}) {
  const vide = colonnes.every(
    (c) => !texte(c).trim() && (points?.(c).length ?? 0) === 0,
  );
  if (vide) return null;

  return (
    <tr>
      <th className="border border-ligne bg-fond-doux/60 p-2 text-left align-top font-bold">
        {titre}
      </th>
      {colonnes.map((c) => {
        const liste = points?.(c) ?? [];
        const commentaire = texte(c).trim();
        return (
          <td
            key={c.epreuveCbId}
            className="border border-ligne p-2 align-top whitespace-pre-line"
          >
            {liste.length > 0 && (
              <ul className="mb-1.5 space-y-0.5">
                {liste.map((p) => (
                  <li key={`${p.domaine}-${p.libelle}`}>
                    {p.libelle}
                    {detailPoint && (
                      <span className={alerte ? "font-bold text-negatif" : "opacity-70"}>
                        {" "}
                        — {detailPoint(p)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {commentaire}
            {liste.length === 0 && !commentaire && <span className="opacity-40">—</span>}
          </td>
        );
      })}
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

/**
 * La suite du bilan : un plan de travail.
 *
 * Les points d'amélioration du tableau, épreuve par épreuve, le plus fautif
 * d'abord, chacun illustré par deux fautes de la copie — la notion, l'erreur
 * commise, ce qu'il faut reprendre, la méthode. La copie corrigée, en ligne,
 * porte les autres, et le renvoi le dit.
 */
function PlanDeTravail({ plan }: { plan: BilanAssemble["plan"] }) {
  return (
    <section className="space-y-5">
      <h2 className="text-sm font-extrabold tracking-[.08em] text-primaire-fonce uppercase">
        Ton plan de travail
      </h2>
      <p className="text-[0.9rem] opacity-80">
        Tes points d&apos;amélioration, du plus fréquent au moins fréquent, avec des
        exemples tirés de tes copies : la notion, l&apos;erreur commise, et comment ne
        plus la refaire. Toutes tes fautes sont dans tes copies corrigées, sur ton
        espace.
      </p>
      {plan.map((e) => (
        <div key={e.epreuve} className="space-y-3">
          <h3 className="font-black text-encre">{e.epreuve}</h3>
          {e.points.map((p) => (
            <div key={`${p.domaine}-${p.libelle}`} className="rounded-carte border border-ligne p-4">
              <p className="mb-2 font-extrabold text-encre">
                {p.libelle !== p.domaine && (
                  <span className="font-bold opacity-70">{p.domaine} › </span>
                )}
                {p.libelle}{" "}
                <span className="font-bold text-negatif">— {p.fautes} fautes</span>
              </p>
              <ul className="space-y-2.5 border-l-4 border-negatif/40 pl-3 text-[0.88rem]">
                {p.detail.map((f) => (
                  <li key={f.numero}>
                    <p>
                      <span className="font-bold">Question {f.numero}</span>
                      {f.chapitre && <> · {f.chapitre}</>}
                      {f.notion && <> · {f.notion}</>}
                    </p>
                    {f.erreur && (
                      <p>
                        <span className="font-bold text-negatif">Erreur : </span>
                        {f.erreur}
                      </p>
                    )}
                    {f.amelioration && (
                      <p>
                        <span className="font-bold text-positif">À reprendre : </span>
                        {f.amelioration}
                      </p>
                    )}
                    {f.methode && (
                      <p>
                        <span className="font-bold text-primaire-fonce">Méthode : </span>
                        {f.methode}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
              {p.autres > 0 && (
                <p className="mt-2 text-[0.82rem] opacity-70">
                  + {p.autres} autre{p.autres > 1 ? "s" : ""} faute{p.autres > 1 ? "s" : ""} sur
                  ce point : voir ta copie corrigée.
                </p>
              )}
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
