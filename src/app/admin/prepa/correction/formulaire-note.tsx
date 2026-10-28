"use client";

import { useActionState } from "react";
import { noterReponse, type EtatCorrection } from "./actions";

export function FormulaireNote({
  passageId,
  questionId,
  maximum,
  pointsActuels,
  annotation,
}: {
  passageId: string;
  questionId: string;
  maximum: number;
  pointsActuels: number | null;
  annotation: string | null;
}) {
  const [etat, action, enCours] = useActionState<EtatCorrection, FormData>(
    noterReponse,
    {},
  );

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="passageId" value={passageId} />
      <input type="hidden" name="questionId" value={questionId} />
      <input type="hidden" name="maximum" value={maximum} />

      {etat.message && (
        <p role="alert" className="rounded-[10px] bg-negatif/10 p-3 text-sm text-negatif">
          {etat.message}
        </p>
      )}
      {etat.succes && (
        <p className="rounded-[10px] bg-primaire/10 p-3 text-sm font-bold text-primaire-fonce">
          {etat.succes}
        </p>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label
            htmlFor={`points-${questionId}`}
            className="mb-1.5 block text-sm font-bold text-encre"
          >
            Points sur {maximum}
          </label>
          <input
            id={`points-${questionId}`}
            name="points"
            type="number"
            step="0.5"
            min="0"
            max={maximum}
            defaultValue={pointsActuels ?? ""}
            className="w-28 rounded-[14px] border border-ligne bg-white px-4 py-2.5 tabular-nums"
          />
        </div>

        <div className="min-w-[240px] flex-1">
          <label
            htmlFor={`annotation-${questionId}`}
            className="mb-1.5 block text-sm font-bold text-encre"
          >
            Annotation (visible par l&apos;élève avec son bilan)
          </label>
          <input
            id={`annotation-${questionId}`}
            name="annotation"
            defaultValue={annotation ?? ""}
            placeholder="Le raisonnement est bon, la conclusion manque."
            className="w-full rounded-[14px] border border-ligne bg-white px-4 py-2.5"
          />
        </div>

        <button
          type="submit"
          disabled={enCours}
          className="cursor-pointer rounded-full bg-primaire px-6 py-2.5 font-extrabold text-white transition hover:bg-primaire-fonce disabled:cursor-wait disabled:opacity-60"
        >
          {enCours ? "…" : pointsActuels === null ? "Noter" : "Modifier"}
        </button>
      </div>
    </form>
  );
}
