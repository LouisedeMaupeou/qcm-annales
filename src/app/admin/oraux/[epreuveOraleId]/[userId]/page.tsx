import Link from "next/link";
import { notFound } from "next/navigation";
import { exigerOraux } from "@/lib/admin";
import { chargerEvaluation } from "@/lib/oraux-donnees";
import { FormulaireGrille } from "./formulaire-grille";

export const dynamic = "force-dynamic";

/** §5.5 : grille d'évaluation, horodatée et signée de son auteur. */
export default async function Grille({
  params,
}: {
  params: Promise<{ epreuveOraleId: string; userId: string }>;
}) {
  await exigerOraux();
  const { epreuveOraleId, userId } = await params;

  const evaluation = await chargerEvaluation(epreuveOraleId, userId);
  if (!evaluation) notFound();

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href={`/admin/oraux/${epreuveOraleId}`} className="hover:underline">
          ← {evaluation.epreuve.nom}
        </Link>
      </p>

      <h1 className="mb-1 text-3xl font-black">
        {evaluation.eleve.prenom} {evaluation.eleve.nom}
      </h1>
      <p className="mb-6 text-sm opacity-75">
        {evaluation.eleve.cohorte ?? "sans cohorte"} · {evaluation.epreuve.session}
        {evaluation.professeur && ` · dernière saisie par ${evaluation.professeur}`}
        {evaluation.majLe &&
          ` le ${new Date(evaluation.majLe).toLocaleString("fr-FR", {
            dateStyle: "short",
            timeStyle: "short",
          })}`}
      </p>

      <FormulaireGrille
        epreuveOraleId={epreuveOraleId}
        eleveId={userId}
        criteres={evaluation.epreuve.criteres}
        libelleContexte={evaluation.epreuve.contexte}
        contexte={evaluation.contexte}
        notes={evaluation.notes}
        note={evaluation.note}
        pointFort={evaluation.pointFort}
        progresPrioritaire={evaluation.progresPrioritaire}
        commentaireJury={evaluation.commentaireJury}
        statut={evaluation.statut}
      />
    </>
  );
}
