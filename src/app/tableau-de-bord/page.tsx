import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EnteteEleve } from "@/components/entete-eleve";
import { PiedDePage } from "@/components/pied-de-page";
import { CourbeProgression } from "@/components/courbe-progression";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  chapitresARetravailler,
  courbesParMatiere,
  parMatiere,
  type SessionJouee,
} from "@/lib/progression";

export const metadata: Metadata = {
  title: "Ma progression — Admissible",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

const TENDANCE = {
  hausse: { texte: "en progrès", classe: "text-[#006300]" },
  baisse: { texte: "en baisse", classe: "text-negatif" },
  stable: { texte: "stable", classe: "opacity-70" },
  insuffisant: { texte: "—", classe: "opacity-50" },
} as const;

export default async function TableauDeBord({
  searchParams,
}: {
  searchParams: Promise<{ bienvenue?: string; motdepasse?: string; concours?: string }>;
}) {
  const { bienvenue, motdepasse, concours: filtreConcours } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const { data: profil } = await supabase
    .from("users")
    .select("prenom")
    .eq("id", user.id)
    .single();

  // Les sessions appartiennent à l'élève : la RLS suffit, pas de service_role.
  const { data: brutes } = await supabase
    .from("sessions")
    .select(
      "id, concours_id, epreuve_id, score_normalise, points, points_max, nb_questions, nb_correctes, completed_at, concours(nom), epreuves(nom)",
    )
    .eq("user_id", user.id)
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false });

  const toutes: SessionJouee[] = (brutes ?? []).map((s) => ({
    id: s.id,
    concoursId: s.concours_id,
    concoursNom: (s.concours as unknown as { nom: string } | null)?.nom ?? "—",
    epreuveId: s.epreuve_id,
    epreuveNom: (s.epreuves as unknown as { nom: string } | null)?.nom ?? "—",
    scoreNormalise: Number(s.score_normalise ?? 0),
    points: Number(s.points ?? 0),
    pointsMax: Number(s.points_max ?? 0),
    nbQuestions: s.nb_questions,
    nbCorrectes: s.nb_correctes,
    termineeLe: s.completed_at as string,
  }));

  // §5.4 : filtre concours.
  const concoursJoues = [
    ...new Map(toutes.map((s) => [s.concoursId, s.concoursNom])).entries(),
  ].map(([id, nom]) => ({ id, nom }));

  const sessions =
    filtreConcours && concoursJoues.some((c) => c.id === filtreConcours)
      ? toutes.filter((s) => s.concoursId === filtreConcours)
      : toutes;

  const lignes = parMatiere(sessions);
  const { points, series } = courbesParMatiere(sessions);

  // Chapitres à retravailler : lecture du détail des réponses. Les questions
  // étant fermées à l'élève par la RLS, on passe par le client serveur.
  const admin = createAdminClient();
  const { data: reponses } = await admin
    .from("session_questions")
    .select("statut, questions(chapitre), sessions!inner(user_id, concours_id)")
    .eq("sessions.user_id", user.id)
    .not("statut", "is", null);

  const chapitres = chapitresARetravailler(
    (reponses ?? [])
      .filter((r) => {
        if (!filtreConcours) return true;
        const s = r.sessions as unknown as { concours_id: string } | null;
        return s?.concours_id === filtreConcours;
      })
      .map((r) => ({
        chapitre:
          (r.questions as unknown as { chapitre: string } | null)?.chapitre ?? "—",
        statut: r.statut as string,
      })),
  );

  const totalQuestions = sessions.reduce((s, x) => s + x.nbQuestions, 0);
  const totalCorrectes = sessions.reduce((s, x) => s + x.nbCorrectes, 0);
  const scoreGlobal =
    sessions.length > 0
      ? sessions.reduce((s, x) => s + x.scoreNormalise, 0) / sessions.length
      : 0;

  return (
    <div className="mx-auto flex w-full max-w-[900px] flex-1 flex-col px-[22px]">
      <EnteteEleve />

      <main className="flex-1 pb-16">
        {bienvenue && (
          <p className="mb-6 rounded-carte bg-fond-doux p-4 text-[0.95rem]">
            Ton adresse est confirmée, ton compte est actif. Bienvenue !
          </p>
        )}
        {motdepasse && (
          <p className="mb-6 rounded-carte bg-fond-doux p-4 text-[0.95rem]">
            Ton mot de passe a bien été modifié.
          </p>
        )}

        <h1 className="mb-2 text-[clamp(1.8rem,4vw,2.4rem)] font-black">
          Salut {profil?.prenom} !
        </h1>

        {toutes.length === 0 ? (
          <Vide />
        ) : (
          <>
            <p className="mb-8">Voici où tu en es.</p>

            {concoursJoues.length > 1 && (
              <div className="mb-6 flex flex-wrap gap-2 text-sm">
                <Filtre actif={!filtreConcours} libelle="Tous les concours" />
                {concoursJoues.map((c) => (
                  <Filtre
                    key={c.id}
                    actif={filtreConcours === c.id}
                    libelle={c.nom}
                    valeur={c.id}
                  />
                ))}
              </div>
            )}

            <div className="mb-8 grid gap-4 sm:grid-cols-3">
              <Compteur valeur={String(sessions.length)} libelle={sessions.length > 1 ? "sessions jouées" : "session jouée"} />
              <Compteur
                valeur={`${Math.round(scoreGlobal * 100)} %`}
                libelle="score moyen"
              />
              <Compteur
                valeur={`${totalCorrectes}/${totalQuestions}`}
                libelle="bonnes réponses"
              />
            </div>

            <section className="mb-8 rounded-carte border border-ligne bg-white p-5 sm:p-6">
              <h2 className="mb-1 text-lg font-extrabold">
                Ton score par matière
              </h2>
              <p className="mb-4 text-[0.85rem] opacity-75">
                Score normalisé, comparable d&apos;un concours à l&apos;autre
                malgré des barèmes différents.
              </p>
              <CourbeProgression points={points} series={series} />
            </section>

            <section className="mb-8">
              <h2 className="mb-3 text-lg font-extrabold">Par matière</h2>
              <div className="overflow-x-auto rounded-carte border border-ligne bg-white">
                <table className="w-full border-collapse text-[0.95rem]">
                  <thead>
                    <tr className="bg-fond-doux text-left">
                      <Th>Matière</Th>
                      <Th>Sessions</Th>
                      <Th>Score moyen</Th>
                      <Th>Dernier</Th>
                      <Th>Tendance</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {lignes.map((l) => (
                      <tr key={l.epreuveId} className="border-t border-ligne">
                        <td className="px-4 py-3 font-bold text-encre">
                          {l.epreuveNom}
                          {concoursJoues.length > 1 && (
                            <span className="block text-[0.8rem] font-normal opacity-70">
                              {l.concoursNom}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 tabular-nums">{l.nbSessions}</td>
                        <td className="px-4 py-3 tabular-nums">
                          {Math.round(l.scoreMoyen * 100)} %
                        </td>
                        <td className="px-4 py-3 tabular-nums">
                          {Math.round(l.dernierScore * 100)} %
                        </td>
                        <td className={`px-4 py-3 font-bold ${TENDANCE[l.tendance].classe}`}>
                          {TENDANCE[l.tendance].texte}
                          {l.tendance !== "insuffisant" && l.tendance !== "stable" && (
                            <span className="ml-1 font-normal tabular-nums">
                              ({l.delta > 0 ? "+" : ""}
                              {Math.round(l.delta * 100)} pts)
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[0.8rem] opacity-70">
                La tendance compare tes premières sessions aux dernières. Elle
                apparaît à partir de trois sessions dans la matière.
              </p>
            </section>

            {chapitres.length > 0 && (
              <section className="mb-8">
                <h2 className="mb-1 text-lg font-extrabold">
                  Chapitres à retravailler
                </h2>
                <p className="mb-3 text-[0.85rem] opacity-75">
                  Classés par nombre de questions manquées.
                </p>
                <ul className="flex flex-wrap gap-2">
                  {chapitres.map((c) => (
                    <li
                      key={c.chapitre}
                      className="rounded-full bg-fond-doux px-4 py-2 text-[0.9rem]"
                    >
                      <span className="font-bold text-encre">{c.chapitre}</span>
                      <span className="ml-2 opacity-70 tabular-nums">
                        {c.rates}/{c.total} manquée{c.rates > 1 ? "s" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="mb-8">
              <h2 className="mb-3 text-lg font-extrabold">Historique</h2>
              <ul className="space-y-2">
                {sessions.slice(0, 20).map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/entrainement/session/${s.id}/correction`}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-carte border border-ligne bg-white px-4 py-3 no-underline transition hover:border-primaire"
                    >
                      <span>
                        <strong className="text-encre">{s.epreuveNom}</strong>
                        <span className="ml-2 text-[0.85rem] opacity-70">
                          {s.concoursNom} ·{" "}
                          {new Date(s.termineeLe).toLocaleDateString("fr-FR")}
                        </span>
                      </span>
                      <span className="text-[0.9rem] tabular-nums">
                        <strong className="text-encre">
                          {Math.round(s.scoreNormalise * 100)} %
                        </strong>
                        <span className="ml-2 opacity-70">
                          {s.nbCorrectes}/{s.nbQuestions} · {s.points} pt
                          {Math.abs(s.points) > 1 ? "s" : ""}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>

            <Link
              href="/entrainement"
              className="inline-flex cursor-pointer rounded-full bg-primaire px-8 py-3.5 font-extrabold text-white no-underline transition hover:bg-primaire-fonce"
            >
              Jouer une session
            </Link>
          </>
        )}
      </main>

      <PiedDePage />
    </div>
  );
}

function Vide() {
  return (
    <div className="mt-6 rounded-carte border border-ligne bg-white p-8 text-center">
      <p className="mb-2 text-lg font-extrabold text-encre">
        Ta progression s&apos;affichera ici
      </p>
      <p className="mx-auto mb-6 max-w-[48ch] text-[0.95rem]">
        Joue ta première session : tu verras ensuite ton score par matière, tes
        chapitres à retravailler et ton historique.
      </p>
      <Link
        href="/entrainement"
        className="inline-flex cursor-pointer rounded-full bg-primaire px-8 py-3.5 font-extrabold text-white no-underline transition hover:bg-primaire-fonce"
      >
        Commencer une session
      </Link>
    </div>
  );
}

function Filtre({
  actif,
  libelle,
  valeur,
}: {
  actif: boolean;
  libelle: string;
  valeur?: string;
}) {
  return (
    <Link
      href={valeur ? `/tableau-de-bord?concours=${valeur}` : "/tableau-de-bord"}
      className={`rounded-full px-4 py-2 font-bold no-underline ${
        actif ? "bg-primaire text-white" : "bg-fond-doux text-encre"
      }`}
    >
      {libelle}
    </Link>
  );
}

function Compteur({ valeur, libelle }: { valeur: string; libelle: string }) {
  return (
    <div className="rounded-carte border border-ligne bg-white p-5">
      <p className="text-3xl font-black text-encre">{valeur}</p>
      <p className="text-[0.95rem]">{libelle}</p>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 font-extrabold text-encre">{children}</th>;
}
