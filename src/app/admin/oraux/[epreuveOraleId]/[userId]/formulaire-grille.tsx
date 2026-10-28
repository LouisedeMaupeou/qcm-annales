"use client";

import { useActionState, useState } from "react";
import { noteGlobale, type Critere, type NotesCriteres } from "@/lib/oraux";
import { enregistrerEvaluation, type EtatOral } from "../../actions";

/**
 * Saisie d'une grille d'oral.
 *
 * La note globale s'affiche en direct pendant la saisie, mais celle qui
 * compte est recalculée par le serveur à l'enregistrement : l'affichage aide
 * le professeur, il ne décide pas de la note portée au bilan.
 */
export function FormulaireGrille({
  epreuveOraleId,
  eleveId,
  criteres,
  notes,
  appreciation,
  recommandation,
  noteGlobale: noteEnregistree,
  statut,
}: {
  epreuveOraleId: string;
  eleveId: string;
  criteres: Critere[];
  notes: NotesCriteres;
  appreciation: string;
  recommandation: string;
  noteGlobale: number | null;
  statut: "brouillon" | "validee";
}) {
  const [saisie, setSaisie] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      criteres.map((_, i) => [String(i), notes[String(i)]?.toString() ?? ""]),
    ),
  );
  const [etat, action, enCours] = useActionState<EtatOral, FormData>(
    enregistrerEvaluation,
    {},
  );

  const apercu = noteGlobale(
    criteres,
    Object.fromEntries(
      Object.entries(saisie).map(([k, v]) => [
        k,
        v.trim() === "" ? null : Number(v.replace(",", ".")),
      ]),
    ),
  );

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="epreuveOraleId" value={epreuveOraleId} />
      <input type="hidden" name="eleveId" value={eleveId} />

      {etat.message && (
        <p role="alert" className="rounded-carte bg-negatif/10 p-4 text-sm text-negatif">
          {etat.message}
        </p>
      )}
      {etat.succes && (
        <p className="rounded-carte bg-primaire/10 p-4 text-sm font-bold text-primaire-fonce">
          {etat.succes}
        </p>
      )}

      <section className="rounded-carte border border-ligne p-5">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-lg font-extrabold">Critères</h2>
          <p className="text-sm">
            Note calculée :{" "}
            <strong className="text-xl text-encre tabular-nums">
              {apercu === null ? "—" : `${apercu}/20`}
            </strong>
            {noteEnregistree !== null && apercu !== noteEnregistree && (
              <span className="ml-2 opacity-70">
                (enregistrée : {noteEnregistree}/20)
              </span>
            )}
          </p>
        </div>

        <ul className="space-y-3">
          {criteres.map((c, i) => (
            <li key={i} className="flex flex-wrap items-center gap-3">
              <label
                htmlFor={`critere-${i}`}
                className="min-w-[260px] flex-1 font-bold text-encre"
              >
                {c.libelle}
                {c.ponderation !== 1 && (
                  <span className="ml-2 text-[0.8rem] font-normal opacity-70">
                    coefficient {c.ponderation}
                  </span>
                )}
              </label>
              <input
                id={`critere-${i}`}
                name={`critere-${i}`}
                type="number"
                step="0.5"
                min="0"
                max={c.echelle}
                value={saisie[String(i)] ?? ""}
                onChange={(e) =>
                  setSaisie((s) => ({ ...s, [String(i)]: e.target.value }))
                }
                className="w-24 rounded-[14px] border border-ligne bg-white px-4 py-2.5 tabular-nums"
              />
              <span className="text-sm opacity-70">/ {c.echelle}</span>
            </li>
          ))}
        </ul>

        <p className="mt-4 text-[0.85rem] opacity-75">
          Un critère laissé vide est écarté du calcul, il ne compte pas zéro —
          c&apos;est ce qui permet de ne pas pénaliser un élève sur un critère
          qu&apos;on ne lui a pas soumis.
        </p>
      </section>

      <section className="rounded-carte border border-ligne p-5">
        <label htmlFor="appreciation" className="mb-1.5 block font-extrabold text-encre">
          Appréciation
        </label>
        <textarea
          id="appreciation"
          name="appreciation"
          defaultValue={appreciation}
          rows={5}
          className="mb-4 w-full rounded-[14px] border border-ligne bg-white px-4 py-3"
        />

        <label htmlFor="recommandation" className="mb-1.5 block font-extrabold text-encre">
          Recommandation de travail
        </label>
        <textarea
          id="recommandation"
          name="recommandation"
          defaultValue={recommandation}
          rows={3}
          className="w-full rounded-[14px] border border-ligne bg-white px-4 py-3"
        />
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={enCours}
          className="cursor-pointer rounded-full border-2 border-primaire px-7 py-3 font-extrabold text-primaire transition hover:bg-fond-doux disabled:cursor-wait disabled:opacity-60"
        >
          {enCours ? "Enregistrement…" : "Enregistrer le brouillon"}
        </button>

        <button
          type="submit"
          name="valider"
          value="oui"
          disabled={enCours}
          className="cursor-pointer rounded-full bg-primaire px-7 py-3 font-extrabold text-white transition hover:bg-primaire-fonce disabled:cursor-wait disabled:opacity-60"
        >
          Valider l&apos;évaluation
        </button>

        {statut === "validee" && (
          <span className="rounded-full bg-primaire/10 px-4 py-2 text-sm font-bold text-primaire-fonce">
            déjà validée — tu peux encore la corriger
          </span>
        )}
      </div>
    </form>
  );
}
