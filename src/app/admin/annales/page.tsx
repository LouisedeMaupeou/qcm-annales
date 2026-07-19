import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const LIBELLE_STATUT: Record<string, string> = {
  brouillon: "brouillon",
  publie: "publiée",
  archive: "archivée",
};

/** §6.1 : vue par concours, une ligne par annale. */
export default async function ListeAnnales() {
  const supabase = await createClient();

  const { data: concours } = await supabase
    .from("concours")
    .select("id, nom, filiere, annales(id, annee, statut, format_source)")
    .order("filiere")
    .order("nom");

  // Volumétrie par annale, en une requête plutôt qu'une par ligne.
  const { data: questions } = await supabase
    .from("questions")
    .select("statut, blocs!inner(annale_id, epreuve_id)");

  const parAnnale = new Map<string, { total: number; publiees: number; epreuves: Set<string> }>();
  for (const q of questions ?? []) {
    const bloc = q.blocs as unknown as { annale_id: string; epreuve_id: string };
    const cle = bloc.annale_id;
    if (!parAnnale.has(cle))
      parAnnale.set(cle, { total: 0, publiees: 0, epreuves: new Set() });
    const e = parAnnale.get(cle)!;
    e.total += 1;
    if (q.statut === "publie") e.publiees += 1;
    e.epreuves.add(bloc.epreuve_id);
  }

  return (
    <>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-black">Annales</h1>
        <Link
          href="/admin/annales/nouvelle"
          className="cursor-pointer rounded-full bg-primaire px-7 py-3 font-extrabold text-white no-underline transition hover:bg-primaire-fonce"
        >
          Importer une annale
        </Link>
      </div>

      <div className="space-y-8">
        {(concours ?? []).map((c) => {
          const annales = [...((c.annales as unknown as {
            id: string;
            annee: number;
            statut: string;
            format_source: string;
          }[]) ?? [])].sort((a, b) => b.annee - a.annee);

          return (
            <section key={c.id}>
              <h2 className="mb-3 text-sm font-extrabold tracking-[.08em] text-primaire-fonce uppercase">
                {c.nom}
              </h2>

              {annales.length === 0 ? (
                <p className="rounded-carte border border-dashed border-ligne p-5 text-sm">
                  Aucune annale importée pour ce concours.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-carte border border-ligne">
                  <table className="w-full border-collapse text-[0.95rem]">
                    <thead>
                      <tr className="bg-fond-doux text-left">
                        <Th>Année</Th>
                        <Th>Épreuves</Th>
                        <Th>Questions</Th>
                        <Th>Format source</Th>
                        <Th>Statut</Th>
                        <Th> </Th>
                      </tr>
                    </thead>
                    <tbody>
                      {annales.map((a) => {
                        const stats = parAnnale.get(a.id);
                        return (
                          <tr key={a.id} className="border-t border-ligne">
                            <td className="px-4 py-3 font-bold">{a.annee}</td>
                            <td className="px-4 py-3">
                              {stats?.epreuves.size ?? 0}
                            </td>
                            <td className="px-4 py-3">
                              {stats ? (
                                <>
                                  {stats.publiees} publiée
                                  {stats.publiees > 1 ? "s" : ""}{" "}
                                  <span className="opacity-60">
                                    / {stats.total}
                                  </span>
                                </>
                              ) : (
                                "0"
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {a.format_source === "deux_documents"
                                ? "2 documents"
                                : "1 document"}
                            </td>
                            <td className="px-4 py-3">
                              {LIBELLE_STATUT[a.statut] ?? a.statut}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Link
                                href={`/admin/annales/${a.id}`}
                                className="font-bold text-primaire"
                              >
                                Ouvrir
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 font-extrabold text-encre">{children}</th>;
}
