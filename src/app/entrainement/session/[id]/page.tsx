import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PiedDePage } from "@/components/pied-de-page";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { chargerQuestionJouable } from "@/lib/session-entrainement";
import { abandonnerSession } from "../../actions";
import { CarteQuestion } from "./carte-question";

export const metadata: Metadata = {
  title: "Session d'entraînement — Admissible",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

export default async function Session({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ reduite?: string }>;
}) {
  const { id } = await params;
  const { reduite } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const admin = createAdminClient();

  const { data: session } = await admin
    .from("sessions")
    .select("id, user_id, completed_at, nb_questions, concours(nom), epreuves(nom)")
    .eq("id", id)
    .maybeSingle();

  if (!session || session.user_id !== user.id) notFound();
  if (session.completed_at) redirect(`/entrainement/session/${id}/correction`);

  const { data: lignes } = await admin
    .from("session_questions")
    .select("id, ordre, statut")
    .eq("session_id", id)
    .order("ordre");

  const toutes = lignes ?? [];
  const courante = toutes.find((l) => l.statut === null);

  // Toutes répondues : la clôture a lieu dans l'action, mais on protège l'accès
  // direct à l'URL.
  if (!courante) redirect(`/entrainement/session/${id}/correction`);

  const question = await chargerQuestionJouable(courante.id);
  if (!question) notFound();

  const numero = toutes.filter((l) => l.statut !== null).length + 1;
  const concours = (session.concours as unknown as { nom: string } | null)?.nom;
  const epreuve = (session.epreuves as unknown as { nom: string } | null)?.nom;

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-1 flex-col px-[22px]">
      <header className="flex flex-wrap items-center justify-between gap-3 py-5">
        <div>
          <p className="text-[1.1rem] leading-none font-black tracking-tight text-encre">
            {concours}
          </p>
          <p className="text-[0.82rem]">{epreuve}</p>
        </div>
        <form action={abandonnerSession}>
          <input type="hidden" name="sessionId" value={id} />
          <button
            type="submit"
            className="cursor-pointer text-sm hover:underline"
          >
            Arrêter la session
          </button>
        </form>
      </header>

      <main className="flex-1 pb-16">
        {/* Indicateur de progression (§5.3.3) */}
        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between text-sm font-bold text-encre">
            <span>
              Question {numero} sur {toutes.length}
            </span>
            <span className="font-normal opacity-70">pas de chronomètre</span>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-ligne"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={toutes.length}
            aria-valuenow={numero - 1}
            aria-label="Progression dans la session"
          >
            <div
              className="h-full rounded-full bg-primaire transition-[width]"
              style={{ width: `${((numero - 1) / toutes.length) * 100}%` }}
            />
          </div>
        </div>

        {reduite && numero === 1 && (
          <p className="mb-6 rounded-carte border-2 border-soleil bg-soleil/10 p-4 text-sm">
            Cette session est plus courte que d&apos;habitude : il n&apos;y a pas
            encore assez de questions publiées sur cette épreuve. Elle compte
            quand même dans ta progression.
          </p>
        )}

        <CarteQuestion sessionId={id} question={question} />
      </main>

      <PiedDePage />
    </div>
  );
}
