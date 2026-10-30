import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ListeRelecture, type LigneRelecture } from "./liste";

export const dynamic = "force-dynamic";

/** §6.1 : file filtrable par motif de doute. */
const MOTIFS = [
  { cle: "tous", libelle: "Tous" },
  { cle: "signalement", libelle: "Signalées par un élève" },
  { cle: "confiance", libelle: "Sous le seuil de confiance" },
  { cle: "reserve", libelle: "Réserve d'extraction" },
  { cle: "sans-explication", libelle: "Sans explication relue" },
] as const;

type Motif = (typeof MOTIFS)[number]["cle"];

export default async function FileRelecture({
  searchParams,
}: {
  searchParams: Promise<{ motif?: string }>;
}) {
  const { motif: motifBrut } = await searchParams;
  const motif = (MOTIFS.find((m) => m.cle === motifBrut)?.cle ?? "tous") as Motif;

  const supabase = await createClient();

  const [{ data: parametre }, { data: signalements }] = await Promise.all([
    supabase.from("parametres").select("valeur").eq("cle", "seuil_confiance").maybeSingle(),
    supabase.from("signalements").select("question_id, motif, created_at").eq("traite", false),
  ]);

  const seuil = Number(parametre?.valeur ?? 90);
  const signalees = new Map<string, { motif: string; created_at: string }[]>();
  for (const s of signalements ?? []) {
    if (!signalees.has(s.question_id)) signalees.set(s.question_id, []);
    signalees.get(s.question_id)!.push(s);
  }

  // Entrent en file : tout ce qui n'est pas publié, plus les questions
  // dépubliées par un signalement élève (§6.1).
  const { data: questions } = await supabase
    .from("questions")
    .select(
      "id, enonce, chapitre, statut, statut_extraction, commentaire_extraction, confiance_extraction, explication, explication_relue, updated_at, epreuve_id_externe, blocs(annale_id, epreuve_id, epreuve_id_externe, annales(annee, concours(nom)))",
    )
    .in("statut", ["brouillon", "a_verifier", "depubliee"])
    .order("updated_at", { ascending: true });

  const enrichies = (questions ?? []).map((q) => {
    const bloc = q.blocs as unknown as {
      annale_id: string | null;
      epreuve_id_externe: string | null;
      annales: { annee: number; concours: { nom: string } | null } | null;
    } | null;
    return {
      ...q,
      signalements: signalees.get(q.id) ?? [],
      annaleId: bloc?.annale_id,
      annee: bloc?.annales?.annee,
      concours: bloc?.annales?.concours?.nom,
      // Une question de concours blanc ne descend pas d'une annale : elle
      // s'identifie par son épreuve blanche (module concours blancs, §3).
      epreuveBlanche: bloc?.epreuve_id_externe ?? q.epreuve_id_externe ?? null,
    };
  });

  const correspond = (q: (typeof enrichies)[number], m: Motif) => {
    switch (m) {
      case "signalement":
        return q.signalements.length > 0;
      case "confiance":
        return q.confiance_extraction !== null && q.confiance_extraction < seuil;
      case "reserve":
        return q.statut_extraction === "a_verifier" || !!q.commentaire_extraction;
      case "sans-explication":
        return !q.explication || !q.explication_relue;
      default:
        return true;
    }
  };

  const filtrees = enrichies.filter((q) => correspond(q, motif));
  const compte = (m: Motif) => enrichies.filter((q) => correspond(q, m)).length;

  // La liste passe côté client pour porter la sélection multiple : on ne lui
  // transmet que ce qu'elle affiche, en données sérialisables.
  const lignes: LigneRelecture[] = filtrees.map((q) => ({
    id: q.id,
    enonce: q.enonce,
    chapitre: q.chapitre,
    origine: q.epreuveBlanche
      ? `concours blanc · ${q.epreuveBlanche}`
      : `${q.concours} ${q.annee}`,
    confiance: q.confiance_extraction,
    commentaire: q.commentaire_extraction,
    nbSignalements: q.signalements.length,
    premierMotif: q.signalements[0]?.motif ?? null,
  }));

  return (
    <>
      <h1 className="mb-2 text-3xl font-black">File de relecture</h1>
      <p className="mb-6 max-w-[70ch]">
        Questions non publiées et questions retirées à la suite d&apos;un
        signalement. Une question sous le seuil de {seuil} % ne peut être publiée
        sans validation humaine.
      </p>

      <div className="mb-6 flex flex-wrap gap-2 text-sm">
        {MOTIFS.map((m) => (
          <Link
            key={m.cle}
            href={m.cle === "tous" ? "/admin/relecture" : `/admin/relecture?motif=${m.cle}`}
            className={`rounded-full px-4 py-2 font-bold no-underline ${
              motif === m.cle ? "bg-primaire text-white" : "bg-fond-doux text-encre"
            }`}
          >
            {m.libelle} ({compte(m.cle)})
          </Link>
        ))}
      </div>

      {filtrees.length === 0 ? (
        <p className="rounded-carte border border-dashed border-ligne p-8 text-center">
          Rien à relire ici.
        </p>
      ) : (
        <ListeRelecture questions={lignes} seuil={seuil} />
      )}
    </>
  );
}
