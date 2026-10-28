"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { formaterMath } from "@/lib/notation-math";
import { remettreCopie, sauvegarder } from "./actions";
import type { QuestionPassage, ReponseEleveCb } from "@/lib/passage-cb";

/**
 * Composition d'une épreuve blanche (§4.3).
 *
 * Une question à la fois, navigation libre, chronomètre, abstention explicite,
 * sauvegarde continue. Le chronomètre affiché ne fait pas foi : il déclenche
 * la remise, mais c'est le serveur qui refuse une réponse en retard. Un poste
 * dont l'horloge avance ne vole rien à personne.
 */
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
  const [, demarrerTransition] = useTransition();
  const formRemise = useRef<HTMLFormElement>(null);
  const remiseLancee = useRef(false);

  const question = questions[index];
  const reponse = reponses[question.id] ?? {};

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

  const modifier = (valeur: ReponseEleveCb) => {
    const suivante = { ...reponse, ...valeur };
    setReponses((r) => ({ ...r, [question.id]: suivante }));
    enregistrer(question.id, suivante);
  };

  // --- Décompte ------------------------------------------------------------
  const minutes = Math.floor(restant / 60000);
  const secondes = Math.floor((restant % 60000) / 1000);
  const urgence = restant < 5 * 60000;

  const repondues = questions.filter((q) => {
    const r = reponses[q.id];
    return r && (r.reponseId || r.reponseIds?.length || r.texte || r.abstention);
  }).length;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[820px] flex-col px-[22px]">
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
            Question {index + 1} sur {questions.length}
          </span>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-bold">
            <input
              type="checkbox"
              checked={Boolean(reponse.aRevoir)}
              onChange={(e) => modifier({ aRevoir: e.target.checked })}
              className="size-4.5 accent-soleil"
            />
            À revoir
          </label>
        </div>

        {question.enonceCommun && (
          <p className="mb-4 rounded-carte bg-fond-doux p-4 whitespace-pre-line">
            {formaterMath(question.enonceCommun)}
          </p>
        )}

        {/* La figure n'est pas décorative : sans elle, beaucoup de questions
            scientifiques n'ont pas de sens. Si elle manque, on le dit à l'élève
            plutôt que de le laisser chercher — mais sans lui montrer un chemin
            de stockage, qui ne lui apprendrait rien. */}
        {question.figureUrl && (
          <figure className="mb-5">
            {/* eslint-disable-next-line @next/next/no-img-element -- URL signée temporaire */}
            <img
              src={question.figureUrl}
              alt="Figure de la question"
              className="w-full rounded-carte border border-ligne bg-white"
            />
          </figure>
        )}
        {question.figureManquante && (
          <p
            role="alert"
            className="mb-5 rounded-carte border-2 border-negatif bg-negatif/5 p-4 text-sm text-negatif"
          >
            La figure de cette question n&apos;a pas pu être chargée. Préviens
            ton surveillant : ta copie est enregistrée, tu peux passer à la
            suite et y revenir.
          </p>
        )}

        <p className="mb-5 text-[1.05rem] whitespace-pre-line">
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
          className={`mt-4 cursor-pointer rounded-full border-2 px-6 py-2.5 font-bold transition ${
            reponse.abstention
              ? "border-encre bg-encre text-white"
              : "border-ligne hover:bg-fond-doux"
          }`}
        >
          {reponse.abstention ? "Tu ne réponds pas à cette question" : "Je ne réponds pas"}
        </button>
      </main>

      {/* Navigation */}
      <nav className="sticky bottom-0 border-t border-ligne bg-white py-4">
        <div className="mb-3 flex flex-wrap gap-1.5">
          {questions.map((q, i) => {
            const r = reponses[q.id];
            const traitee = r && (r.reponseId || r.reponseIds?.length || r.texte || r.abstention);
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => setIndex(i)}
                aria-current={i === index}
                aria-label={`Question ${i + 1}${traitee ? ", traitée" : ""}${r?.aRevoir ? ", à revoir" : ""}`}
                className={`size-8 cursor-pointer rounded-[8px] text-[0.75rem] font-bold transition ${
                  i === index
                    ? "bg-primaire text-white"
                    : r?.aRevoir
                      ? "bg-soleil/40 text-encre"
                      : traitee
                        ? "bg-fond-doux text-encre"
                        : "border border-ligne text-encre"
                }`}
              >
                {i + 1}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            disabled={index === 0}
            className="cursor-pointer rounded-full border-2 border-ligne px-6 py-2.5 font-bold disabled:opacity-40"
          >
            Précédente
          </button>
          <button
            type="button"
            onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))}
            disabled={index === questions.length - 1}
            className="cursor-pointer rounded-full border-2 border-primaire px-6 py-2.5 font-extrabold text-primaire disabled:opacity-40"
          >
            Suivante
          </button>

          <form action={remettreCopie} ref={formRemise} className="ml-auto">
            <input type="hidden" name="epreuveId" value={epreuveId} />
            <button
              type="submit"
              className="cursor-pointer rounded-full bg-primaire px-7 py-3 font-extrabold text-white transition hover:bg-primaire-fonce"
            >
              Remettre ma copie
            </button>
          </form>
        </div>
      </nav>
    </div>
  );
}
