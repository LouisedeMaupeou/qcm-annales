/**
 * Écriture d'un import de concours blancs (module concours blancs, §3).
 *
 * Séparé de la Server Action pour deux raisons : la Server Action ne doit
 * porter que ce qui relève du formulaire (lecture des fichiers, rapport,
 * revalidation), et cette écriture doit pouvoir se rejouer depuis un script,
 * hors navigateur — les imports en masse du dépôt se sont toujours faits en
 * ligne de commande, et le README reprochait à juste titre à ces scripts
 * d'être des copies ad hoc non committées.
 *
 * Le client Supabase est injecté plutôt que construit ici : c'est ce qui rend
 * le module utilisable aussi bien depuis le back-office que depuis
 * `scripts/importer-concours-blancs.mjs`. Il doit être un client service_role
 * — la RLS n'autorise pas ces écritures.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnomalieCb, QuestionCb } from "./import-cb.ts";
import type { EpreuveDecodee } from "./epreuves-cb.ts";
import type { EntreeZip } from "./zip.ts";

// Le schéma n'est pas typé par génération dans ce dépôt : on reste sur le
// client générique, comme le reste du code serveur.
type ClientEcriture = SupabaseClient;

const LOT = 100;

const decouper = <T>(liste: T[], taille = LOT): T[][] => {
  const lots: T[][] = [];
  for (let i = 0; i < liste.length; i += taille) lots.push(liste.slice(i, i + taille));
  return lots;
};

const TYPES_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  pdf: "application/pdf",
};


export async function ecrireQuestionsCb(
  admin: ClientEcriture,
  questions: QuestionCb[],
  images: Map<string, EntreeZip>,
  imagesManquantes: Set<string>,
  epreuvesDecodees: Map<string, EpreuveDecodee | null>,
) {
  const anomalies: AnomalieCb[] = [];

  // --- Concours et épreuves du référentiel ---------------------------------
  const { data: concoursExistants } = await admin.from("concours").select("id, nom");
  const concoursParNom = new Map((concoursExistants ?? []).map((c) => [c.nom, c.id as string]));

  const { data: epreuvesExistantes } = await admin
    .from("epreuves")
    .select("id, nom, concours_id");
  const epreuveParCle = new Map(
    (epreuvesExistantes ?? []).map((e) => [`${e.concours_id}|${e.nom}`, e.id as string]),
  );

  // epreuve_id_externe → id de l'épreuve du référentiel
  const epreuveDuSujet = new Map<string, string>();

  for (const [idExterne, decodee] of epreuvesDecodees) {
    if (!decodee) continue;
    const concoursId = concoursParNom.get(decodee.concours);
    if (!concoursId) {
      anomalies.push({
        ligne: null,
        gravite: "bloquante",
        message: `Concours « ${decodee.concours} » absent du référentiel : ${idExterne} non importée.`,
      });
      continue;
    }

    const cle = `${concoursId}|${decodee.matiere}`;
    let epreuveId: string = epreuveParCle.get(cle) ?? "";
    if (!epreuveId) {
      const { data, error } = await admin
        .from("epreuves")
        .insert({
          concours_id: concoursId,
          nom: decodee.matiere,
          ordre_affichage: 99,
          // Épreuve née d'un concours blanc : elle n'a pas à s'afficher dans
          // l'entraînement libre tant qu'aucune annale publique ne la peuple.
          visible_public: false,
        })
        .select("id")
        .single();
      if (error) throw new Error(`Épreuve « ${decodee.matiere} » : ${error.message}`);
      epreuveId = data.id;
      epreuveParCle.set(cle, epreuveId);
    }
    epreuveDuSujet.set(idExterne, epreuveId);
  }

  const importables = questions.filter((q) => epreuveDuSujet.has(q.epreuveIdExterne));
  if (importables.length === 0) return { creees: 0, misesAJour: 0, imagesTeleversees: 0, anomalies };

  // --- Images --------------------------------------------------------------
  // Seuls les fichiers réellement cités sont téléversés : un zip de 269 images
  // pour une épreuve de 45 questions ne doit pas remplir le bucket.
  const chemins = new Map<string, string>(); // nom de base → chemin de stockage
  let imagesTeleversees = 0;

  for (const q of importables) {
    for (const reference of [q.fichierImage, ...q.documents].filter(Boolean) as string[]) {
      const base = reference.split("/").pop()!;
      if (chemins.has(base)) continue;
      const entree = images.get(base);
      if (!entree) continue;

      const extension = base.split(".").pop()?.toLowerCase() ?? "";
      const chemin = `${q.epreuveIdExterne}/${base}`;
      const { error } = await admin.storage
        .from("concours-blancs")
        .upload(chemin, entree.contenu, {
          contentType: TYPES_MIME[extension] ?? "application/octet-stream",
          upsert: true,
        });
      if (error) {
        anomalies.push({
          ligne: q.ligne,
          gravite: "avertissement",
          message: `Image « ${base} » non téléversée : ${error.message}`,
        });
        continue;
      }
      chemins.set(base, chemin);
      imagesTeleversees += 1;
    }
  }

  const cheminDe = (reference: string | null) =>
    reference ? (chemins.get(reference.split("/").pop()!) ?? null) : null;

  // --- Blocs ---------------------------------------------------------------
  const parBloc = new Map<string, QuestionCb[]>();
  for (const q of importables) {
    if (!parBloc.has(q.blocCle)) parBloc.set(q.blocCle, []);
    parBloc.get(q.blocCle)!.push(q);
  }

  const blocsAEcrire = [...parBloc.entries()].map(([cle, membres]) => {
    const tete = [...membres].sort((a, b) => a.ordre - b.ordre)[0];
    return {
      bloc_id_externe: cle,
      epreuve_id_externe: tete.epreuveIdExterne,
      annale_id: null,
      epreuve_id: epreuveDuSujet.get(tete.epreuveIdExterne)!,
      enonce_commun: membres.find((m) => m.enonceCommun)?.enonceCommun ?? null,
      ordre: Math.round(tete.ordre),
      // Un bloc de concours blanc n'est jamais publié : il n'est pas tirable
      // en entraînement libre (cf. migration 20261027100200).
      statut: "brouillon" as const,
    };
  });

  const blocParCle = new Map<string, string>();
  for (const lot of decouper(blocsAEcrire)) {
    const { data, error } = await admin
      .from("blocs")
      .upsert(lot, { onConflict: "bloc_id_externe" })
      .select("id, bloc_id_externe");
    if (error) throw new Error(`Blocs : ${error.message}`);
    for (const b of data ?? []) blocParCle.set(b.bloc_id_externe as string, b.id as string);
  }

  // --- Questions -----------------------------------------------------------
  // On relit les questions déjà présentes avant de les écraser : une décision
  // de relecture humaine ne doit pas être annulée par un réimport du même
  // fichier. Le fichier fait foi sur le contenu, le relecteur fait foi sur le
  // statut (§6.1 du socle : rien n'est publié sans validation humaine, et
  // rien de validé ne redescend tout seul).
  const dejaLa: { id_question_externe: string; statut: string; statut_extraction: string; relue_le: string | null }[] = [];
  for (const lot of decouper(importables.map((q) => q.idExterne), 200)) {
    const { data, error } = await admin
      .from("questions")
      .select("id_question_externe, statut, statut_extraction, relue_le")
      .in("id_question_externe", lot);
    if (error) throw new Error(`Questions existantes : ${error.message}`);
    dejaLa.push(...((data ?? []) as typeof dejaLa));
  }
  const connues = new Map(dejaLa.map((q) => [q.id_question_externe, q]));
  let relectureConservee = 0;

  const rangDansBloc = new Map<string, number>();
  const questionsAEcrire = [...parBloc.values()].flatMap((membres) =>
    [...membres]
      .sort((a, b) => a.ordre - b.ordre)
      .map((q, rang) => {
        rangDansBloc.set(q.idExterne, rang);
        const douteuse = q.statutExtraction !== "ok" || imagesManquantes.has(q.idExterne);
        const existante = connues.get(q.idExterne);
        const relue = Boolean(existante?.relue_le);
        if (relue) relectureConservee += 1;
        return {
          id_question_externe: q.idExterne,
          epreuve_id_externe: q.epreuveIdExterne,
          bloc_id: blocParCle.get(q.blocCle)!,
          type: q.typeStocke,
          // L'énoncé peut être porté par l'image : la colonne est obligatoire,
          // on ne l'invente pas pour autant.
          enonce: q.enonce,
          image_url: cheminDe(q.fichierImage),
          chapitre: q.chapitre,
          sous_chapitre: q.sousChapitre,
          notions: q.notions,
          travail_a_realiser: q.travail,
          auto_correction: q.autoCorrection,
          retroaction_ciblee: q.retroaction,
          points_defaut: q.points,
          // §6.1 : une rétroaction importée n'est pas une explication relue.
          explication: q.retroaction,
          explication_origine: q.retroaction ? ("generee" as const) : null,
          explication_relue: false,
          statut: relue
            ? (existante!.statut as "publie" | "a_verifier" | "brouillon" | "depubliee")
            : douteuse
              ? ("a_verifier" as const)
              : ("publie" as const),
          statut_extraction: relue
            ? (existante!.statut_extraction as "manuel" | "ok" | "a_verifier")
            : q.statutExtraction,
          commentaire_extraction: q.commentaire,
          auto_publiee: !douteuse && !relue,
          origine: "extraite" as const,
          source_import: "csv" as const,
          ordre_dans_bloc: rangDansBloc.get(q.idExterne)!,
        };
      }),
  );

  const idParExterne = new Map<string, string>();
  for (const lot of decouper(questionsAEcrire)) {
    const { data, error } = await admin
      .from("questions")
      .upsert(lot, { onConflict: "id_question_externe" })
      .select("id, id_question_externe");
    if (error) throw new Error(`Questions : ${error.message}`);
    for (const q of data ?? []) {
      idParExterne.set(q.id_question_externe as string, q.id as string);
    }
  }

  // --- Propositions --------------------------------------------------------
  // Remplacées en bloc : une clé corrigée en relecture doit effacer l'ancienne,
  // pas s'y ajouter.
  const idsQuestions = [...idParExterne.values()];
  for (const lot of decouper(idsQuestions, 200)) {
    const { error } = await admin.from("reponses_possibles").delete().in("question_id", lot);
    if (error) throw new Error(`Propositions (nettoyage) : ${error.message}`);
  }

  const propositions = importables.flatMap((q) =>
    q.propositions.map((p) => ({
      question_id: idParExterne.get(q.idExterne)!,
      texte: p.texte,
      est_correcte: p.estCorrecte,
      ordre: p.ordre,
    })),
  );
  for (const lot of decouper(propositions, 500)) {
    const { error } = await admin.from("reponses_possibles").insert(lot);
    if (error) throw new Error(`Propositions : ${error.message}`);
  }

  // --- Documents de bloc ---------------------------------------------------
  const idsBlocs = [...blocParCle.values()];
  for (const lot of decouper(idsBlocs, 200)) {
    const { error } = await admin.from("bloc_documents").delete().in("bloc_id", lot);
    if (error) throw new Error(`Documents (nettoyage) : ${error.message}`);
  }

  const documents: { bloc_id: string; fichier_url: string; titre: string }[] = [];
  for (const [cle, membres] of parBloc) {
    const blocId = blocParCle.get(cle)!;
    const vus = new Set<string>();
    for (const q of membres) {
      for (const reference of q.documents) {
        const chemin = cheminDe(reference);
        if (!chemin || vus.has(chemin)) continue;
        vus.add(chemin);
        documents.push({
          bloc_id: blocId,
          fichier_url: chemin,
          titre: reference.split("/").pop()!,
        });
      }
    }
  }
  for (const lot of decouper(documents, 500)) {
    const { error } = await admin.from("bloc_documents").insert(lot);
    if (error) throw new Error(`Documents : ${error.message}`);
  }

  const misesAJour = importables.filter((q) => connues.has(q.idExterne)).length;
  if (relectureConservee > 0) {
    anomalies.push({
      ligne: null,
      gravite: "avertissement",
      message: `${relectureConservee} question(s) déjà relue(s) : contenu mis à jour, statut de relecture conservé.`,
    });
  }
  return {
    creees: importables.length - misesAJour,
    misesAJour,
    imagesTeleversees,
    anomalies,
  };
}
