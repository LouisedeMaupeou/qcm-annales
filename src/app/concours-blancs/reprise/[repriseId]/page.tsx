import Link from "next/link";
import { redirect } from "next/navigation";
import { CopieCorrigee } from "@/components/copie-corrigee";
import { EnteteEleve } from "@/components/entete-eleve";
import { PiedDePage } from "@/components/pied-de-page";
import { chargerReprise } from "@/lib/reprise-cb";
import { createClient } from "@/lib/supabase/server";
import { Composer } from "../../[epreuveId]/composer";
import { refaire } from "../actions";

export const dynamic = "force-dynamic";

const REFUS: Record<string, string> = {
  introuvable: "Cette reprise n'existe pas.",
  non_assignee: "Cette épreuve ne t'est pas assignée.",
  bilan_pas_envoye: "Les reprises s'ouvrent quand ton bilan de session t'a été envoyé.",
};

/** Une reprise : à composer tant qu'elle est ouverte, corrigée une fois terminée. */
export default async function ReprisePage({
  params,
}: {
  params: Promise<{ repriseId: string }>;
}) {
  const { repriseId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/connexion?suite=/concours-blancs/reprise/${repriseId}`);

  const etat = await chargerReprise(user.id, repriseId);

  if ("refus" in etat) {
    return (
      <Cadre>
        <h1 className="mb-3 text-[clamp(1.6rem,4vw,2.2rem)] font-black">Reprise indisponible</h1>
        <p>{REFUS[etat.refus] ?? REFUS.introuvable}</p>
      </Cadre>
    );
  }

  if (etat.enCours) {
    return (
      <Composer
        epreuveId={etat.epreuveCbId}
        concours={etat.concours}
        matiere={etat.matiere}
        finLe={null}
        questions={etat.questions}
        reprise={{
          id: etat.repriseId,
          commenceeLe: etat.commenceeLe,
          dureeMinutes: etat.dureeMinutes,
        }}
      />
    );
  }

  return (
    <Cadre retour={etat.epreuveCbId}>
      <h1 className="mb-2 text-[clamp(1.6rem,4vw,2.2rem)] font-black">
        {etat.concours} — {etat.matiere}
      </h1>
      <p className="mb-6 max-w-[65ch]">
        Reprise du{" "}
        {new Date(etat.remiseLe).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })}
        . C&apos;est un entraînement : ta note de session ne change pas.
      </p>
      <form action={refaire} className="mb-8">
        <input type="hidden" name="epreuveId" value={etat.epreuveCbId} />
        <button
          type="submit"
          className="cursor-pointer rounded-full border-2 border-primaire px-6 py-2.5 font-extrabold text-primaire transition hover:bg-primaire/5"
        >
          Refaire encore
        </button>
      </form>
      <CopieCorrigee corrige={etat} reprise />
    </Cadre>
  );
}

function Cadre({ children, retour }: { children: React.ReactNode; retour?: string }) {
  return (
    <div className="mx-auto flex w-full max-w-[1000px] flex-1 flex-col px-4 sm:px-6">
      <EnteteEleve />
      <main className="flex-1 py-10">
        <p className="mb-6">
          <Link
            href={retour ? `/concours-blancs/${retour}/corrige` : "/concours-blancs"}
            className="font-bold text-primaire"
          >
            {retour ? "← Ma copie et mes reprises" : "← Mes concours blancs"}
          </Link>
        </p>
        {children}
      </main>
      <PiedDePage />
    </div>
  );
}
