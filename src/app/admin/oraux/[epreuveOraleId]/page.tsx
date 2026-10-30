import Link from "next/link";
import { notFound } from "next/navigation";
import { exigerOraux } from "@/lib/admin";
import { chargerEpreuvesOrales, chercherEleves } from "@/lib/oraux-donnees";

export const dynamic = "force-dynamic";

/** §5.5 : « rechercher l'élève (nom, cohorte) → ouvrir sa grille ». */
export default async function EpreuveOrale({
  params,
  searchParams,
}: {
  params: Promise<{ epreuveOraleId: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  await exigerOraux();
  const { epreuveOraleId } = await params;
  const { q } = await searchParams;

  const epreuves = await chargerEpreuvesOrales();
  const epreuve = epreuves.find((e) => e.id === epreuveOraleId);
  if (!epreuve) notFound();

  const eleves = await chercherEleves(epreuveOraleId, q ?? "");

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/admin/oraux" className="hover:underline">
          ← Oraux blancs
        </Link>
      </p>
      <h1 className="mb-1 text-3xl font-black">{epreuve.nom}</h1>
      <p className="mb-6 text-sm opacity-75">
        {epreuve.session} ·{" "}
        {epreuve.filiere === "commerce" ? "écoles de commerce" : "écoles d'ingénieurs"} ·{" "}
        {epreuve.ponderation > 0
          ? `${Math.round(epreuve.ponderation * 100)} % de la note d'oral`
          : "hors moyenne"}
      </p>

      <form method="get" className="mb-6 flex flex-wrap items-end gap-3">
        <div className="min-w-[240px] flex-1">
          <label htmlFor="q" className="mb-1.5 block text-sm font-bold text-encre">
            Rechercher un élève
          </label>
          <input
            id="q"
            name="q"
            defaultValue={q ?? ""}
            placeholder="nom ou prénom"
            className="w-full rounded-[14px] border border-ligne bg-white px-4 py-2.5"
          />
        </div>
        <button
          type="submit"
          className="cursor-pointer rounded-full border-2 border-primaire px-6 py-2.5 font-extrabold text-primaire transition hover:bg-fond-doux"
        >
          Chercher
        </button>
      </form>

      {eleves.length === 0 ? (
        <p className="rounded-carte border border-dashed border-ligne p-8 text-center">
          {q
            ? `Aucun élève ne correspond à « ${q} ».`
            : "Aucun élève rattaché aux cohortes de cette session."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-carte border border-ligne">
          <table className="w-full border-collapse text-[0.9rem]">
            <thead>
              <tr className="bg-fond-doux text-left">
                <th className="px-4 py-3 font-extrabold text-encre">Élève</th>
                <th className="px-4 py-3 font-extrabold text-encre">Cohorte</th>
                <th className="px-4 py-3 font-extrabold text-encre">Note</th>
                <th className="px-4 py-3 font-extrabold text-encre">État</th>
              </tr>
            </thead>
            <tbody>
              {eleves.map((e) => (
                <tr key={e.id} className="border-t border-ligne">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/oraux/${epreuveOraleId}/${e.id}`}
                      className="font-bold text-encre no-underline hover:text-primaire"
                    >
                      {e.prenom} {e.nom}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{e.cohorte ?? "—"}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {e.note === null ? "—" : `${e.note}/${epreuve.maximum}`}
                  </td>
                  <td className="px-4 py-3">
                    {e.statut === "validee" ? (
                      <span className="rounded-full bg-primaire/10 px-2.5 py-0.5 text-[0.75rem] font-bold text-primaire-fonce">
                        validée
                      </span>
                    ) : e.statut === "brouillon" ? (
                      <span className="rounded-full bg-soleil/25 px-2.5 py-0.5 text-[0.75rem] font-bold">
                        brouillon
                      </span>
                    ) : (
                      <span className="opacity-60">pas encore évaluée</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
