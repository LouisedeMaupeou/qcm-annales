"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { libellePiece, rassemblerDossier } from "@/lib/dossier-passage";
import { grouperParExercice } from "@/lib/groupes-passage";
import { formaterMath } from "@/lib/notation-math";
import { remettreCopie, sauvegarder } from "./actions";
import type { PieceDossier } from "@/lib/dossier-passage";
import type { QuestionPassage, ReponseEleveCb } from "@/lib/passage-cb";

/**
 * Composition d'une épreuve blanche (§4.3).
 *
 * Un exercice à la fois, navigation libre, chronomètre, abstention explicite,
 * sauvegarde continue. Le chronomètre affiché ne fait pas foi : il déclenche
 * la remise, mais c'est le serveur qui refuse une réponse en retard. Un poste
 * dont l'horloge avance ne vole rien à personne.
 *
 * L'écran montre un exercice entier, pas une sous-question. Les quatre
 * propositions d'un exercice Puissance Alpha se jugent les unes par rapport
 * aux autres, et les sous-questions d'une question à trous sont notées tout ou
 * rien : les présenter sur quatre écrans séparés demandait à l'élève de
 * retenir ce qu'il venait de lire, et lui cachait que son barème les liait.
 */

const estTraitee = (r: ReponseEleveCb | undefined) =>
  Boolean(r && (r.reponseId || r.reponseIds?.length || r.texte || r.abstention));

export function Composer({
  epreuveId,
  concours,
  matiere,
  finLe,
  questions,
}: {
  epreuveId: string;
  concours: string;
  matiere: string;
  finLe: string;
  questions: QuestionPassage[];
}) {
  const groupes = useMemo(() => grouperParExercice(questions), [questions]);

  // Le dossier appartient à l'épreuve, pas à la question : il est rassemblé
  // une fois et ne bouge plus. Un passage propre à un exercice, lui, suit son
  // exercice.
  const dossier = useMemo(() => rassemblerDossier(questions), [questions]);

  const [index, setIndex] = useState(0);
  const [reponses, setReponses] = useState<Record<string, ReponseEleveCb>>(() =>
    Object.fromEntries(
      questions.filter((q) => q.reponse).map((q) => [q.id, q.reponse as ReponseEleveCb]),
    ),
  );
  const [restant, setRestant] = useState(() =>
    Math.max(0, new Date(finLe).getTime() - Date.now()),
  );
  const [etatSauvegarde, setEtatSauvegarde] = useState<"ok" | "en_cours" | "echec">("ok");
  const [confirmeRemise, setConfirmeRemise] = useState(false);
  const [, demarrerTransition] = useTransition();
  const formRemise = useRef<HTMLFormElement>(null);
  const remiseLancee = useRef(false);

  const groupe = groupes[index] ?? [];
  const tete = groupe[0];

  // --- Chronomètre ---------------------------------------------------------
  useEffect(() => {
    const t = setInterval(() => {
      const reste = Math.max(0, new Date(finLe).getTime() - Date.now());
      setRestant(reste);
      // §4.3 : remise automatique à expiration. Une seule fois.
      if (reste === 0 && !remiseLancee.current) {
        remiseLancee.current = true;
        formRemise.current?.requestSubmit();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [finLe]);

  // --- Sauvegarde continue -------------------------------------------------
  const enregistrer = useCallback(
    (questionId: string, valeur: ReponseEleveCb) => {
      setEtatSauvegarde("en_cours");
      const donnees = new FormData();
      donnees.set("epreuveId", epreuveId);
      donnees.set("questionId", questionId);
      donnees.set("reponse", JSON.stringify(valeur));

      demarrerTransition(async () => {
        const resultat = await sauvegarder({}, donnees);
        if (resultat.refus === "expire" || resultat.refus === "deja_remis") {
          if (!remiseLancee.current) {
            remiseLancee.current = true;
            formRemise.current?.requestSubmit();
          }
          return;
        }
        setEtatSauvegarde(resultat.refus ? "echec" : "ok");
      });
    },
    [epreuveId],
  );

  /** Chaque sous-question garde sa propre réponse : le barème les distingue. */
  const modifier = (questionId: string, valeur: ReponseEleveCb) => {
    const suivante = { ...(reponses[questionId] ?? {}), ...valeur };
    setReponses((r) => ({ ...r, [questionId]: suivante }));
    enregistrer(questionId, suivante);
  };

  // --- Décompte ------------------------------------------------------------
  const minutes = Math.floor(restant / 60000);
  const secondes = Math.floor((restant % 60000) / 1000);
  const urgence = restant < 5 * 60000;

  const repondues = questions.filter((q) => estTraitee(reponses[q.id])).length;
  const aRevoirIci = groupe.some((q) => reponses[q.id]?.aRevoir);

  // Numéro de la première sous-question de l'exercice, pour que l'élève
  // retrouve la numérotation du sujet papier.
  const premiere = questions.indexOf(tete) + 1;

  // Un dossier à lire change la mise en page : il passe à gauche, dans sa
  // propre colonne qui défile, et les questions occupent la droite. Sans
  // dossier, une colonne large nuirait à la lecture de l'énoncé.
  const aDossier = Boolean(tete?.enonceCommun) || dossier.length > 0;

  return (
    <div
      className={`mx-auto flex min-h-dvh w-full flex-col px-[22px] ${
        aDossier ? "max-w-[1400px]" : "max-w-[820px]"
      }`}
    >
      {/* Bandeau : pas de lien de navigation, on ne quitte pas une épreuve par
          distraction. */}
      <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-ligne bg-white py-4">
        <div>
          <p className="font-black text-encre">
            {concours} — {matiere}
          </p>
          <p className="text-[0.85rem] opacity-70">
            {repondues} / {questions.length} traitées ·{" "}
            {etatSauvegarde === "en_cours"
              ? "enregistrement…"
              : etatSauvegarde === "echec"
                ? "⚠ dernière réponse non enregistrée"
                : "réponses enregistrées"}
          </p>
        </div>
        <p
          aria-live="polite"
          className={`rounded-full px-4 py-2 font-black tabular-nums ${
            urgence ? "bg-negatif/10 text-negatif" : "bg-fond-doux text-encre"
          }`}
        >
          {String(minutes).padStart(2, "0")}:{String(secondes).padStart(2, "0")}
        </p>
      </header>

      <main className="flex-1 py-6">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className="text-sm font-extrabold tracking-[.08em] text-primaire-fonce uppercase">
            {groupe.length > 1
              ? `Exercice ${index + 1} sur ${groupes.length} · questions ${premiere} à ${premiere + groupe.length - 1}`
              : `Question ${premiere} sur ${questions.length}`}
          </span>
          {/* Marque-page de l'élève, et rien d'autre : il colore la pastille de
              navigation et n'entre dans aucun calcul de note. L'intitulé
              « À revoir » laissait croire à un signalement au correcteur. */}
          <label
            className="flex cursor-pointer items-center gap-2 text-sm font-bold"
            title="Marque cet exercice pour y revenir avant de remettre. Sans effet sur ta note."
          >
            <input
              type="checkbox"
              checked={aRevoirIci}
              onChange={(e) =>
                groupe.forEach((q) => modifier(q.id, { aRevoir: e.target.checked }))
              }
              className="size-4.5 accent-soleil"
            />
            Marquer pour y revenir
          </label>
        </div>

        <div
          className={
            aDossier
              ? "lg:grid lg:grid-cols-[minmax(0,46%)_minmax(0,1fr)] lg:items-start lg:gap-9"
              : ""
          }
        >
          {aDossier && (
            <PanneauDossier
              enonceCommun={tete?.enonceCommun ?? null}
              pieces={dossier}
            />
          )}

          <ol className="space-y-7">
            {groupe.map((q, rang) => (
              <li key={q.id}>
                <SousQuestion
                  question={q}
                  numero={premiere + rang}
                  lettre={groupe.length > 1 ? "ABCDEFGH"[rang] : null}
                  reponse={reponses[q.id] ?? {}}
                  modifier={(valeur) => modifier(q.id, valeur)}
                />
              </li>
            ))}
          </ol>
        </div>
      </main>

      {/* Navigation */}
      <nav className="sticky bottom-0 border-t border-ligne bg-white py-4">
        <div className="mb-3 flex flex-wrap gap-1.5">
          {groupes.map((g, i) => {
            const traitees = g.filter((q) => estTraitee(reponses[q.id])).length;
            const complet = traitees === g.length;
            const aRevoir = g.some((q) => reponses[q.id]?.aRevoir);
            return (
              <button
                key={g[0].id}
                type="button"
                onClick={() => setIndex(i)}
                aria-current={i === index}
                aria-label={`Exercice ${i + 1}, ${traitees} sur ${g.length} traitée(s)${aRevoir ? ", à revoir" : ""}`}
                className={`size-8 cursor-pointer rounded-[8px] text-[0.75rem] font-bold transition ${
                  i === index
                    ? "bg-primaire text-white"
                    : aRevoir
                      ? "bg-soleil/40 text-encre"
                      : complet
                        ? "bg-fond-doux text-encre"
                        : traitees > 0
                          ? "border-2 border-soleil text-encre"
                          : "border border-ligne text-encre"
                }`}
              >
                {i + 1}
              </button>
            );
          })}
        </div>

        {confirmeRemise && (
          <p
            role="alert"
            className="mb-3 rounded-carte border-2 border-soleil bg-soleil/10 p-4 text-sm"
          >
            <strong className="text-encre">La remise est définitive.</strong>{" "}
            Tu ne pourras plus revenir sur tes réponses, et ni score ni corrigé
            ne s&apos;afficheront : ton bilan arrive après la correction.
            {repondues < questions.length && (
              <>
                {" "}
                Il te reste{" "}
                <strong className="text-negatif">
                  {questions.length - repondues} question
                  {questions.length - repondues > 1 ? "s" : ""} sans réponse
                </strong>
                .
              </>
            )}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            disabled={index === 0}
            className="cursor-pointer rounded-full border-2 border-ligne px-6 py-2.5 font-bold disabled:opacity-40"
          >
            Précédent
          </button>
          <button
            type="button"
            onClick={() => setIndex((i) => Math.min(groupes.length - 1, i + 1))}
            disabled={index === groupes.length - 1}
            className="cursor-pointer rounded-full border-2 border-primaire px-6 py-2.5 font-extrabold text-primaire disabled:opacity-40"
          >
            Suivant
          </button>

          {/* La remise est définitive : on la fait confirmer, et on dit au
              passage ce qui reste en suspens — une question oubliée se
              rattrape avant la remise, jamais après. Le formulaire reste
              monté pour que la remise automatique à l'expiration du
              chronomètre continue de fonctionner sans confirmation. */}
          <form action={remettreCopie} ref={formRemise} className="ml-auto">
            <input type="hidden" name="epreuveId" value={epreuveId} />
            {confirmeRemise ? (
              <div className="flex flex-wrap items-center justify-end gap-3">
                <span className="text-sm font-bold text-encre">
                  Es-tu sûr de vouloir remettre ta copie ?
                </span>
                <button
                  type="button"
                  onClick={() => setConfirmeRemise(false)}
                  className="cursor-pointer rounded-full border-2 border-ligne px-6 py-2.5 font-bold"
                >
                  Non
                </button>
                <button
                  type="submit"
                  className="cursor-pointer rounded-full bg-primaire px-7 py-3 font-extrabold text-white transition hover:bg-primaire-fonce"
                >
                  Oui, remettre
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmeRemise(true)}
                className="cursor-pointer rounded-full bg-primaire px-7 py-3 font-extrabold text-white transition hover:bg-primaire-fonce"
              >
                Remettre ma copie
              </button>
            )}
          </form>
        </div>
      </nav>
    </div>
  );
}

/**
 * Le dossier de l'exercice : textes, encarts, bibliographie.
 *
 * Il occupe la colonne de gauche et défile pour lui-même, pendant que les
 * questions restent en place à droite. C'est la situation réelle de l'épreuve
 * d'analyse documentaire : on relit un passage en gardant la question sous les
 * yeux. Faire défiler toute la page obligerait à perdre l'un pour retrouver
 * l'autre, vingt fois par épreuve.
 *
 * Sous la largeur de bascule, les deux colonnes s'empilent : le dossier garde
 * sa propre zone de défilement, bornée en hauteur, pour que les questions
 * restent atteignables sans traverser quarante pages de texte.
 */
function PanneauDossier({
  enonceCommun,
  pieces,
}: {
  enonceCommun: string | null;
  pieces: PieceDossier[];
}) {
  return (
    <aside
      aria-label="Dossier documentaire"
      className="mb-6 max-h-[55vh] overflow-y-auto rounded-carte border border-ligne bg-fond-doux/40 p-5 lg:sticky lg:top-[96px] lg:mb-0 lg:max-h-[calc(100dvh-13rem)]"
    >
      <h2 className="mb-3 text-sm font-extrabold tracking-[.08em] text-primaire-fonce uppercase">
        Dossier
      </h2>

      {enonceCommun && (
        <p className="mb-5 text-[0.98rem] leading-relaxed whitespace-pre-line">
          {formaterMath(enonceCommun)}
        </p>
      )}

      {pieces.map((d, i) => (
        <figure key={`${d.titre ?? "doc"}-${i}`} className="mb-5 last:mb-0">
          {libellePiece(d.titre) && (
            <figcaption className="mb-1.5 font-extrabold text-encre">
              {libellePiece(d.titre)}
            </figcaption>
          )}
          {d.url ? (
            // eslint-disable-next-line @next/next/no-img-element -- URL signée temporaire
            <img
              src={d.url}
              alt={libellePiece(d.titre) ?? `Document ${i + 1}`}
              className="w-full rounded-[10px] border border-ligne bg-white"
            />
          ) : (
            <p
              role="alert"
              className="rounded-[10px] border-2 border-negatif bg-negatif/5 p-3 text-sm text-negatif"
            >
              Ce document n&apos;a pas pu être chargé. Préviens ton surveillant :
              ta copie est enregistrée.
            </p>
          )}
        </figure>
      ))}
    </aside>
  );
}

/**
 * Une sous-question : son énoncé, sa figure, ses propositions, son abstention.
 *
 * Elle porte sa propre réponse même quand elle partage l'écran avec ses
 * voisines — l'élève peut très bien trancher la proposition A et s'abstenir
 * sur la B, et le barème compte chacune séparément avant de les regrouper.
 */
function SousQuestion({
  question,
  numero,
  lettre,
  reponse,
  modifier,
}: {
  question: QuestionPassage;
  numero: number;
  lettre: string | null;
  reponse: ReponseEleveCb;
  modifier: (valeur: ReponseEleveCb) => void;
}) {
  return (
    <div className={lettre ? "border-l-2 border-ligne pl-4" : ""}>
      {/* La figure n'est pas décorative : sans elle, beaucoup de questions
          scientifiques n'ont pas de sens. Si elle manque, on le dit à l'élève
          plutôt que de le laisser chercher — mais sans lui montrer un chemin
          de stockage, qui ne lui apprendrait rien. */}
      {question.figureUrl && (
        <figure className="mb-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- URL signée temporaire */}
          <img
            src={question.figureUrl}
            alt={`Figure de la question ${numero}`}
            className="w-full rounded-carte border border-ligne bg-white"
          />
        </figure>
      )}
      {question.figureManquante && (
        <p
          role="alert"
          className="mb-4 rounded-carte border-2 border-negatif bg-negatif/5 p-4 text-sm text-negatif"
        >
          La figure de cette question n&apos;a pas pu être chargée. Préviens ton
          surveillant : ta copie est enregistrée, tu peux passer à la suite et y
          revenir.
        </p>
      )}

      <p className="mb-4 text-[1.05rem] whitespace-pre-line">
        {lettre && <strong className="mr-2 text-primaire-fonce">{lettre}.</strong>}
        {formaterMath(question.enonce)}
      </p>

      {question.type === "redaction" ? (
        <textarea
          value={reponse.texte ?? ""}
          onChange={(e) => modifier({ texte: e.target.value, abstention: false })}
          rows={10}
          placeholder="Rédige ta réponse ici."
          className="w-full rounded-carte border border-ligne bg-white px-4 py-3"
        />
      ) : (
        <ul className="space-y-3">
          {question.propositions.map((p, i) => {
            const choisie =
              question.type === "choix_multiple"
                ? (reponse.reponseIds ?? []).includes(p.id)
                : reponse.reponseId === p.id;

            return (
              <li key={p.id}>
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-carte border-2 p-4 transition ${
                    choisie ? "border-primaire bg-fond-doux/60" : "border-ligne bg-white"
                  }`}
                >
                  <input
                    type={question.type === "choix_multiple" ? "checkbox" : "radio"}
                    name={`q-${question.id}`}
                    checked={choisie}
                    onChange={() => {
                      if (question.type === "choix_multiple") {
                        const actuelles = new Set(reponse.reponseIds ?? []);
                        if (actuelles.has(p.id)) actuelles.delete(p.id);
                        else actuelles.add(p.id);
                        modifier({ reponseIds: [...actuelles], abstention: false });
                      } else {
                        modifier({ reponseId: p.id, abstention: false });
                      }
                    }}
                    className="mt-1 size-4.5 shrink-0 accent-primaire"
                  />
                  <span>
                    <strong className="mr-2 text-encre">{"ABCDEF"[i]}.</strong>
                    {formaterMath(p.texte)}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {/* §4.3 : l'abstention est un choix, pas une absence de choix. */}
      <button
        type="button"
        onClick={() =>
          modifier({
            abstention: true,
            reponseId: undefined,
            reponseIds: [],
            texte: "",
          })
        }
        className={`mt-4 cursor-pointer rounded-full border-2 px-6 py-2.5 text-sm font-bold transition ${
          reponse.abstention
            ? "border-encre bg-encre text-white"
            : "border-ligne hover:bg-fond-doux"
        }`}
      >
        {reponse.abstention ? "Tu ne réponds pas" : "Je ne réponds pas"}
      </button>
    </div>
  );
}
