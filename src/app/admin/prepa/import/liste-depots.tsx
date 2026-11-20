import type { Depot } from "@/lib/depots-extraction";
import { changerStatutDepot } from "./actions-depot";

const ETATS = [
  { cle: "depose", libelle: "Déposé", classe: "bg-fond-doux text-encre" },
  { cle: "en_cours", libelle: "Extraction en cours", classe: "bg-soleil/25 text-encre" },
  { cle: "livre", libelle: "CSV et images livrés", classe: "bg-primaire/10 text-primaire-fonce" },
  { cle: "importe", libelle: "Importé en banque", classe: "bg-positif/15 text-positif" },
  { cle: "abandonne", libelle: "Abandonné", classe: "bg-negatif/10 text-negatif" },
] as const;

const ROLES: Record<Depot["fichiers"][number]["role"], string> = {
  sujet: "sujet",
  reponses: "réponses",
  autre: "autre",
};

/** Suivi des dépôts : ce qui attend une transcription, et où elle en est. */
export function ListeDepots({ depots }: { depots: Depot[] }) {
  if (depots.length === 0) {
    return (
      <p className="rounded-carte border border-dashed border-ligne p-8 text-center">
        Aucun dépôt. Les sujets déposés ici attendent leur transcription au
        format Parkours.
      </p>
    );
  }

  return (
    <ul className="space-y-4">
      {depots.map((d) => {
        const etat = ETATS.find((e) => e.cle === d.statut) ?? ETATS[0];
        const manquants = d.fichiers.filter((f) => !f.televerse);

        return (
          <li key={d.id} className="rounded-carte border border-ligne p-5">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-3">
              <h3 className="font-extrabold text-encre">{d.libelle}</h3>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[0.75rem] font-bold ${etat.classe}`}
              >
                {etat.libelle}
              </span>
            </div>

            <p className="mb-3 text-[0.82rem] opacity-70">
              {new Date(d.creeLe).toLocaleString("fr-FR", {
                dateStyle: "long",
                timeStyle: "short",
              })}
              {d.deposePar && ` · déposé par ${d.deposePar}`}
            </p>

            {d.consigne && (
              <p className="mb-3 rounded-[10px] bg-fond-doux p-3 text-sm whitespace-pre-line">
                {d.consigne}
              </p>
            )}

            <ul className="mb-3 space-y-1 text-sm">
              {d.fichiers.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-fond-doux px-2 py-0.5 text-[0.72rem] font-bold">
                    {ROLES[f.role]}
                  </span>
                  {f.url ? (
                    <a
                      href={f.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-bold text-primaire"
                    >
                      {f.nom}
                    </a>
                  ) : (
                    <span className="opacity-70">{f.nom}</span>
                  )}
                  {f.taille !== null && (
                    <span className="opacity-60">
                      {(f.taille / 1024 / 1024).toFixed(1)} Mo
                    </span>
                  )}
                  {!f.televerse && (
                    <span className="font-bold text-negatif">non arrivé</span>
                  )}
                </li>
              ))}
            </ul>

            {manquants.length > 0 && (
              <p className="mb-3 rounded-[10px] bg-negatif/5 p-3 text-[0.85rem] text-negatif">
                {manquants.length} fichier(s) annoncé(s) mais absent(s) du
                stockage : redépose-les dans un nouveau dépôt.
              </p>
            )}

            {d.noteSuivi && (
              <p className="mb-3 text-sm">
                <span className="font-bold text-encre">Suivi. </span>
                {d.noteSuivi}
              </p>
            )}

            <form action={changerStatutDepot} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="depotId" value={d.id} />
              <div>
                <label
                  htmlFor={`statut-${d.id}`}
                  className="mb-1.5 block text-sm font-bold text-encre"
                >
                  Avancement
                </label>
                <select
                  id={`statut-${d.id}`}
                  name="statut"
                  defaultValue={d.statut}
                  className="rounded-[14px] border border-ligne bg-white px-4 py-2"
                >
                  {ETATS.map((e) => (
                    <option key={e.cle} value={e.cle}>
                      {e.libelle}
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-w-[240px] flex-1">
                <label
                  htmlFor={`note-${d.id}`}
                  className="mb-1.5 block text-sm font-bold text-encre"
                >
                  Note de suivi
                </label>
                <input
                  id={`note-${d.id}`}
                  name="noteSuivi"
                  defaultValue={d.noteSuivi ?? ""}
                  placeholder="Ce qui a été livré, ce qui bloque."
                  className="w-full rounded-[14px] border border-ligne bg-white px-4 py-2"
                />
              </div>
              <button
                type="submit"
                className="cursor-pointer rounded-full border-2 border-primaire px-6 py-2 font-extrabold text-primaire transition hover:bg-fond-doux"
              >
                Mettre à jour
              </button>
            </form>
          </li>
        );
      })}
    </ul>
  );
}
