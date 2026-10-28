import Link from "next/link";
import { formaterMath } from "@/lib/notation-math";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Question = {
  id: string;
  enonce: string;
  type: string;
  chapitre: string;
  statut: string;
  explication: string | null;
  explication_relue: boolean;
  commentaire_extraction: string | null;
  confiance_extraction: number | null;
  ordre_dans_bloc: number;
};

type Bloc = {
  id: string;
  enonce_commun: string | null;
  ordre: number;
  statut: string;
  epreuve_id: string;
  questions: Question[];
};

const PASTILLE: Record<string, string> = {
  publie: "bg-primaire/10 text-primaire-fonce",
  a_verifier: "bg-soleil/25 text-encre",
  brouillon: "bg-ligne text-encre",
  depubliee: "bg-negatif/10 text-negatif",
};

const LIBELLE: Record<string, string> = {
  publie: "publiée",
  a_verifier: "à vérifier",
  brouillon: "brouillon",
  depubliee: "dépubliée",
};

export default async function DetailAnnale({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ filtre?: string }>;
}) {
  const { id } = await params;
  const { filtre } = await searchParams;
  const supabase = await createClient();

  const { data: annale } = await supabase
    .from("annales")
    .select("id, annee, statut, format_source, concours(nom)")
    .eq("id", id)
    .maybeSingle();

  if (!annale) notFound();

  const [{ data: epreuves }, { data: blocs }, { data: documents }] =
    await Promise.all([
      supabase.from("epreuves").select("id, nom, ordre_affichage"),
      supabase
        .from("blocs")
        .select(
          "id, enonce_commun, ordre, statut, epreuve_id, questions(id, enonce, type, chapitre, statut, explication, explication_relue, commentaire_extraction, confiance_extraction, ordre_dans_bloc)",
        )
        .eq("annale_id", id)
        .order("ordre"),
      supabase
        .from("annale_documents")
        .select("id, type, fichier_url")
        .eq("annale_id", id),
    ]);

  const nomEpreuve = new Map((epreuves ?? []).map((e) => [e.id, e.nom]));

  const tousBlocs = ((blocs ?? []) as unknown as Bloc[]).map((b) => ({
    ...b,
    questions: [...b.questions].sort(
      (x, y) => x.ordre_dans_bloc - y.ordre_dans_bloc,
    ),
  }));

  // §6.1 : filtre « sans explication ».
  const blocsFiltres =
    filtre === "sans-explication"
      ? tousBlocs
          .map((b) => ({
            ...b,
            questions: b.questions.filter((q) => !q.explication),
          }))
          .filter((b) => b.questions.length > 0)
      : filtre === "relecture"
        ? tousBlocs
            .map((b) => ({
              ...b,
              questions: b.questions.filter((q) => q.statut !== "publie"),
            }))
            .filter((b) => b.questions.length > 0)
        : tousBlocs;

  const toutes = tousBlocs.flatMap((b) => b.questions);
  const concours = (annale.concours as unknown as { nom: string } | null)?.nom;

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/admin/annales" className="hover:underline">
          ← Annales
        </Link>
      </p>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-black">
          {concours} {annale.annee}
        </h1>
        <Link
          href={`/admin/annales/${id}/import`}
          className="cursor-pointer rounded-full bg-primaire px-7 py-3 font-extrabold text-white no-underline transition hover:bg-primaire-fonce"
        >
          Import en masse
        </Link>
      </div>
      <p className="mb-8 text-sm">
        {annale.statut} ·{" "}
        {annale.format_source === "deux_documents"
          ? "sujet et corrigé séparés"
          : "document unique"}{" "}
        · {documents?.length ?? 0} PDF archivé
        {(documents?.length ?? 0) > 1 ? "s" : ""} · {toutes.length} questions
      </p>

      <div className="mb-6 flex flex-wrap gap-2 text-sm">
        <Onglet id={id} valeur={undefined} actif={!filtre} libelle={`Toutes (${toutes.length})`} />
        <Onglet
          id={id}
          valeur="relecture"
          actif={filtre === "relecture"}
          libelle={`À relire (${toutes.filter((q) => q.statut !== "publie").length})`}
        />
        <Onglet
          id={id}
          valeur="sans-explication"
          actif={filtre === "sans-explication"}
          libelle={`Sans explication (${toutes.filter((q) => !q.explication).length})`}
        />
      </div>

      <div className="space-y-5">
        {blocsFiltres.map((bloc) => (
          <section
            key={bloc.id}
            className="rounded-carte border border-ligne p-5"
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-extrabold tracking-[.08em] text-primaire-fonce uppercase">
                  {nomEpreuve.get(bloc.epreuve_id) ?? "épreuve inconnue"}
                </p>
                {bloc.questions.length > 1 && (
                  <p className="mt-1 text-sm font-bold text-encre">
                    Bloc lié de {bloc.questions.length} questions — tiré entier
                    ou pas du tout
                  </p>
                )}
              </div>
              {/* Pour un bloc d'une seule question, le statut du bloc et celui
                  de la question disent la même chose : on n'affiche que la
                  seconde, plus bas. */}
              {bloc.questions.length > 1 && <Pastille statut={bloc.statut} />}
            </div>

            {bloc.enonce_commun && (
              <p className="mb-4 rounded-[14px] bg-fond-doux p-4 text-[0.95rem]">
                {bloc.enonce_commun}
              </p>
            )}

            <ul className="space-y-2">
              {bloc.questions.map((q) => (
                <li key={q.id}>
                  <Link
                    href={`/admin/questions/${q.id}`}
                    className="block rounded-[14px] border border-ligne p-4 no-underline transition hover:border-primaire"
                  >
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <Pastille statut={q.statut} />
                      <span className="rounded-full bg-fond-doux px-2.5 py-0.5 text-[0.75rem] font-bold">
                        {q.type}
                      </span>
                      <span className="rounded-full bg-fond-doux px-2.5 py-0.5 text-[0.75rem] font-bold">
                        {q.chapitre}
                      </span>
                      {!q.explication && (
                        <span className="text-[0.75rem] font-bold opacity-60">
                          sans explication
                        </span>
                      )}
                    </div>
                    <p className="line-clamp-2 text-[0.95rem] text-encre">
                      {formaterMath(q.enonce)}
                    </p>
                    {q.commentaire_extraction && (
                      <p className="mt-1.5 text-[0.82rem] text-negatif">
                        {q.commentaire_extraction}
                      </p>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}

        {blocsFiltres.length === 0 && (
          <p className="rounded-carte border border-dashed border-ligne p-6 text-sm">
            Aucune question ne correspond à ce filtre.
          </p>
        )}
      </div>
    </>
  );
}

function Onglet({
  id,
  valeur,
  actif,
  libelle,
}: {
  id: string;
  valeur?: string;
  actif: boolean;
  libelle: string;
}) {
  return (
    <Link
      href={valeur ? `/admin/annales/${id}?filtre=${valeur}` : `/admin/annales/${id}`}
      className={`rounded-full px-4 py-2 font-bold no-underline ${
        actif ? "bg-primaire text-white" : "bg-fond-doux text-encre"
      }`}
    >
      {libelle}
    </Link>
  );
}

function Pastille({ statut }: { statut: string }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-[0.75rem] font-bold ${
        PASTILLE[statut] ?? "bg-ligne"
      }`}
    >
      {LIBELLE[statut] ?? statut}
    </span>
  );
}
