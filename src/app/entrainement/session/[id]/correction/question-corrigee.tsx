"use client";

import { useActionState, useState } from "react";
import { signalerErreur, type EtatSignalement } from "../../../actions";
import { formaterPoints } from "@/lib/scoring";

type Question = {
  questionId: string;
  type: "choix_unique" | "vrai_faux";
  enonce: string;
  chapitre: string;
  explication: string | null;
  statut: "correcte" | "incorrecte" | "abstention";
  points: number;
  reponse: Record<string, unknown> | null;
  propositions: { id: string; texte: string; est_correcte: boolean }[];
};

const ETIQUETTE = {
  correcte: { texte: "Juste", classe: "bg-primaire/10 text-primaire-fonce" },
  incorrecte: { texte: "Faux", classe: "bg-negatif/10 text-negatif" },
  abstention: { texte: "Passée", classe: "bg-fond-doux text-encre" },
} as const;

/**
 * §5.3.4 : les questions ratées ou passées sont dépliées, les réussies
 * repliées.
 */
export function QuestionCorrigee({
  numero,
  question,
}: {
  numero: number;
  question: Question;
}) {
  const [ouvert, setOuvert] = useState(question.statut !== "correcte");
  const etiquette = ETIQUETTE[question.statut];

  return (
    <div className="rounded-carte border border-ligne bg-white">
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        aria-expanded={ouvert}
        className="flex w-full cursor-pointer items-center gap-3 p-4 text-left"
      >
        <span className="font-black text-encre">{numero}</span>
        <span
          className={`rounded-full px-2.5 py-0.5 text-[0.75rem] font-bold ${etiquette.classe}`}
        >
          {etiquette.texte}
        </span>
        <span className="text-[0.8rem] font-bold opacity-70">
          {formaterPoints(question.points)}
        </span>
        <span className="line-clamp-1 flex-1 text-[0.9rem]">
          {question.enonce}
        </span>
        <span aria-hidden className="opacity-50">
          {ouvert ? "▲" : "▼"}
        </span>
      </button>

      {ouvert && (
        <div className="border-t border-ligne p-5">
          <p className="mb-4 whitespace-pre-line text-[0.95rem] text-encre">
            {question.enonce}
          </p>

          <ul className="mb-4 space-y-2">
            {question.propositions.map((p, i) => (
              <Proposition
                key={p.id}
                index={i}
                proposition={p}
                type={question.type}
                reponse={question.reponse}
              />
            ))}
          </ul>

          {question.explication ? (
            <div className="mb-4 rounded-[14px] bg-fond-doux p-4">
              <p className="mb-1 text-sm font-extrabold text-encre">
                Explication
              </p>
              <p className="text-[0.95rem] whitespace-pre-line">
                {question.explication}
              </p>
            </div>
          ) : (
            <p className="mb-4 text-[0.85rem] opacity-70">
              Pas encore d&apos;explication pour cette question.
            </p>
          )}

          <p className="mb-4 text-[0.9rem]">
            Chapitre à retravailler :{" "}
            <strong className="text-encre">{question.chapitre}</strong>
          </p>

          <Signalement questionId={question.questionId} />
        </div>
      )}
    </div>
  );
}

function Proposition({
  index,
  proposition,
  type,
  reponse,
}: {
  index: number;
  proposition: { id: string; texte: string; est_correcte: boolean };
  type: "choix_unique" | "vrai_faux";
  reponse: Record<string, unknown> | null;
}) {
  // Ce que l'élève a répondu, relu depuis le JSON stocké à la réponse.
  let jugementEleve: boolean | null = null;
  let choisie = false;

  if (reponse?.type === "vrai_faux") {
    const jugements = (reponse.jugements ?? {}) as Record<string, boolean>;
    if (proposition.id in jugements) jugementEleve = jugements[proposition.id];
  } else if (reponse?.type === "choix_unique") {
    choisie = reponse.reponseId === proposition.id;
  }

  const exact =
    type === "vrai_faux"
      ? jugementEleve !== null && jugementEleve === proposition.est_correcte
      : choisie === proposition.est_correcte;

  return (
    <li
      className={`rounded-[14px] border-2 p-3.5 ${
        proposition.est_correcte
          ? "border-primaire/40 bg-primaire/5"
          : "border-ligne"
      }`}
    >
      <div className="flex flex-wrap items-start gap-2.5">
        <span className="font-black text-encre">{index + 1}</span>
        <span className="min-w-[160px] flex-1 text-[0.95rem]">
          {proposition.texte}
        </span>

        {type === "vrai_faux" ? (
          <span className="flex shrink-0 items-center gap-2 text-[0.8rem] font-bold">
            <span className="rounded-full bg-white px-2.5 py-0.5">
              réponse : {proposition.est_correcte ? "Vrai" : "Faux"}
            </span>
            {jugementEleve === null ? (
              <span className="opacity-60">non jugée</span>
            ) : (
              <span className={exact ? "text-primaire-fonce" : "text-negatif"}>
                toi : {jugementEleve ? "Vrai" : "Faux"}
              </span>
            )}
          </span>
        ) : (
          <span className="flex shrink-0 items-center gap-2 text-[0.8rem] font-bold">
            {proposition.est_correcte && (
              <span className="rounded-full bg-white px-2.5 py-0.5">
                bonne réponse
              </span>
            )}
            {choisie && (
              <span
                className={
                  proposition.est_correcte ? "text-primaire-fonce" : "text-negatif"
                }
              >
                ton choix
              </span>
            )}
          </span>
        )}
      </div>
    </li>
  );
}

/** §5.3.4 : « Signaler une erreur » sur chaque question. */
function Signalement({ questionId }: { questionId: string }) {
  const [etat, action, enCours] = useActionState<EtatSignalement, FormData>(
    signalerErreur,
    {},
  );
  const [ouvert, setOuvert] = useState(false);

  if (etat.envoye) {
    return (
      <p className="rounded-[14px] bg-primaire/10 p-3.5 text-sm">
        Merci, c&apos;est signalé. La question est retirée des sessions le temps
        qu&apos;on la vérifie.
      </p>
    );
  }

  if (!ouvert) {
    return (
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="cursor-pointer text-sm font-bold underline opacity-75"
      >
        Signaler une erreur
      </button>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="questionId" value={questionId} />
      {etat.message && (
        <p role="alert" className="text-sm text-negatif">
          {etat.message}
        </p>
      )}
      <div>
        <label
          htmlFor={`motif-${questionId}`}
          className="mb-1.5 block text-sm font-bold text-encre"
        >
          Qu&apos;est-ce qui ne va pas ?
        </label>
        <textarea
          id={`motif-${questionId}`}
          name="motif"
          rows={3}
          placeholder="Par exemple : la proposition 2 me semble juste alors qu'elle est comptée fausse."
          className="w-full rounded-[14px] border border-ligne bg-white px-4 py-2.5 text-[0.95rem]"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={enCours}
          className="cursor-pointer rounded-full bg-primaire px-6 py-2.5 text-sm font-extrabold text-white transition hover:bg-primaire-fonce disabled:opacity-60"
        >
          {enCours ? "Envoi…" : "Envoyer le signalement"}
        </button>
        <button
          type="button"
          onClick={() => setOuvert(false)}
          className="cursor-pointer rounded-full border-2 border-ligne px-6 py-2.5 text-sm font-bold"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}
