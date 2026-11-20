import Link from "next/link";
import { notFound } from "next/navigation";
import { exigerOraux } from "@/lib/admin";
import { chargerOrauxEleve, listerSessionsOrales } from "@/lib/oraux-donnees";
import { FormulaireGrille } from "../../../[epreuveOraleId]/[userId]/formulaire-grille";

export const dynamic = "force-dynamic";

/**
 * Toutes les grilles d'un élève, sur un seul écran (§5.5).
 *
 * Un candidat de commerce passe quatre oraux. Les noter épreuve par épreuve
 * imposait quatre navigations par candidat, et obligeait le jury à retenir
 * entre deux écrans ce qu'il venait d'observer. Ici les grilles s'enchaînent,
 * dans l'ordre du référentiel, chacune avec son propre enregistrement : une
 * grille validée l'est seule, les autres restent en brouillon.
 */
export default async function OrauxDeLEleve({
  params,
}: {
  params: Promise<{ sessionId: string; userId: string }>;
}) {
  await exigerOraux();
  const { sessionId, userId } = await params;

  const session = (await listerSessionsOrales()).find((s) => s.id === sessionId);
  const donnees = await chargerOrauxEleve(sessionId, userId);
  if (!session || !donnees) notFound();

  const { eleve, evaluations } = donnees;
  const validees = evaluations.filter((e) => e.statut === "validee").length;

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href={`/admin/oraux/session/${sessionId}`} className="hover:underline">
          ← {session.nom}
        </Link>
      </p>

      <h1 className="mb-1 text-3xl font-black">
        {eleve.prenom} {eleve.nom}
      </h1>
      <p className="mb-8 text-sm opacity-75">
        {eleve.cohorte ?? "sans cohorte"} · {evaluations.length} oral
        {evaluations.length > 1 ? "aux" : ""} à noter · {validees} validé
        {validees > 1 ? "s" : ""}
      </p>

      {evaluations.length === 0 ? (
        <p className="rounded-carte border border-dashed border-ligne p-8 text-center">
          Aucun oral n&apos;est ouvert pour la filière de cet élève.
        </p>
      ) : (
        <div className="space-y-12">
          {evaluations.map((ev) => (
            <section key={ev.epreuve.id} className="border-t border-ligne pt-8 first:border-0 first:pt-0">
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="text-xl font-black text-encre">{ev.epreuve.nom}</h2>
                <span className="flex flex-wrap items-center gap-3 text-sm">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[0.75rem] font-bold ${
                      ev.epreuve.ponderation > 0
                        ? "bg-primaire/10 text-primaire-fonce"
                        : "bg-fond-doux text-encre"
                    }`}
                  >
                    {ev.epreuve.ponderation > 0
                      ? `${Math.round(ev.epreuve.ponderation * 100)} % de la note d'oral`
                      : "hors moyenne"}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[0.75rem] font-bold ${
                      ev.statut === "validee"
                        ? "bg-positif/15 text-positif"
                        : "bg-fond-doux text-encre"
                    }`}
                  >
                    {ev.statut === "validee" ? "validé" : "à noter"}
                  </span>
                </span>
              </div>

              {ev.professeur && ev.majLe && (
                <p className="mb-4 text-sm opacity-70">
                  Dernière saisie par {ev.professeur} le{" "}
                  {new Date(ev.majLe).toLocaleString("fr-FR", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </p>
              )}

              <FormulaireGrille
                epreuveOraleId={ev.epreuve.id}
                eleveId={userId}
                criteres={ev.epreuve.criteres}
                libelleContexte={ev.epreuve.contexte}
                contexte={ev.contexte}
                notes={ev.notes}
                note={ev.note}
                pointFort={ev.pointFort}
                progresPrioritaire={ev.progresPrioritaire}
                commentaireJury={ev.commentaireJury}
                statut={ev.statut}
              />
            </section>
          ))}
        </div>
      )}
    </>
  );
}
