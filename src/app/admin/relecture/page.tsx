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

/**
 * Ordres de lecture de la file.
 *
 * Par défaut la plus ancienne d'abord : une question qui attend depuis trois
 * semaines doit se voir avant celle qui vient d'arriver. Mais relire va
 * beaucoup plus vite par lot homogène — vingt questions du même concours
 * portent la même réserve et se tranchent d'un même mouvement.
 */
const TRIS = [
  { cle: "arrivee", libelle: "Ordre d'arrivée" },
  { cle: "recentes", libelle: "Plus récentes d'abord" },
  { cle: "concours", libelle: "Par concours" },
] as const;

type Tri = (typeof TRIS)[number]["cle"];

/** PostgREST plafonne une réponse à 1000 lignes : on pagine explicitement. */
const PAGE = 1000;

type QuestionFile = {
  id: string;
  enonce: string;
  chapitre: string;
  statut: string;
  statut_extraction: string | null;
  commentaire_extraction: string | null;
  confiance_extraction: number | null;
  explication: string | null;
  explication_relue: boolean | null;
  created_at: string;
  updated_at: string;
  epreuve_id_externe: string | null;
  blocs: {
    annale_id: string | null;
    epreuve_id: string | null;
    epreuve_id_externe: string | null;
    annales: { annee: number; concours: { nom: string } | null } | null;
  } | null;
};

export default async function FileRelecture({
  searchParams,
}: {
  searchParams: Promise<{ motif?: string; tri?: string }>;
}) {
  const { motif: motifBrut, tri: triBrut } = await searchParams;
  const motif = (MOTIFS.find((m) => m.cle === motifBrut)?.cle ?? "tous") as Motif;
  const tri = (TRIS.find((t) => t.cle === triBrut)?.cle ?? "arrivee") as Tri;

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
  //
  // La lecture est paginée : sans cela, une file de plus de mille questions
  // était tronquée en silence, et les compteurs des filtres mentaient.
  const questions: QuestionFile[] = [];
  for (let de = 0; ; de += PAGE) {
    const { data } = await supabase
      .from("questions")
      .select(
        "id, enonce, chapitre, statut, statut_extraction, commentaire_extraction, confiance_extraction, explication, explication_relue, created_at, updated_at, epreuve_id_externe, blocs(annale_id, epreuve_id, epreuve_id_externe, annales(annee, concours(nom)))",
      )
      .in("statut", ["brouillon", "a_verifier", "depubliee"])
      .order("created_at", { ascending: true })
      .range(de, de + PAGE - 1);
    questions.push(...((data ?? []) as unknown as QuestionFile[]));
    if (!data || data.length < PAGE) break;
  }

  const enrichies = questions.map((q) => {
    const bloc = q.blocs;
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

  const origineDe = (q: (typeof enrichies)[number]) =>
    q.epreuveBlanche ? `concours blanc · ${q.epreuveBlanche}` : `${q.concours} ${q.annee}`;

  const filtrees = enrichies.filter((q) => correspond(q, motif));
  const compte = (m: Motif) => enrichies.filter((q) => correspond(q, m)).length;

  // Le tri par concours reste chronologique à l'intérieur d'une origine : les
  // questions d'un même sujet gardent l'ordre où elles ont été importées, qui
  // est celui du sujet.
  const ordonnees = [...filtrees].sort((a, b) => {
    if (tri === "concours") {
      const parOrigine = origineDe(a).localeCompare(origineDe(b), "fr");
      if (parOrigine !== 0) return parOrigine;
      return a.created_at.localeCompare(b.created_at);
    }
    return tri === "recentes"
      ? b.created_at.localeCompare(a.created_at)
      : a.created_at.localeCompare(b.created_at);
  });

  /** Filtre et tri voyagent ensemble : changer l'un ne doit pas perdre l'autre. */
  const lien = (m: Motif, t: Tri) => {
    const params = new URLSearchParams();
    if (m !== "tous") params.set("motif", m);
    if (t !== "arrivee") params.set("tri", t);
    const query = params.toString();
    return query ? `/admin/relecture?${query}` : "/admin/relecture";
  };

  // La liste passe côté client pour porter la sélection multiple : on ne lui
  // transmet que ce qu'elle affiche, en données sérialisables.
  const lignes: LigneRelecture[] = ordonnees.map((q) => ({
    id: q.id,
    enonce: q.enonce,
    chapitre: q.chapitre,
    origine: origineDe(q),
    arriveeLe: q.created_at,
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

      <div className="mb-3 flex flex-wrap gap-2 text-sm">
        {MOTIFS.map((m) => (
          <Link
            key={m.cle}
            href={lien(m.cle, tri)}
            className={`rounded-full px-4 py-2 font-bold no-underline ${
              motif === m.cle ? "bg-primaire text-white" : "bg-fond-doux text-encre"
            }`}
          >
            {m.libelle} ({compte(m.cle)})
          </Link>
        ))}
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2 text-sm">
        <span className="font-bold text-encre">Trier :</span>
        {TRIS.map((t) => (
          <Link
            key={t.cle}
            href={lien(motif, t.cle)}
            className={`rounded-full px-4 py-1.5 no-underline ${
              tri === t.cle
                ? "bg-encre font-bold text-white"
                : "border border-ligne text-encre"
            }`}
          >
            {t.libelle}
          </Link>
        ))}
      </div>

      {ordonnees.length === 0 ? (
        <p className="rounded-carte border border-dashed border-ligne p-8 text-center">
          Rien à relire ici.
        </p>
      ) : (
        <ListeRelecture questions={lignes} seuil={seuil} />
      )}
    </>
  );
}
