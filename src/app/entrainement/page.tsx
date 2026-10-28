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

/** §5.3.1 : un concours sans question jouable n'est pas affiché ; badge sur les concours visés. */
export default async function ChoixConcours() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const admin = createAdminClient();

  const [{ data: concours }, { data: vises }] = await Promise.all([
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
  ]);

  const idsVises = new Set((vises ?? []).map((v) => v.concours_id));

  // Volume jouable par concours : un concours sans question n'est pas affiché.
  //
  // Un comptage par concours, et non une lecture de toutes les questions à
  // compter en mémoire : PostgREST plafonne une réponse à 1 000 lignes, et la
  // banque a dépassé ce seuil. Les concours arrivés après la millième question
  // se voyaient attribuer zéro question et leur carte était grisée alors
  // qu'elles étaient jouables.
  //
  // Un bloc sans annale est un sujet de concours blanc : il n'appartient pas à
  // l'entraînement libre et ne doit pas gonfler ce compteur (module concours
  // blancs, §6).
  const volumes = await Promise.all(
    (concours ?? []).map(async (c) => {
      const { count } = await admin
        .from("questions")
        .select("id, blocs!inner(annale_id, epreuves!inner(concours_id))", {
          count: "exact",
          head: true,
        })
        .eq("statut", "publie")
        .not("blocs.annale_id", "is", null)
        .eq("blocs.epreuves.concours_id", c.id);
      return [c.id as string, count ?? 0] as const;
    }),
  );

  const disponibles = new Map<string, number>(volumes);

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
          // Un concours sans question jouable n'est pas affiché du tout.
          // Auparavant sa carte apparaissait grisée : elle occupait la page
          // en promettant un contenu qui n'existe pas, et la banque comporte
          // maintenant des épreuves réservées aux concours blancs, qui n'ont
          // par construction rien à servir ici.
          const items = (concours ?? []).filter(
            (c) => c.filiere === g.filiere && (disponibles.get(c.id) ?? 0) > 0,
          );
          if (items.length === 0) return null;

          return (
            <section key={g.filiere} className="mb-8">
              <h2 className="mb-3 text-sm font-extrabold tracking-[.08em] text-primaire-fonce uppercase">
                {g.libelle}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {items.map((c) => {
                  const nb = disponibles.get(c.id) ?? 0;
                  const vise = idsVises.has(c.id);

                  return (
                    <Link
                      key={c.id}
                      href={`/entrainement/${c.id}`}
                      className="rounded-carte border border-ligne bg-white p-5 no-underline transition hover:border-primaire"
                    >
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
                        {nb} question{nb > 1 ? "s" : ""} · sessions de{" "}
                        {c.taille_session}
                      </p>
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
