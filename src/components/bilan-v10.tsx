import localFont from "next/font/local";
import { constatsEpreuve, type PointAnalyse } from "@/lib/bilan-cb";
import type { BilanAssemble } from "@/lib/bilans-generation";

/**
 * Bilan de session, à l'écran (élève, parent, back-office).
 *
 * V11 (retours de la responsable des prépas, novembre 2026), même structure
 * que le PDF (`bilan-pdf.tsx`), qui doit évoluer avec lui : « En quelques
 * mots », puis un tableau de synthèse — une ligne par épreuve, note, moyenne
 * du groupe, place, questions attendues / réussies / ratées / sans réponse,
 * acquis et points à reprendre —, puis le plan de travail, et les oraux en
 * dernier. Toutes les filières voient le même détail.
 *
 * Une différence assumée avec le PDF : ici, chaque point du plan déplie
 * toutes ses fautes. Le PDF s'en tient aux exemples et renvoie à cette page.
 */

// Rubik, la police du bilan (retours de la responsable des prépas) — mêmes
// fichiers que le PDF, servis depuis notre domaine par next/font.
const rubik = localFont({
  src: [
    { path: "../lib/polices/rubik-latin-400-normal.woff", weight: "400" },
    { path: "../lib/polices/rubik-latin-500-normal.woff", weight: "500" },
    { path: "../lib/polices/rubik-latin-700-normal.woff", weight: "700" },
    { path: "../lib/polices/rubik-latin-800-normal.woff", weight: "800" },
  ],
  display: "swap",
});

const virgule = (n: number | null) => (n === null ? "—" : String(n).replace(".", ","));

/** La même échelle que le PDF : rouge sous 8, vert à partir de 15. */
const couleurNote = (n: number | null) =>
  n === null ? "text-encre/50" : n >= 15 ? "text-positif" : n >= 8 ? "text-primaire" : "text-negatif";

export function BilanV10({ bilan }: { bilan: BilanAssemble }) {
  return (
    <article className={`bilan-v10 space-y-8 ${rubik.className}`}>
      <header className="rounded-carte bg-primaire px-6 py-6 text-white">
        <p className="text-[0.72rem] font-medium tracking-[.14em] uppercase opacity-75">
          Bilan des concours blancs
        </p>
        <h1 className="text-[clamp(1.6rem,4vw,2.2rem)] font-extrabold text-white">
          {bilan.eleve.prenom} {bilan.eleve.nom}
        </h1>
        <p className="opacity-90">
          {bilan.session}
          {bilan.cohorte && ` · ${bilan.cohorte.nom}`}
        </p>
      </header>

      <section className="rounded-carte border-l-4 border-primaire bg-fond-doux p-5">
        <h2 className="mb-1.5 text-[0.75rem] font-bold tracking-[.1em] text-primaire-fonce uppercase">
          En quelques mots
        </h2>
        <p className="whitespace-pre-line text-encre">{bilan.enQuelquesMots}</p>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-extrabold text-encre">Tes résultats</h2>
        <TableauResultats colonnes={bilan.colonnes} />
        <p className="mt-2 text-[0.8rem] opacity-70">
          Note sur 20, en vert à partir de 15, en rouge sous 8. Place : ton rang parmi les élèves du
          groupe qui ont composé. Acquis : réussites sur questions posées. À reprendre : nombre de
          fautes.
        </p>
        <CommentairesEpreuves colonnes={bilan.colonnes} />
      </section>

      {bilan.plan.length > 0 && <PlanDeTravail plan={bilan.plan} />}

      {/* Les oraux en fin de bilan, après le plan de travail des écrits. */}
      {bilan.oraux.oraux.length > 0 && <SectionOraux oraux={bilan.oraux} />}
    </article>
  );
}

type Colonne = BilanAssemble["colonnes"][number];

/**
 * Le tableau de synthèse : une ligne par épreuve, comme le PDF.
 *
 * Sur un écran étroit, il défile horizontalement plutôt que de comprimer les
 * listes d'acquis et de points à reprendre jusqu'à l'illisible.
 */
function TableauResultats({ colonnes }: { colonnes: Colonne[] }) {
  const th = "px-2 py-2.5 text-[0.72rem] font-bold text-white";
  return (
    <div className="overflow-x-auto rounded-carte border border-ligne">
      <table className="w-full min-w-[820px] border-collapse text-[0.85rem]">
        <thead className="bg-encre">
          <tr>
            <th className={`${th} text-left`}>Épreuve</th>
            <th className={th}>Note</th>
            <th className={th}>Moy. groupe</th>
            <th className={th}>Place</th>
            <th className={th}>Questions</th>
            <th className={th}>Réussies</th>
            <th className={th}>Ratées</th>
            <th className={th}>Sans rép.</th>
            <th className={`${th} text-left`}>Acquis</th>
            <th className={`${th} text-left`}>À reprendre (faux &gt; 2 fois)</th>
          </tr>
        </thead>
        <tbody>
          {colonnes.map((c, i) => (
            <tr key={c.epreuveCbId} className={`border-t border-ligne ${i % 2 ? "bg-fond-doux" : "bg-white"}`}>
              <td className="px-2 py-2.5 align-middle">
                <span className="block text-[0.68rem] tracking-[.06em] uppercase opacity-60">
                  {c.concours}
                </span>
                <span className="font-bold text-encre">{c.matiere}</span>
              </td>
              {c.absent ? (
                <td colSpan={7} className="px-2 text-center opacity-60">
                  Non composée
                </td>
              ) : (
                <>
                  <td className="px-2 text-center">
                    <span className={`text-xl font-extrabold ${couleurNote(c.noteSur20)}`}>
                      {virgule(c.noteSur20)}
                    </span>
                    <span className="text-[0.7rem] opacity-60">/20</span>
                  </td>
                  <td className="px-2 text-center tabular-nums">{virgule(c.moyenneGroupe)}</td>
                  <td className="px-2 text-center tabular-nums">
                    {c.rang === null ? "—" : `${c.rang}/${c.participants}`}
                  </td>
                  <td className="px-2 text-center tabular-nums">{c.nbQuestions}</td>
                  <td className="px-2 text-center font-bold text-positif tabular-nums">{c.nbBonnes}</td>
                  <td className="px-2 text-center font-bold text-negatif tabular-nums">{c.nbFausses}</td>
                  <td className="px-2 text-center tabular-nums opacity-60">{c.nbAbstentions}</td>
                </>
              )}
              <td className="px-2 py-2.5 align-middle">
                <ListePoints
                  points={c.forcesPoints}
                  couleur="text-positif"
                  mesure={(p) => `${p.justes}/${p.posees}`}
                  commentaire={c.forces}
                />
              </td>
              <td className="px-2 py-2.5 align-middle">
                <ListePoints
                  points={c.ameliorationsPoints}
                  couleur="text-negatif"
                  mesure={(p) => String(p.fausses)}
                  commentaire={c.ameliorations}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ListePoints({
  points,
  couleur,
  mesure,
  commentaire,
}: {
  points: PointAnalyse[];
  couleur: string;
  mesure: (p: PointAnalyse) => string;
  commentaire: string;
}) {
  if (points.length === 0 && !commentaire.trim()) return <span className="opacity-40">—</span>;
  return (
    <div className="text-[0.82rem]">
      <ul className="space-y-0.5">
        {points.map((p) => (
          <li key={`${p.domaine}-${p.libelle}`}>
            <span className={couleur}>• </span>
            <span className="text-encre">{p.libelle}</span>{" "}
            <span className={`font-bold ${couleur}`}>{mesure(p)}</span>
          </li>
        ))}
      </ul>
      {commentaire.trim() && <p className="mt-1 whitespace-pre-line">{commentaire.trim()}</p>}
    </div>
  );
}

/** Les commentaires de méthode et de reprise, quand la responsable en a écrit. */
function CommentairesEpreuves({ colonnes }: { colonnes: Colonne[] }) {
  const avec = colonnes.filter((c) => c.methode.trim() || c.conseils.trim());
  if (avec.length === 0) return null;
  return (
    <dl className="mt-4 space-y-2 text-[0.9rem]">
      {avec.map((c) => (
        <div key={c.epreuveCbId}>
          <dt className="font-bold text-encre">{c.matiere}</dt>
          {c.methode.trim() && (
            <dd>
              <span className="font-bold text-primaire-fonce">Méthode : </span>
              {c.methode.trim()}
            </dd>
          )}
          {c.conseils.trim() && (
            <dd>
              <span className="font-bold text-primaire-fonce">Conseils : </span>
              {c.conseils.trim()}
            </dd>
          )}
        </div>
      ))}
    </dl>
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
 * Les trois points d'amélioration les plus fautifs de chaque épreuve, chacun
 * illustré par deux fautes de la copie — la notion, l'erreur commise, ce qu'il
 * faut reprendre, la méthode. Aucune faute ne disparaît pour autant : chaque
 * point déplie toutes les siennes, et les points suivants sont repliés en
 * dessous. Le PDF, lui, s'en tient aux exemples et renvoie ici.
 */
function PlanDeTravail({ plan }: { plan: BilanAssemble["plan"] }) {
  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-lg font-extrabold text-encre">Ton plan de travail</h2>
        <p className="text-[0.9rem] opacity-75">
          Pour chaque épreuve, tes points à reprendre les plus fréquents, avec des exemples tirés
          de tes copies : la notion, l&apos;erreur commise, et comment ne plus la refaire. Déplie
          un point pour voir toutes tes fautes.
        </p>
      </div>
      {plan.map((e) => (
        <div key={e.epreuve} className="space-y-3">
          <h3 className="rounded-[8px] bg-encre px-4 py-2 font-bold text-white">{e.epreuve}</h3>
          {constatsEpreuve(e).map((c) => (
            <p key={c} className="rounded-[8px] bg-fond-doux px-4 py-2.5 text-[0.9rem] text-encre">
              {c}
            </p>
          ))}
          {e.points.map((p, i) => (
            <PointDuPlanVue
              key={`${p.domaine}-${p.libelle}`}
              point={p}
              rang={i + 1}
              surveiller={e.nature === "a_surveiller"}
            />
          ))}
          {e.autresPoints.length > 0 && (
            <details className="rounded-carte border border-dashed border-ligne p-4">
              <summary className="cursor-pointer text-[0.9rem] font-bold text-encre">
                {e.autresPoints.length} autre{e.autresPoints.length > 1 ? "s" : ""} point
                {e.autresPoints.length > 1 ? "s" : ""}{" "}
                {e.nature === "a_surveiller" ? "à surveiller" : "à reprendre"} :{" "}
                <span className="font-normal">
                  {e.autresPoints.map((p) => `${p.libelle} (${p.fautes})`).join(", ")}
                </span>
              </summary>
              <div className="mt-3 space-y-3">
                {e.autresPoints.map((p) => (
                  <PointDuPlanVue
                    key={`${p.domaine}-${p.libelle}`}
                    point={p}
                    tout
                    surveiller={e.nature === "a_surveiller"}
                  />
                ))}
              </div>
            </details>
          )}
        </div>
      ))}
    </section>
  );
}

type PointPlan = BilanAssemble["plan"][number]["points"][number];

/** Un point du plan : ses exemples, puis le reste de ses fautes, à déplier. */
function PointDuPlanVue({
  point: p,
  rang,
  tout = false,
  surveiller = false,
}: {
  point: PointPlan;
  rang?: number;
  tout?: boolean;
  /** Point à surveiller (sous le seuil) : ambre plutôt que rouge. */
  surveiller?: boolean;
}) {
  const exemples = tout ? p.toutes : p.detail;
  const montres = new Set(exemples.map((f) => f.numero));
  const reste = p.toutes.filter((f) => !montres.has(f.numero));
  return (
    <div className="rounded-carte border border-ligne bg-white p-4">
      <div className="flex items-center gap-2.5">
        {rang && (
          <span
            className={`grid size-6 shrink-0 place-items-center rounded-full text-[0.8rem] font-extrabold ${
              surveiller ? "bg-soleil text-encre" : "bg-negatif text-white"
            }`}
          >
            {rang}
          </span>
        )}
        <p className="flex-1 font-bold text-encre">
          {p.libelle !== p.domaine && <span className="font-medium opacity-60">{p.domaine} › </span>}
          {p.libelle}
        </p>
        <span
          className={`rounded-full px-2.5 py-0.5 text-[0.78rem] font-bold ${
            surveiller ? "bg-soleil/25 text-encre" : "bg-negatif/10 text-negatif"
          }`}
        >
          {p.fautes} faute{p.fautes > 1 ? "s" : ""}
        </span>
      </div>
      <ListeFautes fautes={exemples} />
      {reste.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-[0.85rem] font-bold text-primaire">
            Voir les {reste.length} autre{reste.length > 1 ? "s" : ""} faute
            {reste.length > 1 ? "s" : ""} sur ce point
          </summary>
          <ListeFautes fautes={reste} />
        </details>
      )}
    </div>
  );
}

/** Une faute par bloc : la question et sa notion, puis les rubriques en colonne. */
function ListeFautes({ fautes }: { fautes: PointPlan["toutes"] }) {
  const rubrique = "w-24 shrink-0 pt-px text-[0.7rem] font-bold tracking-[.04em] uppercase";
  return (
    <ul className="text-[0.88rem]">
      {fautes.map((f) => (
        <li key={f.numero} className="mt-3 border-t border-ligne pt-3">
          <p className="mb-1 text-[0.8rem] opacity-70">
            <span className="font-bold text-encre opacity-100">Question {f.numero}</span>
            {f.chapitre && <> · {f.chapitre}</>}
            {f.notion && <> · {f.notion}</>}
          </p>
          {f.erreur && (
            <p className="flex gap-2">
              <span className={`${rubrique} text-negatif`}>Erreur</span>
              <span>{f.erreur}</span>
            </p>
          )}
          {f.amelioration && (
            <p className="flex gap-2">
              <span className={`${rubrique} text-positif`}>À reprendre</span>
              <span>{f.amelioration}</span>
            </p>
          )}
          {f.methode && (
            <p className="flex gap-2">
              <span className={`${rubrique} text-primaire`}>Méthode</span>
              <span>{f.methode}</span>
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
