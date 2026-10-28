import Link from "next/link";
import { redirect } from "next/navigation";
import { EnteteEleve } from "@/components/entete-eleve";
import { PiedDePage } from "@/components/pied-de-page";
import { createClient } from "@/lib/supabase/server";
import {
  chargerMesConcoursBlancs,
  type StatutEpreuveEleve,
} from "@/lib/mes-concours-blancs";

export const dynamic = "force-dynamic";

const ETATS: Record<
  StatutEpreuveEleve,
  { libelle: string; classe: string; aide: string }
> = {
  a_venir: {
    libelle: "À venir",
    classe: "bg-fond-doux text-encre",
    aide: "La fenêtre de passage n'est pas encore ouverte.",
  },
  a_composer: {
    libelle: "À composer",
    classe: "bg-primaire/10 text-primaire-fonce",
    aide: "Tu peux composer dès que l'épreuve s'ouvrira ici.",
  },
  terminee: {
    libelle: "Terminée",
    classe: "bg-ligne text-encre",
    aide: "Copie remise. Ton bilan te sera envoyé après correction.",
  },
  fermee: {
    libelle: "Fenêtre fermée",
    classe: "bg-negatif/10 text-negatif",
    aide: "La fenêtre s'est refermée sans que tu aies composé.",
  },
};

const dateLongue = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("fr-FR", { dateStyle: "full", timeStyle: "short" })
    : null;

/** §4.2 : onglet « Mes concours blancs » de l'élève de la prépa. */
export default async function MesConcoursBlancs() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion?suite=/concours-blancs");

  const { cohorte, epreuves } = await chargerMesConcoursBlancs(user.id);

  return (
    <div className="mx-auto flex w-full max-w-[820px] flex-1 flex-col px-[22px]">
      <EnteteEleve />

      <main className="flex-1 pb-16">
        <h1 className="mb-2 text-[clamp(1.8rem,4vw,2.4rem)] font-black">
          Mes concours blancs
        </h1>

        {cohorte === null ? (
          <>
            <p className="mb-6 max-w-[65ch]">
              Les concours blancs sont réservés aux élèves de la prépa Parkours.
              Ton compte n&apos;est rattaché à aucune promotion.
            </p>
            <p className="rounded-carte border border-dashed border-ligne p-6 text-sm">
              Si tu suis la prépa et que cette page reste vide, signale-le à ton
              responsable : c&apos;est un rattachement à faire côté
              administration. En attendant, tu gardes l&apos;accès complet aux{" "}
              <Link href="/entrainement" className="font-bold text-primaire">
                annales
              </Link>
              .
            </p>
          </>
        ) : (
          <>
            <p className="mb-8 max-w-[65ch]">
              Promotion <strong className="text-encre">{cohorte}</strong>. Chaque
              épreuve se compose en une seule fois, chronométrée, pendant sa
              fenêtre d&apos;ouverture. Ni score ni corrigé ne s&apos;affichent à
              la remise : ton bilan arrive après la correction.
            </p>

            {epreuves.length === 0 ? (
              <p className="rounded-carte border border-dashed border-ligne p-8 text-center">
                Aucune épreuve ne t&apos;est assignée pour l&apos;instant.
              </p>
            ) : (
              <ul className="space-y-4">
                {epreuves.map((e) => {
                  const etat = ETATS[e.statut];
                  return (
                    <li
                      key={e.id}
                      className="rounded-carte border border-ligne bg-white p-5"
                    >
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="text-lg font-extrabold text-encre">
                          {e.concours} — {e.matiere}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[0.75rem] font-bold ${etat.classe}`}
                        >
                          {etat.libelle}
                        </span>
                      </div>

                      <p className="text-[0.9rem]">
                        {e.nbQuestions} question{e.nbQuestions > 1 ? "s" : ""} ·{" "}
                        {e.dureeMinutes} minutes
                      </p>

                      {e.statut === "a_venir" && e.fenetreDebut && (
                        <p className="mt-1.5 text-[0.9rem]">
                          Ouverture le{" "}
                          <strong className="text-encre">
                            {dateLongue(e.fenetreDebut)}
                          </strong>
                        </p>
                      )}
                      {e.statut === "a_composer" && e.fenetreFin && (
                        <p className="mt-1.5 text-[0.9rem]">
                          À composer avant le{" "}
                          <strong className="text-encre">
                            {dateLongue(e.fenetreFin)}
                          </strong>
                        </p>
                      )}
                      {e.statut === "terminee" && e.remisLe && (
                        <p className="mt-1.5 text-[0.9rem]">
                          Remise le {dateLongue(e.remisLe)}
                        </p>
                      )}

                      <p className="mt-2 text-[0.85rem] opacity-75">{etat.aide}</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </main>

      <PiedDePage />
    </div>
  );
}
