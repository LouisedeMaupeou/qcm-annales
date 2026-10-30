"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { formaterMath } from "@/lib/notation-math";
import { validerEnMasse, type EtatMasse } from "./actions";

export type LigneRelecture = {
  id: string;
  enonce: string;
  chapitre: string;
  origine: string;
  confiance: number | null;
  commentaire: string | null;
  nbSignalements: number;
  premierMotif: string | null;
};

/**
 * File de relecture avec sélection multiple (§6.1).
 *
 * La carte n'est plus un lien entier : une case à cocher y cohabite avec le
 * lien vers la fiche, et un clic sur l'un ne doit pas déclencher l'autre. Le
 * lien reste donc circonscrit au texte de la question.
 */
export function ListeRelecture({
  questions,
  seuil,
}: {
  questions: LigneRelecture[];
  seuil: number;
}) {
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [confirme, setConfirme] = useState(false);
  const [etat, action, enCours] = useActionState<EtatMasse, FormData>(
    validerEnMasse,
    {},
  );

  const visibles = useMemo(() => questions.map((q) => q.id), [questions]);
  const toutes = selection.size > 0 && visibles.every((id) => selection.has(id));

  const basculer = (id: string) => {
    setConfirme(false);
    setSelection((s) => {
      const suivant = new Set(s);
      if (suivant.has(id)) suivant.delete(id);
      else suivant.add(id);
      return suivant;
    });
  };

  const toutBasculer = () => {
    setConfirme(false);
    setSelection(toutes ? new Set() : new Set(visibles));
  };

  return (
    <form action={action}>
      {/* Rapport du lot précédent */}
      {etat.message && (
        <p role="alert" className="mb-4 rounded-carte bg-negatif/10 p-4 text-sm text-negatif">
          {etat.message}
        </p>
      )}
      {etat.publiees !== undefined && etat.publiees > 0 && (
        <p className="mb-4 rounded-carte bg-positif/10 p-4 text-sm font-bold text-positif">
          {etat.publiees} question{etat.publiees > 1 ? "s" : ""} publiée
          {etat.publiees > 1 ? "s" : ""}.
        </p>
      )}
      {etat.refusees && etat.refusees.length > 0 && (
        <details className="mb-4 rounded-carte border-2 border-soleil bg-soleil/10 p-4">
          <summary className="cursor-pointer font-extrabold text-encre">
            {etat.refusees.length} question{etat.refusees.length > 1 ? "s" : ""} refusée
            {etat.refusees.length > 1 ? "s" : ""} — à corriger une par une
          </summary>
          <ul className="mt-3 space-y-1.5 text-sm">
            {etat.refusees.map((r) => (
              <li key={r.id}>
                <Link href={`/admin/relecture/${r.id}`} className="font-bold text-primaire">
                  {r.enonce.slice(0, 70)}
                  {r.enonce.length > 70 ? "…" : ""}
                </Link>
                <span className="opacity-75"> — {r.raison}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Barre de sélection */}
      <div className="sticky top-0 z-10 mb-4 flex flex-wrap items-center gap-4 rounded-carte border border-ligne bg-white p-4">
        <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-encre">
          <input
            type="checkbox"
            checked={toutes}
            onChange={toutBasculer}
            className="size-4.5 accent-primaire"
          />
          Tout sélectionner ({questions.length})
        </label>

        <span className="text-sm">
          {selection.size === 0
            ? "aucune sélection"
            : `${selection.size} sélectionnée${selection.size > 1 ? "s" : ""}`}
        </span>

        {selection.size > 0 && (
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setSelection(new Set());
                setConfirme(false);
              }}
              className="cursor-pointer text-sm underline"
            >
              Tout désélectionner
            </button>

            {confirme ? (
              <button
                type="submit"
                disabled={enCours}
                className="cursor-pointer rounded-full bg-negatif px-7 py-3 font-extrabold text-white transition hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
              >
                {enCours
                  ? "Publication…"
                  : `Confirmer : publier ${selection.size} question${selection.size > 1 ? "s" : ""}`}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirme(true)}
                className="cursor-pointer rounded-full bg-primaire px-7 py-3 font-extrabold text-white transition hover:bg-primaire-fonce"
              >
                Valider la sélection
              </button>
            )}
          </div>
        )}
      </div>

      {confirme && (
        <p className="mb-4 rounded-carte border-2 border-soleil bg-soleil/10 p-4 text-sm">
          Publier une question la rend jouable par les élèves, sans autre
          relecture. Vérifie que tu as bien lu ces {selection.size} énoncés —
          une question au contenu incohérent sera refusée, mais une question
          cohérente et fausse passera.
        </p>
      )}

      <ul className="space-y-3">
        {questions.map((q) => {
          const cochee = selection.has(q.id);
          return (
            <li key={q.id}>
              <div
                className={`flex gap-4 rounded-carte border p-5 transition ${
                  cochee ? "border-primaire bg-fond-doux/50" : "border-ligne"
                }`}
              >
                <label className="shrink-0 cursor-pointer pt-0.5">
                  <input
                    type="checkbox"
                    name="selection"
                    value={q.id}
                    checked={cochee}
                    onChange={() => basculer(q.id)}
                    className="size-4.5 accent-primaire"
                  />
                  <span className="sr-only">Sélectionner cette question</span>
                </label>

                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    {q.nbSignalements > 0 && (
                      <span className="rounded-full bg-negatif/10 px-2.5 py-0.5 text-[0.75rem] font-bold text-negatif">
                        signalée {q.nbSignalements > 1 && `×${q.nbSignalements}`}
                      </span>
                    )}
                    <span className="rounded-full bg-fond-doux px-2.5 py-0.5 text-[0.75rem] font-bold">
                      {q.origine}
                    </span>
                    <span className="rounded-full bg-fond-doux px-2.5 py-0.5 text-[0.75rem] font-bold">
                      {q.chapitre}
                    </span>
                    {q.confiance !== null && (
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[0.75rem] font-bold ${
                          q.confiance < seuil ? "bg-soleil/25 text-encre" : "bg-fond-doux"
                        }`}
                      >
                        confiance {q.confiance} %
                      </span>
                    )}
                  </div>

                  <Link
                    href={`/admin/relecture/${q.id}`}
                    className="block text-[0.95rem] text-encre no-underline hover:text-primaire"
                  >
                    <span className="line-clamp-2">{formaterMath(q.enonce)}</span>
                  </Link>

                  {q.premierMotif && (
                    <p className="mt-2 text-[0.85rem] text-negatif">« {q.premierMotif} »</p>
                  )}
                  {q.commentaire && (
                    <p className="mt-1.5 text-[0.85rem] opacity-75">{q.commentaire}</p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </form>
  );
}
