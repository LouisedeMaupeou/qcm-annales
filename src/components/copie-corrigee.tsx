import { libellePiece, rassemblerDossier } from "@/lib/dossier-passage";
import { grouperParExercice } from "@/lib/groupes-passage";
import { formaterMath } from "@/lib/notation-math";
import type { Corrige, QuestionCorrigee } from "@/lib/reprise-cb";

/**
 * Une copie corrigée : chaque question telle qu'elle a été posée, ce que
 * l'élève a répondu, la bonne réponse, et pourquoi.
 *
 * Elle sert la copie officielle comme les reprises : c'est le même regard sur
 * la même épreuve, et l'élève doit pouvoir comparer les deux sans réapprendre
 * à lire l'écran.
 *
 * Un retour, pas une note : le chapitre et la notion sont nommés sur chaque
 * question, parce que c'est ce que le bilan lui demande de retravailler, et
 * c'est ici qu'il voit d'où ça vient.
 */

const VERDICT: Record<
  QuestionCorrigee["statut"],
  { libelle: string; classe: string; bord: string }
> = {
  correcte: { libelle: "Juste", classe: "bg-positif/10 text-positif", bord: "border-positif" },
  incorrecte: { libelle: "Fausse", classe: "bg-negatif/10 text-negatif", bord: "border-negatif" },
  abstention: { libelle: "Sans réponse", classe: "bg-fond-doux text-encre", bord: "border-ligne" },
  a_corriger: { libelle: "Rédigée", classe: "bg-soleil/20 text-encre", bord: "border-soleil" },
};

const virgule = (n: number) => n.toString().replace(".", ",");

export function CopieCorrigee({
  corrige,
  reprise = false,
}: {
  corrige: Corrige;
  /** Sur une reprise, une rédaction n'est pas notée : on montre l'attendu. */
  reprise?: boolean;
}) {
  const groupes = grouperParExercice(corrige.questions);
  const dossier = rassemblerDossier(corrige.questions);

  return (
    <div>
      <ul className="mb-8 flex flex-wrap gap-3" aria-label="Résumé de la copie">
        {corrige.noteSur20 !== null && (
          <Pastille valeur={`${virgule(corrige.noteSur20)}/20`} libelle="note" fort />
        )}
        <Pastille valeur={corrige.nbBonnes} libelle="justes" classe="text-positif" />
        <Pastille valeur={corrige.nbFausses} libelle="fausses" classe="text-negatif" />
        <Pastille valeur={corrige.nbAbstentions} libelle="sans réponse" />
      </ul>

      {dossier.length > 0 && (
        <details className="mb-8 rounded-carte border border-ligne bg-white p-5">
          <summary className="cursor-pointer font-extrabold text-encre">
            Le dossier de l&apos;épreuve ({dossier.length} document
            {dossier.length > 1 ? "s" : ""})
          </summary>
          <div className="mt-4 space-y-5">
            {dossier.map((d, i) => (
              <figure key={`${d.titre ?? "doc"}-${i}`}>
                {libellePiece(d.titre) && (
                  <figcaption className="mb-1.5 font-extrabold text-encre">
                    {libellePiece(d.titre)}
                  </figcaption>
                )}
                {d.url && (
                  // eslint-disable-next-line @next/next/no-img-element -- URL signée temporaire
                  <img
                    src={d.url}
                    alt={libellePiece(d.titre) ?? `Document ${i + 1}`}
                    className="w-full rounded-[10px] border border-ligne bg-white"
                  />
                )}
              </figure>
            ))}
          </div>
        </details>
      )}

      <ol className="space-y-6">
        {groupes.map((groupe, i) => {
          const premiere = corrige.questions.indexOf(groupe[0]) + 1;
          return (
            <li key={groupe[0].id} className="rounded-carte border border-ligne bg-white p-5 sm:p-6">
              <p className="mb-3 text-sm font-extrabold tracking-[.08em] text-primaire-fonce uppercase">
                {groupe.length > 1
                  ? `Exercice ${i + 1} · questions ${premiere} à ${premiere + groupe.length - 1}`
                  : `Question ${premiere}`}
              </p>
              {groupe[0].enonceCommun && (
                <p className="mb-5 text-[0.98rem] leading-relaxed whitespace-pre-line">
                  {formaterMath(groupe[0].enonceCommun)}
                </p>
              )}
              <ol className="space-y-6">
                {groupe.map((q, rang) => (
                  <li key={q.id}>
                    <QuestionCorrection
                      question={q}
                      numero={premiere + rang}
                      lettre={groupe.length > 1 ? "ABCDEFGH"[rang] : null}
                      reprise={reprise}
                    />
                  </li>
                ))}
              </ol>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Pastille({
  valeur,
  libelle,
  classe = "text-encre",
  fort = false,
}: {
  valeur: string | number;
  libelle: string;
  classe?: string;
  fort?: boolean;
}) {
  return (
    <li
      className={`rounded-carte border px-4 py-2.5 ${fort ? "border-primaire bg-primaire/5" : "border-ligne bg-white"}`}
    >
      <span className={`block text-xl font-black tabular-nums ${classe}`}>{valeur}</span>
      <span className="text-[0.8rem] opacity-75">{libelle}</span>
    </li>
  );
}

function QuestionCorrection({
  question: q,
  numero,
  lettre,
  reprise,
}: {
  question: QuestionCorrigee;
  numero: number;
  lettre: string | null;
  reprise: boolean;
}) {
  const verdict = VERDICT[q.statut];
  const enAttente = q.statut === "a_corriger" && !reprise && q.points === null;

  return (
    <div className={`border-l-4 pl-4 ${verdict.bord}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {/* Seule dans son exercice, la question est déjà numérotée au-dessus. */}
        {lettre && (
          <span className="font-black text-encre">
            {numero} ({lettre})
          </span>
        )}
        <span className={`rounded-full px-2.5 py-0.5 text-[0.75rem] font-bold ${verdict.classe}`}>
          {q.statut === "a_corriger"
            ? reprise
              ? "Rédigée — non notée en reprise"
              : enAttente
                ? "En attente de correction"
                : "Corrigée à la main"
            : verdict.libelle}
        </span>
        {q.nonComptee && (
          <span className="rounded-full bg-ligne px-2.5 py-0.5 text-[0.75rem] font-bold text-encre">
            Non comptée
          </span>
        )}
        {q.points !== null && !reprise && (
          <span className="text-[0.8rem] tabular-nums opacity-75">
            {q.points > 0 ? "+" : ""}
            {virgule(q.points)} pt{Math.abs(q.points) > 1 ? "s" : ""}
          </span>
        )}
        {(q.chapitre || q.notion) && (
          <span className="text-[0.8rem] opacity-75">
            · {[q.chapitre, q.notion].filter(Boolean).join(" › ")}
          </span>
        )}
      </div>

      {q.figureUrl && (
        <figure className="mb-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- URL signée temporaire */}
          <img
            src={q.figureUrl}
            alt={`Figure de la question ${numero}`}
            className="w-full max-w-[720px] rounded-carte border border-ligne bg-white"
          />
        </figure>
      )}

      {q.nonComptee && (
        <p className="mb-3 rounded-[10px] border-l-4 border-ligne bg-fond-doux px-3 py-2 text-[0.9rem]">
          {q.nonComptee === "au_dela_reponses"
            ? "Cette réponse n'a pas été notée : elle venait après le nombre de réponses autorisé (seules les premières, dans l'ordre du sujet, comptent)."
            : "Cette réponse n'a pas été notée : son exercice venait après le nombre d'exercices autorisé (seuls les premiers traités, dans l'ordre du sujet, comptent)."}
        </p>
      )}

      <p className="mb-3 whitespace-pre-line text-encre">{formaterMath(q.enonce)}</p>

      {q.type === "redaction" ? (
        <div className="mb-3 rounded-[10px] bg-fond-doux p-4 text-[0.95rem]">
          <p className="mb-1 text-[0.8rem] font-bold uppercase opacity-70">Ta réponse</p>
          <p className="whitespace-pre-line">{q.texte ?? "Pas de réponse."}</p>
        </div>
      ) : (
        <ul className="mb-3 space-y-1.5">
          {q.propositions.map((p) => (
            <li
              key={p.id}
              className={`flex items-start gap-2.5 rounded-[10px] border px-3 py-2 text-[0.95rem] ${
                p.estCorrecte
                  ? "border-positif bg-positif/5"
                  : p.cochee
                    ? "border-negatif bg-negatif/5"
                    : "border-ligne"
              }`}
            >
              <span aria-hidden className="w-5 shrink-0 font-black">
                {p.estCorrecte ? "✓" : p.cochee ? "✗" : ""}
              </span>
              <span className="flex-1">{formaterMath(p.texte)}</span>
              {(p.cochee || p.estCorrecte) && (
                <span className="shrink-0 text-[0.75rem] font-bold opacity-75">
                  {p.cochee && p.estCorrecte
                    ? "ta réponse, juste"
                    : p.cochee
                      ? "ta réponse"
                      : "bonne réponse"}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {q.annotation && (
        <p className="mb-3 rounded-[10px] border-l-4 border-soleil bg-soleil/10 p-3 text-[0.95rem]">
          <strong className="text-encre">Annotation de la correctrice : </strong>
          {q.annotation}
        </p>
      )}

      {/* Sur une réponse fausse : ce qui n'allait pas, et comment ne plus le
          refaire — les rubriques du plan de travail du bilan. */}
      {(q.erreur || q.aReprendre || q.methode) && (
        <div className="mb-3 space-y-1 rounded-[10px] border border-negatif/25 bg-negatif/5 p-3 text-[0.95rem]">
          {q.erreur && (
            <p className="flex gap-2">
              <span className="w-24 shrink-0 pt-0.5 text-[0.72rem] font-bold tracking-[.04em] text-negatif uppercase">
                Ton erreur
              </span>
              <span>{formaterMath(q.erreur)}</span>
            </p>
          )}
          {q.aReprendre && (
            <p className="flex gap-2">
              <span className="w-24 shrink-0 pt-0.5 text-[0.72rem] font-bold tracking-[.04em] text-positif uppercase">
                À reprendre
              </span>
              <span>{formaterMath(q.aReprendre)}</span>
            </p>
          )}
          {q.methode && (
            <p className="flex gap-2">
              <span className="w-24 shrink-0 pt-0.5 text-[0.72rem] font-bold tracking-[.04em] text-primaire uppercase">
                Méthode
              </span>
              <span>{formaterMath(q.methode)}</span>
            </p>
          )}
        </div>
      )}

      {q.correction && (
        <p className="rounded-[10px] bg-fond-doux p-3 text-[0.95rem] whitespace-pre-line">
          <strong className="text-encre">Correction : </strong>
          {formaterMath(q.correction)}
        </p>
      )}
    </div>
  );
}
