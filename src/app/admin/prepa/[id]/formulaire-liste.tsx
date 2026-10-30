"use client";

import { useActionState } from "react";
import { importerListeEleves, type EtatImportListe } from "../actions";

/** §5.1 : import XLSX des élèves, avec simulation avant écriture. */
export function FormulaireListe({ cohorteId }: { cohorteId: string }) {
  const [etat, action, enCours] = useActionState<EtatImportListe, FormData>(
    importerListeEleves,
    {},
  );

  const r = etat.rapport;
  const bloquantes = r?.anomalies.filter((a) => a.gravite === "bloquante") ?? [];
  const avertissements = r?.anomalies.filter((a) => a.gravite === "avertissement") ?? [];

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4 rounded-carte border border-ligne p-5">
        <input type="hidden" name="cohorteId" value={cohorteId} />
        <h2 className="font-extrabold text-encre">Importer la liste</h2>

        {etat.message && (
          <p role="alert" className="rounded-[14px] bg-negatif/10 p-3 text-sm text-negatif">
            {etat.message}
          </p>
        )}

        <input
          name="fichier"
          type="file"
          accept=".xlsx,.xls,.csv"
          aria-label="Liste des élèves (XLSX ou CSV)"
          className="w-full rounded-[14px] border border-ligne bg-white px-4 py-3 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-fond-doux file:px-4 file:py-2 file:font-bold"
        />

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            name="mode"
            value="simulation"
            disabled={enCours}
            className="cursor-pointer rounded-full border-2 border-primaire px-5 py-2.5 text-sm font-extrabold text-primaire transition hover:bg-fond-doux disabled:cursor-wait disabled:opacity-60"
          >
            {enCours ? "Analyse…" : "Analyser"}
          </button>
          <button
            type="submit"
            name="mode"
            value="import"
            disabled={enCours}
            className={`cursor-pointer rounded-full px-5 py-2.5 text-sm font-extrabold text-white transition disabled:cursor-wait disabled:opacity-60 ${
              r && !r.simulation ? "bg-positif" : "bg-primaire hover:bg-primaire-fonce"
            }`}
          >
            {r && !r.simulation ? "✓ Importé et invité" : "Importer et inviter"}
          </button>
        </div>
        <p className="text-[0.82rem] opacity-75">
          L&apos;analyse ne crée aucun compte et n&apos;envoie aucun email.
        </p>
      </form>

      {r && (
        <section className="rounded-carte border border-ligne p-5 text-sm">
          <h3 className="mb-1 font-extrabold text-encre">
            {r.simulation ? "Simulation" : "Import effectué"}
          </h3>
          <p className="mb-3 opacity-75">
            {r.lignes} ligne{r.lignes > 1 ? "s" : ""} lue{r.lignes > 1 ? "s" : ""},{" "}
            {r.valides} valide{r.valides > 1 ? "s" : ""}.
          </p>

          <ul className="mb-3 space-y-1">
            <Ligne valeur={r.crees} libelle={r.simulation ? "compte(s) à créer" : "compte(s) créé(s)"} />
            <Ligne
              valeur={r.rattaches}
              libelle={r.simulation ? "compte(s) à rattacher" : "compte(s) rattaché(s)"}
            />
            <Ligne valeur={r.inchanges} libelle="déjà dans cette cohorte" />
            {!r.simulation && (
              <>
                <Ligne valeur={r.invitesEnvoyes} libelle="invitation(s) envoyée(s)" />
                {r.invitesEchoues > 0 && (
                  <li className="font-bold text-negatif">
                    {r.invitesEchoues} invitation(s) non envoyée(s) — relancer depuis la
                    liste
                  </li>
                )}
              </>
            )}
          </ul>

          {bloquantes.length > 0 && (
            <Anomalies titre={`${bloquantes.length} ligne(s) écartée(s)`} couleur="negatif" items={bloquantes} />
          )}
          {avertissements.length > 0 && (
            <Anomalies
              titre={`${avertissements.length} avertissement(s)`}
              couleur="soleil"
              items={avertissements}
            />
          )}
        </section>
      )}
    </div>
  );
}

function Ligne({ valeur, libelle }: { valeur: number; libelle: string }) {
  return (
    <li>
      <span className="font-black tabular-nums text-encre">{valeur}</span> {libelle}
    </li>
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
      className={`mb-2 rounded-[14px] border-2 p-3 ${
        couleur === "negatif" ? "border-negatif bg-negatif/5" : "border-soleil bg-soleil/10"
      }`}
    >
      <summary className="cursor-pointer font-extrabold text-encre">{titre}</summary>
      <ul className="mt-2 space-y-1">
        {items.slice(0, 100).map((a, i) => (
          <li key={i}>
            {a.ligne !== null && <span className="font-mono opacity-70">L{a.ligne} </span>}
            {a.message}
          </li>
        ))}
        {items.length > 100 && <li className="opacity-70">… et {items.length - 100} autre(s).</li>}
      </ul>
    </details>
  );
}
