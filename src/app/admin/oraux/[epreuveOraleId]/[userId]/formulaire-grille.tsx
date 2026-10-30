"use client";

import { useActionState, useState } from "react";
import { noteEpreuveOrale, type CritereOral, type NotesCriteres } from "@/lib/oraux";
import { enregistrerEvaluation, type EtatOral } from "../../actions";

/**
 * Grille d'évaluation d'un oral blanc.
 *
 * Chaque critère porte son indicateur observable, repris du référentiel : le
 * jury doit pouvoir noter sans avoir le classeur ouvert à côté. La note
 * s'affiche en direct, mais celle qui compte est recalculée par le serveur à
 * l'enregistrement.
 */
export function FormulaireGrille({
  epreuveOraleId,
  eleveId,
  criteres,
  libelleContexte,
  contexte,
  notes,
  note: noteEnregistree,
  pointFort,
  progresPrioritaire,
  commentaireJury,
  statut,
}: {
  epreuveOraleId: string;
  eleveId: string;
  criteres: CritereOral[];
  libelleContexte: string;
  contexte: string;
  notes: NotesCriteres;
  note: number | null;
  pointFort: string;
  progresPrioritaire: string;
  commentaireJury: string;
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

  const chiffrees: NotesCriteres = Object.fromEntries(
    Object.entries(saisie).map(([k, v]) => [
      k,
      v.trim() === "" ? null : Number(v.replace(",", ".")),
    ]),
  );
  const apercu = noteEpreuveOrale(criteres, chiffrees);
  const maximum = criteres.reduce((s, c) => s + c.maximum, 0);
  const manquants = criteres.filter((_, i) => chiffrees[String(i)] === null).length;

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
        <label htmlFor="contexte" className="mb-1.5 block font-extrabold text-encre">
          {libelleContexte}
        </label>
        <input
          id="contexte"
          name="contexte"
          defaultValue={contexte}
          className="w-full rounded-[14px] border border-ligne bg-white px-4 py-2.5"
        />
      </section>

      <section className="rounded-carte border border-ligne p-5">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-lg font-extrabold">Les {criteres.length} critères</h2>
          <p className="text-sm">
            Note :{" "}
            <strong className="text-xl text-encre tabular-nums">
              {apercu}/{maximum}
            </strong>
            {noteEnregistree !== null && apercu !== noteEnregistree && (
              <span className="ml-2 opacity-70">(enregistrée : {noteEnregistree})</span>
            )}
          </p>
        </div>

        <ul className="space-y-4">
          {criteres.map((c, i) => (
            <li key={i} className="flex flex-wrap items-start gap-4">
              <div className="min-w-[300px] flex-1">
                <label htmlFor={`critere-${i}`} className="font-bold text-encre">
                  {c.libelle}
                </label>
                <p className="text-[0.85rem] opacity-75">{c.indicateur}</p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id={`critere-${i}`}
                  name={`critere-${i}`}
                  type="number"
                  step="0.5"
                  min="0"
                  max={c.maximum}
                  value={saisie[String(i)] ?? ""}
                  onChange={(e) =>
                    setSaisie((s) => ({ ...s, [String(i)]: e.target.value }))
                  }
                  className="w-24 rounded-[14px] border border-ligne bg-white px-4 py-2.5 tabular-nums"
                />
                <span className="text-sm opacity-70">/ {c.maximum}</span>
              </div>
            </li>
          ))}
        </ul>

        {manquants > 0 && (
          <p className="mt-4 rounded-[10px] bg-soleil/15 p-3 text-[0.85rem]">
            {manquants} critère{manquants > 1 ? "s" : ""} non noté
            {manquants > 1 ? "s" : ""} : une case vide compte zéro dans la note.
            La validation les exigera tous.
          </p>
        )}
      </section>

      <section className="rounded-carte border border-ligne p-5">
        <h2 className="mb-4 text-lg font-extrabold">Retour du jury</h2>

        <div className="space-y-4">
          <div>
            <label htmlFor="pointFort" className="mb-1.5 block font-bold text-encre">
              Point fort
            </label>
            <textarea
              id="pointFort"
              name="pointFort"
              defaultValue={pointFort}
              rows={3}
              className="w-full rounded-[14px] border border-ligne bg-white px-4 py-3"
            />
          </div>

          <div>
            <label
              htmlFor="progresPrioritaire"
              className="mb-1.5 block font-bold text-encre"
            >
              Progrès prioritaire
            </label>
            <textarea
              id="progresPrioritaire"
              name="progresPrioritaire"
              defaultValue={progresPrioritaire}
              rows={3}
              className="w-full rounded-[14px] border border-ligne bg-white px-4 py-3"
            />
          </div>

          <div>
            <label
              htmlFor="commentaireJury"
              className="mb-1.5 block font-bold text-encre"
            >
              Commentaire du jury
            </label>
            <textarea
              id="commentaireJury"
              name="commentaireJury"
              defaultValue={commentaireJury}
              rows={4}
              className="w-full rounded-[14px] border border-ligne bg-white px-4 py-3"
            />
          </div>
        </div>

        <p className="mt-3 text-[0.85rem] opacity-75">
          Ces trois champs apparaissent dans la section « Oraux blancs » du
          bilan envoyé à la famille.
        </p>
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

        <span className="text-sm opacity-75">
          {statut === "validee"
            ? "déjà validée — elle entre dans le bilan, tu peux encore la corriger"
            : "un brouillon n'entre pas dans le bilan"}
        </span>
      </div>
    </form>
  );
}
