"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

/** §6.2 : liste filtrable. Les filtres vivent dans l'URL, donc l'export les reprend. */
export function FiltresListe({
  concours,
  valeurs,
}: {
  concours: { id: string; nom: string }[];
  valeurs: Record<string, string | undefined>;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [recherche, setRecherche] = useState(valeurs.q ?? "");

  const appliquer = (cle: string, valeur: string) => {
    const suivants = new URLSearchParams(params.toString());
    if (valeur) suivants.set(cle, valeur);
    else suivants.delete(cle);
    router.push(`/admin/eleves?${suivants.toString()}`);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        appliquer("q", recherche);
      }}
      className="mb-5 flex flex-wrap items-end gap-3"
    >
      <div className="min-w-[220px] flex-1">
        <label htmlFor="q" className="mb-1.5 block text-sm font-bold text-encre">
          Rechercher
        </label>
        <input
          id="q"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="nom, email, ville, établissement"
          className="w-full rounded-[14px] border border-ligne bg-white px-4 py-2.5"
        />
      </div>

      <Selecteur
        id="concours"
        libelle="Concours visé"
        valeur={valeurs.concours ?? ""}
        onChange={(v) => appliquer("concours", v)}
        options={[
          { valeur: "", libelle: "Tous" },
          ...concours.map((c) => ({ valeur: c.id, libelle: c.nom })),
        ]}
      />

      <Selecteur
        id="consentement"
        libelle="Consentement"
        valeur={valeurs.consentement ?? ""}
        onChange={(v) => appliquer("consentement", v)}
        options={[
          { valeur: "", libelle: "Tous" },
          { valeur: "oui", libelle: "Consentants" },
          { valeur: "non", libelle: "Non consentants" },
        ]}
      />

      <Selecteur
        id="statut"
        libelle="Statut"
        valeur={valeurs.statut ?? ""}
        onChange={(v) => appliquer("statut", v)}
        options={[
          { valeur: "", libelle: "Tous" },
          { valeur: "actifs", libelle: "Actifs" },
          { valeur: "inactifs", libelle: "Inactifs" },
          { valeur: "attente_parent", libelle: "Attente parent" },
        ]}
      />

      <button
        type="submit"
        className="cursor-pointer rounded-full border-2 border-primaire px-6 py-2.5 font-extrabold text-primaire transition hover:bg-fond-doux"
      >
        Filtrer
      </button>

      {Object.values(valeurs).some(Boolean) && (
        <button
          type="button"
          onClick={() => {
            setRecherche("");
            router.push("/admin/eleves");
          }}
          className="cursor-pointer text-sm underline"
        >
          Tout effacer
        </button>
      )}
    </form>
  );
}

function Selecteur({
  id,
  libelle,
  valeur,
  onChange,
  options,
}: {
  id: string;
  libelle: string;
  valeur: string;
  onChange: (v: string) => void;
  options: { valeur: string; libelle: string }[];
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-bold text-encre">
        {libelle}
      </label>
      <select
        id={id}
        value={valeur}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-[14px] border border-ligne bg-white px-4 py-2.5"
      >
        {options.map((o) => (
          <option key={o.valeur} value={o.valeur}>
            {o.libelle}
          </option>
        ))}
      </select>
    </div>
  );
}
