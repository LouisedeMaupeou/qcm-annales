import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { chargerPassage } from "@/lib/passage-cb";
import { Composer } from "./composer";

export const dynamic = "force-dynamic";

const REFUS: Record<string, string> = {
  introuvable: "Cette épreuve n'existe pas, ou tu ne l'as pas commencée.",
  non_assignee: "Cette épreuve ne t'est pas assignée.",
  pas_ouverte: "La fenêtre de passage n'est pas encore ouverte.",
  fermee: "La fenêtre de passage est fermée.",
  deja_remis: "Tu as déjà remis cette copie.",
};

/** §4.3 : composition d'une épreuve blanche. §4.4 : embargo à la remise. */
export default async function Passage({
  params,
}: {
  params: Promise<{ epreuveId: string }>;
}) {
  const { epreuveId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/connexion?suite=/concours-blancs/${epreuveId}`);

  const etat = await chargerPassage(user.id, epreuveId);

  if ("refus" in etat) {
    return <Message titre="Épreuve indisponible" texte={REFUS[etat.refus] ?? REFUS.introuvable} />;
  }

  // §4.4 : à la remise, ni score ni corrigé. La copie est close, le bilan
  // viendra après validation par la responsable.
  if (etat.remis) {
    return (
      <Message
        titre="Copie remise"
        texte={`Ta copie de ${etat.concours} — ${etat.matiere} est enregistrée. Tu ne peux plus la modifier : chaque épreuve se compose une seule fois.`}
        detail="Ni note ni corrigé ne s'affichent maintenant. Tu recevras un email dès que ton bilan de session sera disponible, avec le détail corrigé de chaque copie."
      />
    );
  }

  if (etat.questions.length === 0) {
    return (
      <Message
        titre="Épreuve vide"
        texte="Aucune question n'est rattachée à cette épreuve. Signale-le à ton responsable : ta copie n'est pas perdue."
      />
    );
  }

  return (
    <Composer
      epreuveId={epreuveId}
      concours={etat.concours}
      matiere={etat.matiere}
      finLe={etat.finLe}
      questions={etat.questions}
    />
  );
}

function Message({
  titre,
  texte,
  detail,
}: {
  titre: string;
  texte: string;
  detail?: string;
}) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[620px] flex-col justify-center px-[22px] py-16">
      <h1 className="mb-3 text-[clamp(1.6rem,4vw,2.2rem)] font-black">{titre}</h1>
      <p className="mb-3">{texte}</p>
      {detail && <p className="mb-6 text-[0.95rem] opacity-80">{detail}</p>}
      <p>
        <Link href="/concours-blancs" className="font-bold text-primaire">
          ← Mes concours blancs
        </Link>
      </p>
    </div>
  );
}
