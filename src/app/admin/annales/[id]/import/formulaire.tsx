"use client";

import Link from "next/link";
import { useActionState } from "react";
import { importerQuestions, type EtatImport } from "./actions";

export function FormulaireImport({
  annaleId,
  seuil,
}: {
  annaleId: string;
  seuil: number;
}) {
  const [etat, action, enCours] = useActionState<EtatImport, FormData>(
    importerQuestions,
    {},
  );

  const r = etat.rapport;
  const bloquantes = r?.anomalies.filter((a) => a.gravite === "bloquante") ?? [];
  const avertissements = r?.anomalies.filter((a) => a.gravite === "avertissement") ?? [];

  return (
    <div className="space-y-6">
      <form action={action} className="space-y-5 rounded-carte border border-ligne p-5">
        <input type="hidden" name="annaleId" value={annaleId} />

        {etat.message && (
          <p role="alert" className="rounded-[14px] bg-negatif/10 p-4 text-sm text-negatif">
            {etat.message}
          </p>
        )}

        <div>
          <label htmlFor="fichier" className="mb-1.5 block font-bold text-encre">
            Fichier XLSX ou CSV
          </label>
          <input
            id="fichier"
            name="fichier"
            type="file"
            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            className="w-full rounded-[14px] border border-ligne bg-white px-4 py-3 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-fond-doux file:px-4 file:py-2 file:font-bold"
          />
          <p className="mt-1 text-[0.82rem] opacity-75">10 Mo maximum.</p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            name="mode"
            value="simulation"
            disabled={enCours}
            className="cursor-pointer rounded-full border-2 border-primaire px-7 py-3 font-extrabold text-primaire transition hover:bg-fond-doux disabled:cursor-wait disabled:opacity-60"
          >
            {enCours ? "Analyse…" : "Analyser sans importer"}
          </button>
          <button
            type="submit"
            name="mode"
            value="import"
            disabled={enCours}
            className="cursor-pointer rounded-full bg-primaire px-7 py-3 font-extrabold text-white transition hover:bg-primaire-fonce disabled:cursor-wait disabled:opacity-60"
          >
            Importer
          </button>
        </div>
        <p className="text-[0.85rem] opacity-75">
          L&apos;analyse produit le même rapport que l&apos;import, sans rien
          écrire. Les lignes en anomalie sont écartées ; les autres sont
          importées.
        </p>
      </form>

      {r && (
        <section className="rounded-carte border border-ligne p-5">
          <h2 className="mb-1 text-lg font-extrabold">
            {r.simulation ? "Rapport de simulation" : "Rapport d'import"}
          </h2>
          <p className="mb-4 text-sm opacity-75">
            {r.simulation
              ? "Rien n'a été écrit en base."
              : `${r.importees ?? 0} question(s) importée(s).`}
          </p>

          <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Chiffre valeur={r.lignes} libelle="lignes lues" />
            <Chiffre valeur={r.questionsValides} libelle="questions valides" />
            <Chiffre
              valeur={r.publiees}
              libelle={`publiables (≥ ${seuil} %)`}
            />
            <Chiffre
              valeur={r.enRelecture}
              libelle="en relecture"
              alerte={r.enRelecture > 0}
            />
          </div>

          <p className="mb-5 text-sm">
            {r.blocs} bloc{r.blocs > 1 ? "s" : ""} ·{" "}
            {r.lignesIgnorees > 0 ? (
              <span className="font-bold text-negatif">
                {r.lignesIgnorees} ligne{r.lignesIgnorees > 1 ? "s" : ""} écartée
                {r.lignesIgnorees > 1 ? "s" : ""}
              </span>
            ) : (
              "aucune ligne écartée"
            )}
          </p>

          {bloquantes.length > 0 && (
            <Anomalies
              titre={`${bloquantes.length} anomalie${bloquantes.length > 1 ? "s" : ""} bloquante${bloquantes.length > 1 ? "s" : ""}`}
              couleur="negatif"
              items={bloquantes}
            />
          )}
          {avertissements.length > 0 && (
            <Anomalies
              titre={`${avertissements.length} avertissement${avertissements.length > 1 ? "s" : ""}`}
              couleur="soleil"
              items={avertissements}
            />
          )}

          {!r.simulation && (r.importees ?? 0) > 0 && (
            <p className="mt-5 flex flex-wrap gap-4 text-sm font-bold">
              <Link href={`/admin/annales/${annaleId}`} className="text-primaire">
                Voir l&apos;annale
              </Link>
              {r.enRelecture > 0 && (
                <Link href="/admin/relecture" className="text-primaire">
                  Ouvrir la file de relecture
                </Link>
              )}
            </p>
          )}
        </section>
      )}
    </div>
  );
}

function Chiffre({
  valeur,
  libelle,
  alerte = false,
}: {
  valeur: number;
  libelle: string;
  alerte?: boolean;
}) {
  return (
    <div
      className={`rounded-[14px] border p-4 ${
        alerte ? "border-soleil bg-soleil/10" : "border-ligne"
      }`}
    >
      <p className="text-2xl font-black text-encre">{valeur}</p>
      <p className="text-[0.85rem]">{libelle}</p>
    </div>
  );
}

function Anomalies({
  titre,
  couleur,
  items,
}: {
  titre: string;
  couleur: "negatif" | "soleil";
  items: { ligne: number | null; message: string }[];
}) {
  return (
    <details
      className={`mb-3 rounded-[14px] border-2 p-4 ${
        couleur === "negatif" ? "border-negatif bg-negatif/5" : "border-soleil bg-soleil/10"
      }`}
    >
      <summary className="cursor-pointer font-extrabold text-encre">
        {titre}
      </summary>
      <ul className="mt-3 space-y-1 text-sm">
        {items.slice(0, 100).map((a, i) => (
          <li key={i}>
            {a.ligne !== null && (
              <span className="font-mono opacity-70">L{a.ligne} </span>
            )}
            {a.message}
          </li>
        ))}
        {items.length > 100 && (
          <li className="opacity-70">… et {items.length - 100} autre(s).</li>
        )}
      </ul>
    </details>
  );
}
