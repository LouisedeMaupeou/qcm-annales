import Link from "next/link";
import { notFound } from "next/navigation";
import { urlSigneeFigure } from "@/lib/images-questions";
import { FigureQuestion } from "@/components/figure-question";
import { createClient } from "@/lib/supabase/server";
import { FormulaireQuestion } from "./formulaire";

export const dynamic = "force-dynamic";

export default async function EditerQuestion({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: question } = await supabase
    .from("questions")
    .select(
      "id, type, enonce, chapitre, explication, explication_origine, explication_relue, statut, statut_extraction, commentaire_extraction, confiance_extraction, auto_publiee, origine, ordre_dans_bloc, bloc_id, updated_at, image_url, reponses_possibles(id, texte, est_correcte, ordre)",
    )
    .eq("id", id)
    .maybeSingle();

  if (!question) notFound();

  const urlFigure = await urlSigneeFigure(question.image_url as string | null);

  const { data: bloc } = await supabase
    .from("blocs")
    .select("id, annale_id, enonce_commun, annales(annee, concours(nom))")
    .eq("id", question.bloc_id)
    .single();

  const { data: signalements } = await supabase
    .from("signalements")
    .select("id, motif, created_at, traite")
    .eq("question_id", id)
    .order("created_at", { ascending: false });

  const annale = bloc?.annales as unknown as {
    annee: number;
    concours: { nom: string } | null;
  } | null;

  const propositions = [
    ...((question.reponses_possibles as unknown as {
      id: string;
      texte: string;
      est_correcte: boolean;
      ordre: number;
    }[]) ?? []),
  ].sort((a, b) => a.ordre - b.ordre);

  return (
    <>
      <p className="mb-2 text-sm">
        <Link
          href={`/admin/annales/${bloc?.annale_id}`}
          className="hover:underline"
        >
          ← {annale?.concours?.nom} {annale?.annee}
        </Link>
      </p>
      <h1 className="mb-1 text-3xl font-black">Question</h1>
      <p className="mb-8 text-sm">
        {question.type} · extraction {question.statut_extraction} · origine{" "}
        {question.origine}
        {question.confiance_extraction !== null &&
          ` · confiance ${question.confiance_extraction} %`}
        {question.auto_publiee && " · auto-publiée"}
      </p>

      {question.commentaire_extraction && (
        <p className="mb-6 rounded-carte border-2 border-soleil bg-soleil/10 p-4 text-sm">
          <strong className="block text-encre">Réserve d&apos;extraction</strong>
          {question.commentaire_extraction}
        </p>
      )}

      {(signalements ?? []).filter((s) => !s.traite).length > 0 && (
        <div className="mb-6 rounded-carte border-2 border-negatif bg-negatif/5 p-4 text-sm">
          <strong className="block text-encre">
            Signalement élève — question dépubliée automatiquement
          </strong>
          <ul className="mt-2 space-y-1">
            {(signalements ?? [])
              .filter((s) => !s.traite)
              .map((s) => (
                <li key={s.id}>
                  « {s.motif} » —{" "}
                  {new Date(s.created_at).toLocaleDateString("fr-FR")}
                </li>
              ))}
          </ul>
        </div>
      )}

      {bloc?.enonce_commun && (
        <div className="mb-6 rounded-carte bg-fond-doux p-4">
          <p className="mb-1 text-sm font-extrabold text-encre">
            Énoncé commun du bloc
          </p>
          <p className="text-[0.95rem]">{bloc.enonce_commun}</p>
        </div>
      )}

      {/* `key` lié à updated_at : après un enregistrement, revalidatePath
          rafraîchit l'arbre serveur, et le formulaire doit repartir des
          valeurs réellement en base. Sans cette clé, les useState internes
          survivent au rafraîchissement et peuvent réafficher l'ancien état —
          notamment « explication relue », qui décide si une explication
          générée est montrée aux élèves (§6.1). */}
      <FigureQuestion
        url={urlFigure}
        chemin={question.image_url as string | null}
        legende="Figure rattachée à la question"
      />

      <FormulaireQuestion
        key={question.updated_at as string}
        question={{
          id: question.id,
          type: question.type,
          enonce: question.enonce,
          chapitre: question.chapitre,
          explication: question.explication,
          explicationOrigine: question.explication_origine ?? "humaine",
          explicationRelue: question.explication_relue,
          statut: question.statut,
        }}
        propositions={propositions}
      />
    </>
  );
}
