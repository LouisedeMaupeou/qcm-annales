"use client";

import { useActionState } from "react";
import type { BilanAssemble } from "@/lib/bilans-generation";
import {
  enregistrerBilan,
  envoyerBilan,
  validerBilan,
  type EtatBilan,
} from "../actions";

const RUBRIQUES = [
  { cle: "forces", libelle: "Forces identifiées (chapitres et méthode)" },
  { cle: "ameliorations", libelle: "Points d'amélioration (chapitres et méthode)" },
  { cle: "methode", libelle: "Maîtrise de la méthode" },
  { cle: "conseils", libelle: "Conseils de reprise de copie" },
] as const;

export function FormulaireBilan({
  bilanId,
  bilan,
}: {
  bilanId: string;
  bilan: BilanAssemble;
}) {
  const [etat, action, enCours] = useActionState<EtatBilan, FormData>(
    enregistrerBilan,
    {},
  );

  const valide = bilan.statut === "valide" || bilan.statut === "envoye";
  const envoye = bilan.statut === "envoye";

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black">
            {bilan.eleve.prenom} {bilan.eleve.nom}
          </h1>
          <p className="text-sm opacity-75">
            {bilan.session}
            {bilan.cohorte && ` · ${bilan.cohorte.nom}`} · état : {bilan.statut}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <a
            href={`/admin/prepa/bilans/${bilanId}/pdf`}
            target="_blank"
            rel="noreferrer"
            className="cursor-pointer rounded-full border-2 border-ligne px-6 py-2.5 font-bold text-encre no-underline transition hover:bg-fond-doux"
          >
            Voir le PDF
          </a>
          {!valide && (
            <form action={validerBilan}>
              <input type="hidden" name="bilanId" value={bilanId} />
              <button
                type="submit"
                disabled={bilan.bloqueParCorrection}
                title={
                  bilan.bloqueParCorrection
                    ? "Une copie de cette session attend encore une correction."
                    : undefined
                }
                className="cursor-pointer rounded-full border-2 border-primaire px-6 py-2.5 font-extrabold text-primaire transition hover:bg-fond-doux disabled:cursor-not-allowed disabled:opacity-40"
              >
                Valider le bilan
              </button>
            </form>
          )}
          {valide && !envoye && (
            <form action={envoyerBilan}>
              <input type="hidden" name="bilanId" value={bilanId} />
              <button
                type="submit"
                className="cursor-pointer rounded-full bg-primaire px-7 py-3 font-extrabold text-white transition hover:bg-primaire-fonce"
              >
                Envoyer à l&apos;élève et au parent
              </button>
            </form>
          )}
          {envoye && (
            <span className="rounded-full bg-primaire/10 px-4 py-2 text-sm font-bold text-primaire-fonce">
              Envoyé le{" "}
              {bilan.envoyeLe &&
                new Date(bilan.envoyeLe).toLocaleDateString("fr-FR", {
                  dateStyle: "long",
                })}
            </span>
          )}
        </div>
      </div>

      {bilan.bloqueParCorrection && (
        <p
          role="alert"
          className="mb-6 rounded-carte border-2 border-soleil bg-soleil/10 p-4 text-sm"
        >
          Une copie de cette session n&apos;est pas entièrement corrigée. Le bilan
          reste consultable, mais il ne peut pas être validé tant que des réponses
          attendent une note —{" "}
          <Lien href="/admin/prepa/correction">ouvrir la file de correction</Lien>.
        </p>
      )}

      {!bilan.eleve.emailParent && (
        <p className="mb-6 rounded-carte bg-fond-doux p-4 text-sm">
          Aucune adresse parent sur cette fiche : le bilan ne partira qu&apos;à
          l&apos;élève.
        </p>
      )}

      <form action={action} className="space-y-6">
        <input type="hidden" name="bilanId" value={bilanId} />

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
          <label
            htmlFor="enQuelquesMots"
            className="mb-1.5 block font-extrabold text-encre"
          >
            En quelques mots
          </label>
          <p className="mb-2 text-sm opacity-75">
            Deux phrases, pré-remplies à partir des chiffres. À reformuler : ce
            texte est la première chose que lira la famille.
          </p>
          <textarea
            id="enQuelquesMots"
            name="enQuelquesMots"
            defaultValue={bilan.enQuelquesMots}
            rows={4}
            className="w-full rounded-[14px] border border-ligne bg-white px-4 py-3"
          />
        </section>

        {bilan.colonnes.map((c) => (
          <section key={c.epreuveCbId} className="rounded-carte border border-ligne p-5">
            <h2 className="mb-1 font-extrabold text-encre">
              {c.concours} — {c.matiere}
            </h2>
            <p className="mb-4 text-sm opacity-75">
              {c.absent
                ? "Copie non remise."
                : `${c.noteSur20}/20 · moyenne du groupe ${c.moyenneGroupe ?? "—"} · rang ${c.rang}/${c.participants} · ${c.nbBonnes} justes, ${c.nbFausses} fausses, ${c.nbAbstentions} sans réponse`}
            </p>

            <div className="grid gap-4 lg:grid-cols-2">
              {RUBRIQUES.map((r) => (
                <div key={r.cle}>
                  <label
                    htmlFor={`texte-${c.epreuveCbId}-${r.cle}`}
                    className="mb-1.5 block text-sm font-bold text-encre"
                  >
                    {r.libelle}
                  </label>
                  <textarea
                    id={`texte-${c.epreuveCbId}-${r.cle}`}
                    name={`texte-${c.epreuveCbId}-${r.cle}`}
                    defaultValue={c[r.cle]}
                    rows={4}
                    className="w-full rounded-[14px] border border-ligne bg-white px-4 py-2.5 text-sm"
                  />
                </div>
              ))}
            </div>
          </section>
        ))}

        <button
          type="submit"
          disabled={enCours}
          className="cursor-pointer rounded-full bg-primaire px-7 py-3 font-extrabold text-white transition hover:bg-primaire-fonce disabled:cursor-wait disabled:opacity-60"
        >
          {enCours ? "Enregistrement…" : "Enregistrer les textes"}
        </button>
      </form>
    </>
  );
}

function Lien({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} className="font-bold text-primaire">
      {children}
    </a>
  );
}
