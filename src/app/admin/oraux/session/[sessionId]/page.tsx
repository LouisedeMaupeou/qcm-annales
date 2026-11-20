import Link from "next/link";
import { notFound } from "next/navigation";
import { exigerOraux } from "@/lib/admin";
import { elevesDeLaSession, listerSessionsOrales } from "@/lib/oraux-donnees";

export const dynamic = "force-dynamic";

const FILIERES = {
  commerce: "commerce",
  ingenieur: "ingénieurs",
} as const;

/**
 * Les élèves convoqués aux oraux d'une session (§5.5).
 *
 * L'entrée par épreuve convient à un jury qui enchaîne le même oral toute la
 * journée. Celle-ci convient au cas inverse, et plus fréquent : un candidat
 * se présente, on le note sur tout ce qu'il passe.
 */
export default async function ElevesDesOraux({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  await exigerOraux();
  const { sessionId } = await params;

  const session = (await listerSessionsOrales()).find((s) => s.id === sessionId);
  if (!session) notFound();

  const eleves = await elevesDeLaSession(sessionId);

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/admin/oraux" className="hover:underline">
          ← Oraux blancs
        </Link>
      </p>

      <h1 className="mb-1 text-3xl font-black">{session.nom}</h1>
      <p className="mb-8 text-sm opacity-75">
        {eleves.length} élève{eleves.length > 1 ? "s" : ""} convoqué
        {eleves.length > 1 ? "s" : ""} · {session.nbValidees}/{session.nbAttendues} grille
        {session.nbAttendues > 1 ? "s" : ""} validée{session.nbValidees > 1 ? "s" : ""}
      </p>

      {eleves.length === 0 ? (
        <p className="rounded-carte border border-dashed border-ligne p-8 text-center">
          Aucun élève n&apos;est rattaché aux cohortes de cette session.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {eleves.map((e) => {
            const complet = e.nbEpreuves > 0 && e.nbValidees === e.nbEpreuves;
            return (
              <li key={e.id}>
                <Link
                  href={`/admin/oraux/session/${sessionId}/${e.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-carte border border-ligne p-4 no-underline transition hover:border-primaire"
                >
                  <span>
                    <span className="font-extrabold text-encre">
                      {e.prenom} {e.nom}
                    </span>
                    <span className="ml-3 text-sm opacity-75">
                      {e.cohorte ?? "sans cohorte"} · {FILIERES[e.filiere]}
                    </span>
                  </span>

                  <span
                    className={`rounded-full px-3 py-0.5 text-[0.78rem] font-bold ${
                      complet
                        ? "bg-positif/15 text-positif"
                        : e.nbCommencees > 0
                          ? "bg-soleil/25 text-encre"
                          : "bg-fond-doux text-encre"
                    }`}
                  >
                    {e.nbValidees}/{e.nbEpreuves} oral
                    {e.nbEpreuves > 1 ? "s" : ""} noté{e.nbValidees > 1 ? "s" : ""}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
