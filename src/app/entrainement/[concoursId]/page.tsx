import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EnteteEleve } from "@/components/entete-eleve";
import { PiedDePage } from "@/components/pied-de-page";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { demarrerSession } from "../actions";

export const metadata: Metadata = {
  title: "Choisir une épreuve — Admissible",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

/** §5.3.2 : choix de l'épreuve, avec questions disponibles et dernier score. */
export default async function ChoixEpreuve({
  params,
  searchParams,
}: {
  params: Promise<{ concoursId: string }>;
  searchParams: Promise<{ vide?: string; erreur?: string }>;
}) {
  const { concoursId } = await params;
  const { vide, erreur } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const admin = createAdminClient();

  const { data: concours } = await admin
    .from("concours")
    .select("id, nom, taille_session, actif")
    .eq("id", concoursId)
    .maybeSingle();

  if (!concours?.actif) notFound();

  const [{ data: epreuves }, { data: questions }, { data: sessions }] =
    await Promise.all([
      admin
        .from("epreuves")
        .select("id, nom, ordre_affichage")
        .eq("concours_id", concoursId)
        // Les épreuves créées pour les concours blancs ne sont pas de
        // l'entraînement libre (module concours blancs, §6).
        .eq("visible_public", true)
        .order("ordre_affichage"),
      admin
        .from("questions")
        // Les blocs sans annale sont des sujets de concours blancs : ils ne
        // sont pas jouables en entraînement libre (module concours blancs, §6).
        .select("id, statut, blocs!inner(epreuve_id, statut, annale_id)")
        .eq("statut", "publie")
        .eq("blocs.statut", "publie")
        .not("blocs.annale_id", "is", null),
      supabase
        .from("sessions")
        .select("epreuve_id, score_normalise, completed_at")
        .eq("user_id", user.id)
        .eq("concours_id", concoursId)
        .not("completed_at", "is", null)
        .order("completed_at", { ascending: false }),
    ]);

  const disponibles = new Map<string, number>();
  for (const q of questions ?? []) {
    const bloc = q.blocs as unknown as { epreuve_id: string } | null;
    if (bloc?.epreuve_id) {
      disponibles.set(bloc.epreuve_id, (disponibles.get(bloc.epreuve_id) ?? 0) + 1);
    }
  }

  const dernierScore = new Map<string, number>();
  for (const s of sessions ?? []) {
    if (!dernierScore.has(s.epreuve_id) && s.score_normalise !== null) {
      dernierScore.set(s.epreuve_id, s.score_normalise);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[820px] flex-1 flex-col px-[22px]">
      <EnteteEleve />

      <main className="flex-1 pb-16">
        <p className="mb-2 text-sm">
          <Link href="/entrainement" className="hover:underline">
            ← Tous les concours
          </Link>
        </p>
        <h1 className="mb-2 text-[clamp(1.8rem,4vw,2.4rem)] font-black">
          {concours.nom}
        </h1>
        <p className="mb-8">
          Sessions de {concours.taille_session} questions, barème officiel
          appliqué.
        </p>

        {vide && (
          <p
            role="alert"
            className="mb-6 rounded-carte border-2 border-soleil bg-soleil/10 p-4 text-sm"
          >
            Aucune question n&apos;est disponible pour cette épreuve pour
            l&apos;instant. Reviens bientôt : le contenu est en cours
            d&apos;ajout.
          </p>
        )}
        {erreur && (
          <p role="alert" className="mb-6 rounded-carte bg-negatif/10 p-4 text-sm text-negatif">
            La session n&apos;a pas pu démarrer. Réessaie dans un instant.
          </p>
        )}

        <div className="space-y-4">
          {(epreuves ?? []).map((e) => {
            const nb = disponibles.get(e.id) ?? 0;
            const score = dernierScore.get(e.id);

            return (
              <div
                key={e.id}
                className="flex flex-wrap items-center justify-between gap-4 rounded-carte border border-ligne bg-white p-5"
              >
                <div>
                  <p className="text-lg font-extrabold text-encre">{e.nom}</p>
                  <p className="text-[0.9rem]">
                    {nb === 0
                      ? "aucune question disponible"
                      : `${nb} question${nb > 1 ? "s" : ""} disponible${nb > 1 ? "s" : ""}`}
                    {score !== undefined && (
                      <>
                        {" · dernier score "}
                        <strong className="text-encre">
                          {Math.round(score * 100)} %
                        </strong>
                      </>
                    )}
                  </p>
                </div>

                {nb === 0 ? (
                  <span className="rounded-full bg-fond-doux px-6 py-3 text-sm font-bold opacity-60">
                    Bientôt
                  </span>
                ) : (
                  <form action={demarrerSession}>
                    <input type="hidden" name="concoursId" value={concoursId} />
                    <input type="hidden" name="epreuveId" value={e.id} />
                    <button
                      type="submit"
                      className="cursor-pointer rounded-full bg-primaire px-7 py-3 font-extrabold text-white transition hover:bg-primaire-fonce"
                    >
                      Commencer
                    </button>
                  </form>
                )}
              </div>
            );
          })}

          {(epreuves ?? []).length === 0 && (
            <p className="rounded-carte border border-dashed border-ligne p-6 text-sm">
              Aucune épreuve n&apos;est encore enregistrée pour ce concours.
            </p>
          )}
        </div>
      </main>

      <PiedDePage />
    </div>
  );
}
