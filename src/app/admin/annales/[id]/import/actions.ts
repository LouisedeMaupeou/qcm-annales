"use server";

import { revalidatePath } from "next/cache";
import { exigerStaff } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";
import {
  analyserFichier,
  decisionPublication,
  type Anomalie,
} from "@/lib/import-questions";

export type EtatImport = {
  message?: string;
  rapport?: {
    simulation: boolean;
    lignes: number;
    questionsValides: number;
    lignesIgnorees: number;
    publiees: number;
    enRelecture: number;
    blocs: number;
    anomalies: Anomalie[];
    importees?: number;
  };
};

const TAILLE_MAX = 10 * 1024 * 1024;

export async function importerQuestions(
  _precedent: EtatImport,
  donnees: FormData,
): Promise<EtatImport> {
  await exigerStaff();

  const annaleId = String(donnees.get("annaleId") ?? "");
  const simulation = donnees.get("mode") !== "import";
  const fichier = donnees.get("fichier");

  if (!(fichier instanceof File) || fichier.size === 0) {
    return { message: "Choisis un fichier." };
  }
  if (fichier.size > TAILLE_MAX) {
    return { message: "Fichier trop volumineux (10 Mo maximum)." };
  }

  const supabase = await createClient();

  const { data: annale } = await supabase
    .from("annales")
    .select("id, annee, concours_id, concours(nom)")
    .eq("id", annaleId)
    .maybeSingle();

  if (!annale) return { message: "Annale introuvable." };

  const rapport = analyserFichier(await fichier.arrayBuffer());

  // Le fichier doit décrire l'annale ouverte : importer un ACCÈS 2025 dans une
  // fiche SÉSAME 2024 produirait un contenu incohérent et silencieux.
  const nomConcours = (annale.concours as unknown as { nom: string } | null)?.nom;
  if (rapport.concours && nomConcours && rapport.concours !== nomConcours) {
    rapport.anomalies.unshift({
      ligne: null,
      gravite: "bloquante",
      message: `Le fichier concerne « ${rapport.concours} », cette annale est « ${nomConcours} ».`,
    });
  }
  if (rapport.annee && rapport.annee !== annale.annee) {
    rapport.anomalies.unshift({
      ligne: null,
      gravite: "bloquante",
      message: `Le fichier concerne l'année ${rapport.annee}, cette annale est ${annale.annee}.`,
    });
  }

  const desaccordAnnale = rapport.anomalies.some(
    (a) => a.gravite === "bloquante" && a.ligne === null,
  );

  const { data: parametre } = await supabase
    .from("parametres")
    .select("valeur")
    .eq("cle", "seuil_confiance")
    .maybeSingle();
  const seuil = Number(parametre?.valeur ?? 90);

  const decisions = rapport.questions.map((q) => ({
    question: q,
    ...decisionPublication(q, seuil),
  }));

  const blocs = new Set(rapport.questions.map((q) => q.blocCle));

  const base = {
    simulation,
    lignes: rapport.lignes,
    questionsValides: rapport.questions.length,
    lignesIgnorees: rapport.ignorees,
    publiees: decisions.filter((d) => d.statut === "publie").length,
    enRelecture: decisions.filter((d) => d.statut === "a_verifier").length,
    blocs: blocs.size,
    anomalies: rapport.anomalies,
  };

  if (simulation || desaccordAnnale || rapport.questions.length === 0) {
    return {
      rapport: base,
      message: desaccordAnnale
        ? "Import bloqué : le fichier ne correspond pas à cette annale."
        : undefined,
    };
  }

  // --- Écriture ------------------------------------------------------------
  // §6.1 : import partiel. Les questions valides entrent, celles qui ont été
  // rejetées à l'analyse sont simplement absentes du rapport d'import.
  const { data: epreuvesExistantes } = await supabase
    .from("epreuves")
    .select("id, nom")
    .eq("concours_id", annale.concours_id);

  const epreuves = new Map(
    (epreuvesExistantes ?? []).map((e) => [e.nom, e.id as string]),
  );

  for (const nom of new Set(rapport.questions.map((q) => q.epreuve))) {
    if (epreuves.has(nom)) continue;
    const { data, error } = await supabase
      .from("epreuves")
      .insert({
        concours_id: annale.concours_id,
        nom,
        ordre_affichage: epreuves.size + 1,
      })
      .select("id")
      .single();
    if (error) return { message: `Épreuve « ${nom} » : ${error.message}` };
    epreuves.set(nom, data.id);
  }

  const { data: dernier } = await supabase
    .from("blocs")
    .select("ordre")
    .eq("annale_id", annaleId)
    .order("ordre", { ascending: false })
    .limit(1)
    .maybeSingle();

  let ordreBloc = (dernier?.ordre ?? -1) + 1;
  let importees = 0;

  // Regroupement en blocs, dans l'ordre d'apparition du fichier.
  const parBloc = new Map<string, typeof decisions>();
  for (const d of decisions) {
    if (!parBloc.has(d.question.blocCle)) parBloc.set(d.question.blocCle, []);
    parBloc.get(d.question.blocCle)!.push(d);
  }

  for (const [, membres] of parBloc) {
    const tete = membres[0].question;
    // Un bloc est tiré entier ou pas du tout (§2.2) : il n'est publié que si
    // toutes ses questions le sont.
    const blocPublie = membres.every((m) => m.statut === "publie");

    const { data: bloc, error: eBloc } = await supabase
      .from("blocs")
      .insert({
        annale_id: annaleId,
        epreuve_id: epreuves.get(tete.epreuve),
        // Le format d'import ne porte pas d'énoncé de bloc : chaque ligne a son
        // enonce_commun, qui appartient à la question. Un bloc lié reçoit son
        // chapeau à la relecture, quand les énoncés sont rendus auto-porteurs
        // (§10.3).
        enonce_commun: null,
        ordre: ordreBloc++,
        statut: blocPublie ? "publie" : "brouillon",
      })
      .select("id")
      .single();
    if (eBloc) return { message: `Bloc : ${eBloc.message}` };

    for (const [rang, m] of membres.entries()) {
      const q = m.question;
      const { data: question, error: eQuestion } = await supabase
        .from("questions")
        .insert({
          bloc_id: bloc.id,
          type: q.type,
          enonce: q.enonce,
          chapitre: q.chapitre,
          explication: q.explication,
          // Une explication fournie par un import est réputée non relue : le
          // §6.1 interdit de servir une explication non validée.
          explication_origine: q.explication ? "generee" : null,
          explication_relue: false,
          statut: m.statut,
          statut_extraction: q.statutExtraction,
          commentaire_extraction: q.commentaire,
          confiance_extraction: q.confiance,
          auto_publiee: m.autoPubliee,
          origine: "extraite",
          ordre_dans_bloc: rang,
          relue_par: null,
          relue_le: null,
        })
        .select("id")
        .single();
      if (eQuestion) return { message: `Question : ${eQuestion.message}` };

      const { error: eReponses } = await supabase.from("reponses_possibles").insert(
        q.propositions.map((p, i) => ({
          question_id: question.id,
          texte: p.texte,
          est_correcte: p.estCorrecte,
          ordre: p.ordre || i + 1,
        })),
      );
      if (eReponses) return { message: `Propositions : ${eReponses.message}` };

      importees += 1;
    }
  }

  revalidatePath(`/admin/annales/${annaleId}`);
  revalidatePath("/admin/relecture");

  return { rapport: { ...base, importees } };
}
