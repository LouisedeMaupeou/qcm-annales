"use client";

import { useState } from "react";
import { repondre } from "../../actions";
import type { QuestionJouable } from "@/lib/session-entrainement";

/**
 * Rendu selon le type (§5.3.3) : radio pour le choix unique, bascule Vrai/Faux
 * par proposition pour le vrai/faux.
 */
export function CarteQuestion({
  sessionId,
  question,
}: {
  sessionId: string;
  question: QuestionJouable;
}) {
  const [choix, setChoix] = useState<string | null>(null);
  const [jugements, setJugements] = useState<Record<string, boolean>>({});
  const [envoi, setEnvoi] = useState(false);

  const complet =
    question.type === "choix_unique"
      ? choix !== null
      : question.propositions.every((p) => p.id in jugements);

  return (
    <form
      action={repondre}
      onSubmit={() => setEnvoi(true)}
      className="rounded-carte border border-ligne bg-white p-5 sm:p-7"
    >
      <input type="hidden" name="sessionId" value={sessionId} />
      <input
        type="hidden"
        name="sessionQuestionId"
        value={question.sessionQuestionId}
      />

      {question.tailleBloc > 1 && (
        <p className="mb-4 rounded-[14px] bg-fond-doux px-4 py-2.5 text-sm font-bold text-encre">
          Exercice lié — partie {question.rangDansBloc + 1} sur{" "}
          {question.tailleBloc}
        </p>
      )}

      {question.enonceCommun && (
        <p className="mb-4 rounded-[14px] bg-fond-doux p-4 text-[0.95rem]">
          {question.enonceCommun}
        </p>
      )}

      <p className="mb-6 text-[1.05rem] whitespace-pre-line text-encre">
        {question.enonce}
      </p>

      {question.type === "choix_unique" ? (
        <fieldset className="mb-6 space-y-2.5">
          <legend className="sr-only">Choisis une réponse</legend>
          {question.propositions.map((p) => (
            <label
              key={p.id}
              className={`flex cursor-pointer items-start gap-3 rounded-[14px] border-2 p-4 transition ${
                choix === p.id
                  ? "border-primaire bg-primaire/5"
                  : "border-ligne hover:bg-fond-doux"
              }`}
            >
              <input
                type="radio"
                name="reponseId"
                value={p.id}
                checked={choix === p.id}
                onChange={() => setChoix(p.id)}
                className="mt-1 size-4.5 shrink-0 accent-primaire"
              />
              <span>{p.texte}</span>
            </label>
          ))}
        </fieldset>
      ) : (
        <div className="mb-6 space-y-3">
          <p className="text-sm">
            Juge chaque proposition. La question n&apos;est comptée juste que si
            les {question.propositions.length} jugements sont exacts.
          </p>
          {question.propositions.map((p, i) => (
            <fieldset
              key={p.id}
              className="rounded-[14px] border-2 border-ligne p-4"
            >
              <legend className="sr-only">Proposition {i + 1}</legend>
              <p className="mb-3 flex gap-2.5">
                <span className="font-black text-encre">{i + 1}</span>
                <span>{p.texte}</span>
              </p>
              <div className="flex gap-2">
                {(["vrai", "faux"] as const).map((v) => {
                  const actif = jugements[p.id] === (v === "vrai");
                  return (
                    <label
                      key={v}
                      className={`flex-1 cursor-pointer rounded-full border-2 px-4 py-2 text-center font-extrabold transition ${
                        actif
                          ? "border-primaire bg-primaire text-white"
                          : "border-ligne hover:bg-fond-doux"
                      }`}
                    >
                      <input
                        type="radio"
                        name={`jugement-${p.id}`}
                        value={v}
                        checked={actif}
                        onChange={() =>
                          setJugements((j) => ({ ...j, [p.id]: v === "vrai" }))
                        }
                        className="sr-only"
                      />
                      {v === "vrai" ? "Vrai" : "Faux"}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3 border-t border-ligne pt-5 sm:flex-row-reverse">
        <button
          type="submit"
          disabled={!complet || envoi}
          className="flex-1 cursor-pointer rounded-full bg-primaire px-8 py-3.5 font-extrabold text-white transition hover:bg-primaire-fonce disabled:cursor-not-allowed disabled:opacity-40"
        >
          {envoi ? "Enregistrement…" : "Valider"}
        </button>

        {/* §2.5 : l'abstention est un geste stratégique quand les points
            négatifs existent, le bouton reste toujours accessible. */}
        <button
          type="submit"
          name="abstention"
          value="1"
          disabled={envoi}
          className="cursor-pointer rounded-full border-2 border-ligne px-8 py-3.5 font-bold text-encre transition hover:bg-fond-doux disabled:opacity-40"
        >
          Je ne réponds pas
        </button>
      </div>

      {!complet && question.type === "vrai_faux" && (
        <p className="mt-3 text-center text-[0.85rem] opacity-70">
          Juge les {question.propositions.length} propositions pour valider, ou
          passe.
        </p>
      )}
    </form>
  );
}
