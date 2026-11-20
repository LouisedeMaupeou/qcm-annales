import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { decoderEpreuveId } from "@/lib/epreuves-cb";
import { urlsSigneesFigures } from "@/lib/images-questions";

/**
 * Ce que l'import a déposé dans la banque de concours blancs (§3).
 *
 * L'import dit ce qu'il a écrit, la file de relecture montre ce qui reste à
 * trancher, mais rien ne montrait le résultat : une fois une question validée,
 * elle quittait la file et devenait introuvable autrement qu'en connaissant
 * son identifiant. Cette section la retrouve par son épreuve.
 *
 * Elle sert aussi de garde-fou. Deux imports d'un même sujet sous des clés de
 * bloc différentes cohabitent sans se recouvrir, et deux sujets distincts
 * peuvent se retrouver rangés sous le même identifiant d'épreuve ; seul un
 * écran qui compte et date les questions le rend visible.
 */

/** PostgREST plafonne une réponse à 1000 lignes. */
const PAGE = 1000;

export type EpreuveImportee = {
  epreuveIdExterne: string;
  concours: string;
  matiere: string;
  session: string | null;
  total: number;
  publiees: number;
  enRelecture: number;
  avecFigure: number;
  sansEnonce: number;
  /** Dates d'import, pour repérer deux générations rangées au même endroit. */
  premierImport: string;
  dernierImport: string;
};

export type QuestionImportee = {
  id: string;
  ordre: number | null;
  type: string;
  enonce: string;
  enonceCommun: string | null;
  chapitre: string | null;
  statut: string;
  statutExtraction: string | null;
  commentaire: string | null;
  blocCle: string | null;
  importeeLe: string;
  figureUrl: string | null;
  documents: { titre: string | null; url: string | null }[];
  propositions: { id: string; texte: string; correcte: boolean }[];
};

type LigneBloc = {
  id: string;
  bloc_id_externe: string | null;
  epreuve_id_externe: string;
  enonce_commun: string | null;
  created_at: string;
};

/** Tous les blocs de concours blanc : ceux qui portent une épreuve externe. */
async function tousLesBlocs(): Promise<LigneBloc[]> {
  const admin = createAdminClient();
  const blocs: LigneBloc[] = [];
  for (let de = 0; ; de += PAGE) {
    const { data } = await admin
      .from("blocs")
      .select("id, bloc_id_externe, epreuve_id_externe, enonce_commun, created_at")
      .not("epreuve_id_externe", "is", null)
      .order("created_at")
      .range(de, de + PAGE - 1);
    blocs.push(...((data ?? []) as unknown as LigneBloc[]));
    if (!data || data.length < PAGE) break;
  }
  return blocs;
}

/** Une ligne par épreuve, avec de quoi juger l'état de son import. */
export async function listerEpreuvesImportees(): Promise<EpreuveImportee[]> {
  const admin = createAdminClient();
  const blocs = await tousLesBlocs();
  if (blocs.length === 0) return [];

  // Les questions sont filtrées sur leur propre `epreuve_id_externe`, pas sur
  // la liste de leurs blocs : passer sept cents identifiants dans l'URL
  // dépasse ce que PostgREST accepte, et la requête revient vide sans erreur.
  const questions: {
    epreuve_id_externe: string;
    statut: string;
    enonce: string;
    image_url: string | null;
    created_at: string;
  }[] = [];
  for (let de = 0; ; de += PAGE) {
    const { data } = await admin
      .from("questions")
      .select("epreuve_id_externe, statut, enonce, image_url, created_at")
      .not("epreuve_id_externe", "is", null)
      .range(de, de + PAGE - 1);
    questions.push(...((data ?? []) as typeof questions));
    if (!data || data.length < PAGE) break;
  }

  const parEpreuve = new Map<string, EpreuveImportee>();
  const vide = (id: string): EpreuveImportee => {
    const decodee = decoderEpreuveId(id);
    return {
      epreuveIdExterne: id,
      concours: decodee?.concours ?? "—",
      matiere: decodee?.matiere ?? id,
      session: decodee?.session ?? null,
      total: 0,
      publiees: 0,
      enRelecture: 0,
      avecFigure: 0,
      sansEnonce: 0,
      premierImport: "",
      dernierImport: "",
    };
  };

  for (const q of questions) {
    const id = q.epreuve_id_externe;
    if (!id) continue;
    if (!parEpreuve.has(id)) parEpreuve.set(id, vide(id));
    const e = parEpreuve.get(id)!;
    e.total += 1;
    if (q.statut === "publie") e.publiees += 1;
    else e.enRelecture += 1;
    if (q.image_url) e.avecFigure += 1;
    if (!q.enonce?.trim()) e.sansEnonce += 1;
    if (!e.premierImport || q.created_at < e.premierImport) e.premierImport = q.created_at;
    if (!e.dernierImport || q.created_at > e.dernierImport) e.dernierImport = q.created_at;
  }

  // Une épreuve dont tous les blocs sont vides existe quand même : la montrer
  // vaut mieux que la laisser invisible, c'est souvent le signe d'un ménage.
  for (const b of blocs) {
    if (!parEpreuve.has(b.epreuve_id_externe)) {
      parEpreuve.set(b.epreuve_id_externe, vide(b.epreuve_id_externe));
    }
  }

  return [...parEpreuve.values()].sort(
    (a, b) =>
      a.concours.localeCompare(b.concours, "fr") ||
      a.matiere.localeCompare(b.matiere, "fr") ||
      a.epreuveIdExterne.localeCompare(b.epreuveIdExterne),
  );
}

/** Le contenu d'une épreuve, dans l'ordre du sujet. */
export async function chargerEpreuveImportee(epreuveIdExterne: string): Promise<{
  entete: EpreuveImportee;
  questions: QuestionImportee[];
} | null> {
  const admin = createAdminClient();

  const { data: blocsBruts } = await admin
    .from("blocs")
    .select("id, bloc_id_externe, epreuve_id_externe, enonce_commun, created_at")
    .eq("epreuve_id_externe", epreuveIdExterne);

  const blocs = (blocsBruts ?? []) as unknown as LigneBloc[];
  if (blocs.length === 0) return null;

  const parBloc = new Map(blocs.map((b) => [b.id, b]));

  const brutes: {
    id: string;
    bloc_id: string;
    type: string;
    enonce: string;
    chapitre: string | null;
    statut: string;
    statut_extraction: string | null;
    commentaire_extraction: string | null;
    ordre_epreuve: number | null;
    image_url: string | null;
    created_at: string;
    reponses_possibles: { id: string; texte: string; est_correcte: boolean; ordre: number }[];
  }[] = [];
  for (let de = 0; ; de += PAGE) {
    const { data } = await admin
      .from("questions")
      .select(
        "id, bloc_id, type, enonce, chapitre, statut, statut_extraction, commentaire_extraction, ordre_epreuve, image_url, created_at, reponses_possibles(id, texte, est_correcte, ordre)",
      )
      .eq("epreuve_id_externe", epreuveIdExterne)
      .range(de, de + PAGE - 1);
    brutes.push(...((data ?? []) as typeof brutes));
    if (!data || data.length < PAGE) break;
  }

  const { data: documents } = await admin
    .from("bloc_documents")
    .select("bloc_id, titre, fichier_url")
    .in("bloc_id", [...parBloc.keys()])
    .order("titre");

  // Figures et documents sont signés en une fois : un sujet d'analyse
  // documentaire en compte une trentaine.
  const chemins = [
    ...brutes.map((q) => q.image_url).filter((v): v is string => Boolean(v)),
    ...(documents ?? []).map((d) => d.fichier_url as string),
  ];
  const signees = await urlsSigneesFigures(chemins, 3600);

  const documentsDuBloc = new Map<string, { titre: string | null; url: string | null }[]>();
  for (const d of documents ?? []) {
    const bloc = d.bloc_id as string;
    if (!documentsDuBloc.has(bloc)) documentsDuBloc.set(bloc, []);
    documentsDuBloc.get(bloc)!.push({
      titre: (d.titre as string | null) ?? null,
      url: signees.get(d.fichier_url as string) ?? null,
    });
  }

  const questions: QuestionImportee[] = brutes
    .map((q) => {
      const bloc = parBloc.get(q.bloc_id);
      return {
        id: q.id,
        ordre: q.ordre_epreuve === null ? null : Number(q.ordre_epreuve),
        type: q.type,
        enonce: q.enonce,
        enonceCommun: bloc?.enonce_commun ?? null,
        chapitre: q.chapitre,
        statut: q.statut,
        statutExtraction: q.statut_extraction,
        commentaire: q.commentaire_extraction,
        blocCle: bloc?.bloc_id_externe ?? null,
        importeeLe: q.created_at,
        figureUrl: q.image_url ? (signees.get(q.image_url) ?? null) : null,
        documents: documentsDuBloc.get(q.bloc_id) ?? [],
        propositions: [...(q.reponses_possibles ?? [])]
          .sort((a, b) => a.ordre - b.ordre)
          .map((p) => ({ id: p.id, texte: p.texte, correcte: p.est_correcte })),
      };
    })
    .sort(
      (a, b) =>
        (a.ordre ?? Number.MAX_SAFE_INTEGER) - (b.ordre ?? Number.MAX_SAFE_INTEGER) ||
        a.importeeLe.localeCompare(b.importeeLe),
    );

  const decodee = decoderEpreuveId(epreuveIdExterne);
  const dates = questions.map((q) => q.importeeLe).sort();

  return {
    entete: {
      epreuveIdExterne,
      concours: decodee?.concours ?? "—",
      matiere: decodee?.matiere ?? epreuveIdExterne,
      session: decodee?.session ?? null,
      total: questions.length,
      publiees: questions.filter((q) => q.statut === "publie").length,
      enRelecture: questions.filter((q) => q.statut !== "publie").length,
      avecFigure: questions.filter((q) => q.figureUrl).length,
      sansEnonce: questions.filter((q) => !q.enonce?.trim()).length,
      premierImport: dates[0] ?? "",
      dernierImport: dates[dates.length - 1] ?? "",
    },
    questions,
  };
}
