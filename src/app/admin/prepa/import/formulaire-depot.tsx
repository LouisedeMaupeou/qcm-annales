"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cloturerDepot, ouvrirDepot, type EtatDepot } from "./actions-depot";

/**
 * Dépôt de sujets à extraire.
 *
 * Le fichier ne traverse pas le serveur : la Server Action délivre une URL
 * signée par fichier, et le navigateur envoie directement au stockage. C'est
 * la seule façon de faire passer un sujet scanné de plusieurs dizaines de
 * méga-octets — le corps d'une fonction serverless est plafonné bien en
 * dessous. Le serveur constate ensuite les arrivées.
 */

const BUCKET = "depots-cb";

type Etape = "saisie" | "televersement" | "fini";

export function FormulaireDepot() {
  const [fichiers, setFichiers] = useState<File[]>([]);
  const [etape, setEtape] = useState<Etape>("saisie");
  const [progres, setProgres] = useState<Record<string, "attente" | "ok" | "echec">>({});
  const [etat, setEtat] = useState<EtatDepot>({});

  const envoyer = async (donnees: FormData) => {
    setEtat({});
    setProgres({});

    donnees.set(
      "fichiers",
      JSON.stringify(fichiers.map((f) => ({ nom: f.name, taille: f.size }))),
    );

    const ouverture = await ouvrirDepot({}, donnees);
    if (ouverture.message || !ouverture.cibles || !ouverture.depotId) {
      setEtat(ouverture);
      return;
    }

    setEtape("televersement");
    const supabase = createClient();

    for (const cible of ouverture.cibles) {
      const fichier = fichiers.find((f) => f.name === cible.nom);
      if (!fichier) continue;

      setProgres((p) => ({ ...p, [cible.nom]: "attente" }));
      const { error } = await supabase.storage
        .from(BUCKET)
        .uploadToSignedUrl(cible.chemin, cible.token, fichier);

      setProgres((p) => ({ ...p, [cible.nom]: error ? "echec" : "ok" }));
    }

    const cloture = new FormData();
    cloture.set("depotId", ouverture.depotId);
    setEtat(await cloturerDepot({}, cloture));
    setEtape("fini");
    setFichiers([]);
  };

  const total = fichiers.reduce((s, f) => s + f.size, 0);

  return (
    <section className="rounded-carte border border-ligne p-5">
      <h2 className="mb-1 text-lg font-extrabold">Déposer des sujets à extraire</h2>
      <p className="mb-4 max-w-[70ch] text-sm opacity-75">
        Pour des sujets qui ne sont pas encore au format Parkours : dépose les
        PDF et le tableur de réponses, ils sont conservés ici et le dépôt suit
        son avancement. La transcription des énoncés et le découpage des figures
        se font à la main — une extraction automatique rend les maths scannées
        et la notation à deux dimensions illisibles.
      </p>

      {etat.message && (
        <p role="alert" className="mb-4 rounded-[14px] bg-negatif/10 p-3 text-sm text-negatif">
          {etat.message}
        </p>
      )}
      {etat.succes && (
        <p className="mb-4 rounded-[14px] bg-positif/10 p-3 text-sm font-bold text-positif">
          ✓ {etat.succes}
        </p>
      )}

      <form action={envoyer} className="space-y-4">
        <div>
          <label htmlFor="libelle" className="mb-1.5 block text-sm font-bold text-encre">
            Intitulé du dépôt
          </label>
          <input
            id="libelle"
            name="libelle"
            required
            placeholder="Concours blancs Noël 2027 — ingénieurs"
            className="w-full rounded-[14px] border border-ligne bg-white px-4 py-2.5"
          />
        </div>

        <div>
          <label htmlFor="consigne" className="mb-1.5 block text-sm font-bold text-encre">
            Consigne
          </label>
          <textarea
            id="consigne"
            name="consigne"
            rows={3}
            placeholder="Épreuves concernées, pages à ignorer, particularités du barème, où se trouvent les clés dans le tableur."
            className="w-full rounded-[14px] border border-ligne bg-white px-4 py-2.5"
          />
        </div>

        <div>
          <label htmlFor="depot" className="mb-1.5 block text-sm font-bold text-encre">
            Fichiers
          </label>
          <input
            id="depot"
            type="file"
            multiple
            accept=".pdf,.xlsx,.xls,.csv,.zip,.png,.jpg,.jpeg"
            onChange={(e) => setFichiers([...(e.target.files ?? [])])}
            className="w-full rounded-[14px] border border-ligne bg-white px-4 py-3 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-fond-doux file:px-4 file:py-2 file:font-bold"
          />
          <p className="mt-1 text-[0.82rem] opacity-75">
            PDF des sujets et tableur des réponses. 100 Mo par fichier au plus.
          </p>
        </div>

        {fichiers.length > 0 && (
          <ul className="space-y-1 text-sm">
            {fichiers.map((f) => (
              <li key={f.name} className="flex flex-wrap items-center gap-2">
                <span className="font-mono">{f.name}</span>
                <span className="opacity-70">
                  {(f.size / 1024 / 1024).toFixed(1)} Mo
                </span>
                {progres[f.name] === "attente" && <span>envoi…</span>}
                {progres[f.name] === "ok" && <span className="text-positif">✓</span>}
                {progres[f.name] === "echec" && (
                  <span className="text-negatif">échec</span>
                )}
              </li>
            ))}
            <li className="pt-1 font-bold">
              {fichiers.length} fichier{fichiers.length > 1 ? "s" : ""} ·{" "}
              {(total / 1024 / 1024).toFixed(1)} Mo au total
            </li>
          </ul>
        )}

        <button
          type="submit"
          disabled={etape === "televersement" || fichiers.length === 0}
          className={`cursor-pointer rounded-full px-7 py-3 font-extrabold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${
            etape === "fini" && etat.succes
              ? "bg-positif"
              : "bg-primaire hover:bg-primaire-fonce"
          }`}
        >
          {etape === "televersement"
            ? "Envoi en cours…"
            : etape === "fini" && etat.succes
              ? "✓ Dépôt enregistré"
              : "Déposer"}
        </button>
      </form>
    </section>
  );
}
