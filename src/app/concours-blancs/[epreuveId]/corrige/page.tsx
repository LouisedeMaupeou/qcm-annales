import Link from "next/link";
import { redirect } from "next/navigation";
import { CopieCorrigee } from "@/components/copie-corrigee";
import { EnteteEleve } from "@/components/entete-eleve";
import { PiedDePage } from "@/components/pied-de-page";
import { chargerCopieCorrigee, listerReprises } from "@/lib/reprise-cb";
import { createClient } from "@/lib/supabase/server";
import { refaire } from "../../reprise/actions";

export const dynamic = "force-dynamic";

const REFUS: Record<string, string> = {
  introuvable: "Cette épreuve n'existe pas.",
  non_assignee: "Cette épreuve ne t'est pas assignée.",
  bilan_pas_envoye:
    "Le corrigé s'ouvre quand ton bilan de session t'a été envoyé : des élèves composent peut-être encore.",
  pas_de_copie: "Tu n'as pas remis de copie pour cette épreuve.",
};

const date = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });

/** Après le bilan : la copie officielle corrigée, et les reprises. */
export default async function CopieCorrigeePage({
  params,
}: {
  params: Promise<{ epreuveId: string }>;
}) {
  const { epreuveId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/connexion?suite=/concours-blancs/${epreuveId}/corrige`);

  const [corrige, reprises] = await Promise.all([
    chargerCopieCorrigee(user.id, epreuveId),
    listerReprises(user.id, epreuveId),
  ]);

  // Sans copie officielle — fenêtre manquée —, l'épreuve reste à refaire.
  const sansCopie = "refus" in corrige && corrige.refus === "pas_de_copie";
  if ("refus" in corrige && !sansCopie) {
    return (
      <Cadre>
        <h1 className="mb-3 text-[clamp(1.6rem,4vw,2.2rem)] font-black">Corrigé indisponible</h1>
        <p className="mb-6">{REFUS[corrige.refus] ?? REFUS.introuvable}</p>
      </Cadre>
    );
  }

  const enCours = reprises.find((r) => !r.remiseLe);
  const terminees = reprises.filter((r) => r.remiseLe);

  return (
    <Cadre>
      <h1 className="mb-2 text-[clamp(1.6rem,4vw,2.2rem)] font-black">
        {"refus" in corrige ? "Refaire l'épreuve" : `${corrige.concours} — ${corrige.matiere}`}
      </h1>
      <p className="mb-6 max-w-[65ch]">
        {"refus" in corrige
          ? "Tu n'as pas composé cette épreuve pendant la session. Tu peux la faire maintenant, en entraînement."
          : "Ta copie telle qu'elle a été corrigée pour ton bilan. Tu peux refaire l'épreuve autant de fois que tu veux : le corrigé s'affiche à la fin, et ta note de session ne change pas."}
      </p>

      <section className="mb-10 rounded-carte border-2 border-primaire/30 bg-primaire/5 p-5">
        <form action={refaire} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="epreuveId" value={epreuveId} />
          <button
            type="submit"
            className="cursor-pointer rounded-full bg-primaire px-7 py-3 font-extrabold text-white transition hover:bg-primaire-fonce"
          >
            {enCours ? "Reprendre ma reprise en cours" : "Refaire l'épreuve"}
          </button>
          <span className="text-[0.85rem] opacity-80">
            sans limite de temps · corrigé à la fin · sans effet sur ta note
          </span>
        </form>

        {terminees.length > 0 && (
          <div className="mt-5">
            <p className="mb-2 text-sm font-extrabold text-encre">Tes reprises</p>
            <ul className="space-y-1.5 text-[0.9rem]">
              {terminees.map((r) => (
                <li key={r.id}>
                  <Link href={`/concours-blancs/reprise/${r.id}`} className="font-bold text-primaire">
                    {date(r.remiseLe!)}
                  </Link>
                  {r.noteSur20 !== null && (
                    <span className="ml-2 tabular-nums">
                      — {r.noteSur20.toString().replace(".", ",")}/20
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {!("refus" in corrige) && (
        <>
          <h2 className="mb-4 text-sm font-extrabold tracking-[.08em] text-primaire-fonce uppercase">
            Ta copie de la session
          </h2>
          <CopieCorrigee corrige={corrige} />
        </>
      )}
    </Cadre>
  );
}

function Cadre({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-[1000px] flex-1 flex-col px-4 sm:px-6">
      <EnteteEleve />
      <main className="flex-1 py-10">
        <p className="mb-6">
          <Link href="/concours-blancs" className="font-bold text-primaire">
            ← Mes concours blancs
          </Link>
        </p>
        {children}
      </main>
      <PiedDePage />
    </div>
  );
}
