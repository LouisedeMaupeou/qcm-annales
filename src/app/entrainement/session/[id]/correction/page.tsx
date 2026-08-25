import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EnteteEleve } from "@/components/entete-eleve";
import { PiedDePage } from "@/components/pied-de-page";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { chargerBareme } from "@/lib/session-entrainement";
import { coutEvite, formaterPenalite, formaterPoints } from "@/lib/scoring";
import { QuestionCorrigee } from "./question-corrigee";
import { demarrerSession } from "../../../actions";

export const metadata: Metadata = {
  title: "Correction — Admissible",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

/** §5.3.4 : correction de fin de session. */
export default async function Correction({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const admin = createAdminClient();

  const { data: session } = await admin
    .from("sessions")
    .select(
      "id, user_id, concours_id, epreuve_id, points, points_max, score_normalise, nb_questions, nb_correctes, nb_abstentions, completed_at, concours(nom), epreuves(nom)",
    )
    .eq("id", id)
    .maybeSingle();

  if (!session || session.user_id !== user.id) notFound();
  if (!session.completed_at) redirect(`/entrainement/session/${id}`);

  const bareme = await chargerBareme(session.concours_id, session.epreuve_id);

  const { data: lignes } = await admin
    .from("session_questions")
    .select(
      "id, ordre, statut, points, reponse, questions(id, type, enonce, chapitre, explication, explication_relue, reponses_possibles(id, texte, est_correcte, ordre))",
    )
    .eq("session_id", id)
    .order("ordre");

  const questions = (lignes ?? []).map((l) => {
    const q = l.questions as unknown as {
      id: string;
      type: "choix_unique" | "vrai_faux";
      enonce: string;
      chapitre: string;
      explication: string | null;
      explication_relue: boolean;
      reponses_possibles: {
        id: string;
        texte: string;
        est_correcte: boolean;
        ordre: number;
      }[];
    };

    return {
      questionId: q.id,
      type: q.type,
      enonce: q.enonce,
      chapitre: q.chapitre,
      // §6.1 : une explication non relue n'est jamais montrée à un élève. La
      // question reste corrigée, simplement sans commentaire.
      explication: q.explication_relue ? q.explication : null,
      statut: (l.statut ?? "abstention") as "correcte" | "incorrecte" | "abstention",
      points: Number(l.points ?? 0),
      reponse: l.reponse as Record<string, unknown> | null,
      propositions: [...(q.reponses_possibles ?? [])].sort(
        (a, b) => a.ordre - b.ordre,
      ),
    };
  });

  const concours = (session.concours as unknown as { nom: string } | null)?.nom;
  const epreuve = (session.epreuves as unknown as { nom: string } | null)?.nom;

  // Indicateur unique dans toute l'app : le score au barème (normalisé), le
  // même que celui du tableau de bord — pour ne pas afficher deux « % » qui
  // divergent (une session pouvait montrer 60 % ici et 20 % là).
  const scorePct = Math.round(Number(session.score_normalise ?? 0) * 100);

  const evite = coutEvite(bareme);
  const chapitres = [
    ...new Set(
      questions.filter((q) => q.statut !== "correcte").map((q) => q.chapitre),
    ),
  ];

  return (
    <div className="mx-auto flex w-full max-w-[820px] flex-1 flex-col px-[22px]">
      <EnteteEleve />

      <main className="flex-1 pb-16">
        <h1 className="mb-1 text-[clamp(1.8rem,4vw,2.4rem)] font-black">
          Session terminée
        </h1>
        <p className="mb-6">
          {concours} · {epreuve}
        </p>

        {/* §2.4 : score au barème officiel, indicateur unique de l'app. Les
            points bruts et le nombre de bonnes réponses restent en détail. */}
        <section className="mb-6 rounded-carte border border-ligne bg-white p-6">
          <p className="text-4xl font-black text-encre">
            {scorePct} %{" "}
            <span className="text-xl font-bold opacity-60">au barème</span>
          </p>
          <p className="mt-2">
            {formaterPoints(Number(session.points ?? 0))} point
            {Math.abs(Number(session.points ?? 0)) > 1 ? "s" : ""} sur{" "}
            {Number(session.points_max ?? 0)} possibles ·{" "}
            {session.nb_correctes} bonne{session.nb_correctes > 1 ? "s" : ""}{" "}
            réponse{session.nb_correctes > 1 ? "s" : ""} sur{" "}
            {session.nb_questions}
            {session.nb_abstentions > 0 && (
              <> · {session.nb_abstentions} abstention{session.nb_abstentions > 1 ? "s" : ""}</>
            )}
          </p>

          {session.nb_abstentions > 0 && evite > 0 && (
            <p className="mt-4 rounded-[14px] bg-fond-doux p-4 text-[0.95rem]">
              {/* Espaces explicites autour des expressions : collées au texte
                  voisin, JSX rendait « 2fois ». */}
              En ne répondant pas{" "}
              {session.nb_abstentions === 1
                ? "une fois"
                : `${session.nb_abstentions} fois`}
              , tu as évité jusqu&apos;à{" "}
              <strong className="text-encre">
                {formaterPenalite(evite * session.nb_abstentions)}
              </strong>{" "}
              de pénalité : sur ce concours, une mauvaise réponse coûte{" "}
              {formaterPoints(bareme.pointsMauvaise)}.
            </p>
          )}
          {session.nb_abstentions > 0 && evite === 0 && (
            <p className="mt-4 rounded-[14px] bg-fond-doux p-4 text-[0.95rem]">
              Sur ce concours, une mauvaise réponse ne retire aucun point : tu
              n&apos;as rien à gagner à t&apos;abstenir, mieux vaut tenter ta
              chance.
            </p>
          )}
        </section>

        {chapitres.length > 0 && (
          <section className="mb-8 rounded-carte bg-fond-doux p-5">
            <h2 className="mb-2 font-extrabold text-encre">
              Chapitres à retravailler
            </h2>
            <ul className="flex flex-wrap gap-2">
              {chapitres.map((c) => (
                <li
                  key={c}
                  className="rounded-full bg-white px-3.5 py-1.5 text-[0.85rem] font-bold"
                >
                  {c}
                </li>
              ))}
            </ul>
          </section>
        )}

        <h2 className="mb-3 text-xl font-black">Le détail</h2>
        <p className="mb-4 text-sm opacity-75">
          Les questions réussies sont repliées ; celles à revoir sont ouvertes.
        </p>

        <ol className="mb-8 space-y-3">
          {questions.map((q, i) => (
            <li key={q.questionId}>
              <QuestionCorrigee numero={i + 1} question={q} />
            </li>
          ))}
        </ol>

        {/* §5.3.4 : trois sorties */}
        <div className="flex flex-wrap gap-3">
          <form action={demarrerSession}>
            <input type="hidden" name="concoursId" value={session.concours_id} />
            <input type="hidden" name="epreuveId" value={session.epreuve_id} />
            <button
              type="submit"
              className="cursor-pointer rounded-full bg-primaire px-8 py-3.5 font-extrabold text-white transition hover:bg-primaire-fonce"
            >
              Refaire une session
            </button>
          </form>
          <Link
            href={`/entrainement/${session.concours_id}`}
            className="rounded-full border-2 border-ligne px-8 py-3.5 font-bold text-encre no-underline transition hover:bg-fond-doux"
          >
            Changer d&apos;épreuve
          </Link>
          <Link
            href="/tableau-de-bord"
            className="rounded-full border-2 border-ligne px-8 py-3.5 font-bold text-encre no-underline transition hover:bg-fond-doux"
          >
            Mon tableau de bord
          </Link>
        </div>
      </main>

      <PiedDePage />
    </div>
  );
}
