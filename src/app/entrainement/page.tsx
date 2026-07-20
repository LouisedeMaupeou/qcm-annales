import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EnteteEleve } from "@/components/entete-eleve";
import { PiedDePage } from "@/components/pied-de-page";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "M'entraîner — Admissible",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

/** §5.3.1 : cartes grisées si vide, badge sur les concours visés. */
export default async function ChoixConcours() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const admin = createAdminClient();

  const [{ data: concours }, { data: vises }, { data: questions }] =
    await Promise.all([
      admin
        .from("concours")
        .select("id, nom, filiere, taille_session")
        .eq("actif", true)
        .order("filiere")
        .order("nom"),
      supabase
        .from("user_concours_vises")
        .select("concours_id")
        .eq("user_id", user.id),
      // Volume jouable par concours : une carte vide doit être grisée.
      admin
        .from("questions")
        .select("id, blocs!inner(epreuves!inner(concours_id))")
        .eq("statut", "publie"),
    ]);

  const idsVises = new Set((vises ?? []).map((v) => v.concours_id));

  const disponibles = new Map<string, number>();
  for (const q of questions ?? []) {
    const bloc = q.blocs as unknown as { epreuves: { concours_id: string } | null } | null;
    const id = bloc?.epreuves?.concours_id;
    if (id) disponibles.set(id, (disponibles.get(id) ?? 0) + 1);
  }

  const groupes = [
    { filiere: "commerce" as const, libelle: "Écoles de commerce" },
    { filiere: "ingenieur" as const, libelle: "Écoles d'ingénieurs" },
  ];

  return (
    <div className="mx-auto flex w-full max-w-[900px] flex-1 flex-col px-[22px]">
      <EnteteEleve />

      <main className="flex-1 pb-16">
        <h1 className="mb-2 text-[clamp(1.8rem,4vw,2.4rem)] font-black">
          Sur quel concours veux-tu t&apos;entraîner ?
        </h1>
        <p className="mb-8">
          Chaque session applique le barème officiel du concours choisi.
        </p>

        {groupes.map((g) => {
          const items = (concours ?? []).filter((c) => c.filiere === g.filiere);
          if (items.length === 0) return null;

          return (
            <section key={g.filiere} className="mb-8">
              <h2 className="mb-3 text-sm font-extrabold tracking-[.08em] text-primaire-fonce uppercase">
                {g.libelle}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {items.map((c) => {
                  const nb = disponibles.get(c.id) ?? 0;
                  const vide = nb === 0;
                  const vise = idsVises.has(c.id);

                  const carte = (
                    <>
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <span className="text-xl font-black text-encre">
                          {c.nom}
                        </span>
                        {vise && (
                          <span className="rounded-full bg-primaire/10 px-2.5 py-0.5 text-[0.72rem] font-bold text-primaire-fonce">
                            ton concours
                          </span>
                        )}
                      </div>
                      <p className="text-[0.9rem]">
                        {vide
                          ? "Aucune question disponible pour l'instant"
                          : `${nb} question${nb > 1 ? "s" : ""} · sessions de ${c.taille_session}`}
                      </p>
                    </>
                  );

                  return vide ? (
                    <div
                      key={c.id}
                      aria-disabled
                      className="rounded-carte border border-ligne bg-fond-doux/60 p-5 opacity-60"
                    >
                      {carte}
                    </div>
                  ) : (
                    <Link
                      key={c.id}
                      href={`/entrainement/${c.id}`}
                      className="rounded-carte border border-ligne bg-white p-5 no-underline transition hover:border-primaire"
                    >
                      {carte}
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </main>

      <PiedDePage />
    </div>
  );
}
