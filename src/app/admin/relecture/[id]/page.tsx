import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { exigerStaff } from "@/lib/admin";
import { FormulaireRelecture } from "./formulaire";

export const dynamic = "force-dynamic";

export default async function Relire({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await exigerStaff();
  const supabase = await createClient();

  const { data: question } = await supabase
    .from("questions")
    .select(
      "id, type, enonce, chapitre, explication, explication_origine, explication_relue, statut, statut_extraction, commentaire_extraction, confiance_extraction, auto_publiee, origine, updated_at, bloc_id, reponses_possibles(id, texte, est_correcte, ordre)",
    )
    .eq("id", id)
    .maybeSingle();

  if (!question) notFound();

  const { data: bloc } = await supabase
    .from("blocs")
    .select("id, annale_id, enonce_commun, annales(annee, concours(nom))")
    .eq("id", question.bloc_id)
    .single();

  const [{ data: documents }, { data: signalements }, { data: parametre }] =
    await Promise.all([
      supabase
        .from("annale_documents")
        .select("id, type, fichier_url")
        .eq("annale_id", bloc?.annale_id ?? ""),
      supabase
        .from("signalements")
        .select("id, motif, created_at")
        .eq("question_id", id)
        .eq("traite", false)
        .order("created_at", { ascending: false }),
      supabase
        .from("parametres")
        .select("valeur")
        .eq("cle", "seuil_confiance")
        .maybeSingle(),
    ]);

  // §6.1 : vue côte à côte avec le PDF source. Le bucket est privé, on sert
  // donc une URL signée de courte durée plutôt qu'un lien permanent.
  const admin = createAdminClient();
  const pdfs = await Promise.all(
    (documents ?? []).map(async (d) => {
      const { data } = await admin.storage
        .from("annales")
        .createSignedUrl(d.fichier_url, 60 * 30);
      return { type: d.type as string, url: data?.signedUrl ?? null };
    }),
  );

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

  const seuil = Number(parametre?.valeur ?? 90);

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/admin/relecture" className="hover:underline">
          ← File de relecture
        </Link>
      </p>
      <h1 className="mb-1 text-3xl font-black">
        {annale?.concours?.nom} {annale?.annee}
      </h1>
      <p className="mb-6 text-sm">
        {question.type} · extraction {question.statut_extraction} ·{" "}
        {question.confiance_extraction === null
          ? "aucun indice de confiance"
          : `confiance ${question.confiance_extraction} % (seuil ${seuil} %)`}
      </p>

      {(signalements ?? []).length > 0 && (
        <div className="mb-6 rounded-carte border-2 border-negatif bg-negatif/5 p-4 text-sm">
          <strong className="block text-encre">
            Signalée par un élève — retirée automatiquement des sessions
          </strong>
          <ul className="mt-2 space-y-1">
            {(signalements ?? []).map((s) => (
              <li key={s.id}>
                « {s.motif} » — {new Date(s.created_at).toLocaleDateString("fr-FR")}
              </li>
            ))}
          </ul>
        </div>
      )}

      {question.commentaire_extraction && (
        <div className="mb-6 rounded-carte border-2 border-soleil bg-soleil/10 p-4 text-sm">
          <strong className="block text-encre">Réserve d&apos;extraction</strong>
          {question.commentaire_extraction}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="order-2 xl:order-1">
          <h2 className="mb-3 text-sm font-extrabold tracking-[.08em] text-primaire-fonce uppercase">
            Source
          </h2>
          {pdfs.length === 0 ? (
            <p className="rounded-carte border border-dashed border-ligne p-6 text-sm">
              Aucun PDF source n&apos;est rattaché à cette annale. La relecture se
              fait alors sur le seul contenu saisi — rattache le sujet officiel
              depuis la fiche de l&apos;annale pour pouvoir comparer.
            </p>
          ) : (
            <div className="space-y-3">
              {pdfs.map((p, i) =>
                p.url ? (
                  <div key={i}>
                    <p className="mb-1 text-sm font-bold text-encre">{p.type}</p>
                    <iframe
                      src={p.url}
                      title={`PDF ${p.type}`}
                      className="h-[70vh] w-full rounded-carte border border-ligne"
                    />
                  </div>
                ) : (
                  <p key={i} className="text-sm text-negatif">
                    Document « {p.type} » illisible.
                  </p>
                ),
              )}
            </div>
          )}
        </section>

        <section className="order-1 xl:order-2">
          <h2 className="mb-3 text-sm font-extrabold tracking-[.08em] text-primaire-fonce uppercase">
            Question
          </h2>
          {bloc?.enonce_commun && (
            <p className="mb-4 rounded-carte bg-fond-doux p-4 text-[0.95rem]">
              {bloc.enonce_commun}
            </p>
          )}
          <FormulaireRelecture
            key={question.updated_at as string}
            question={{
              id: question.id,
              type: question.type,
              enonce: question.enonce,
              chapitre: question.chapitre,
              explication: question.explication,
              explicationOrigine: question.explication_origine ?? "humaine",
              explicationRelue: question.explication_relue,
            }}
            propositions={propositions}
          />
        </section>
      </div>
    </>
  );
}
