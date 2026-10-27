"use server";

import { revalidatePath } from "next/cache";
import { exigerPrepa } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { analyserFichierCb, verifierImages, type AnomalieCb } from "@/lib/import-cb";
import { ecrireQuestionsCb } from "@/lib/import-cb-ecriture";
import { decoderEpreuveId, PREFIXES_CONNUS } from "@/lib/epreuves-cb";
import { indexerParNom, lireZip, ZipIllisible, type EntreeZip } from "@/lib/zip";

/**
 * Import des questions de concours blancs (module concours blancs, §3 et §9,
 * étape 10).
 *
 * Deux fichiers : le CSV/XLSX au format Parkours, et le zip de ses images.
 * Les questions entrent dans la banque du socle — mêmes tables, même file de
 * relecture — rattachées à une épreuve blanche plutôt qu'à une annale.
 *
 * L'import est idempotent : il se rejoue sur `id_question_externe` et
 * `bloc_id_externe`. Réimporter un fichier corrigé après relecture met à jour
 * les questions existantes au lieu de les dupliquer (§3).
 */

export type EtatImportCb = {
  message?: string;
  rapport?: {
    simulation: boolean;
    lignes: number;
    questionsValides: number;
    lignesIgnorees: number;
    blocs: number;
    epreuves: string[];
    publiables: number;
    enRelecture: number;
    correctionManuelle: number;
    imagesDansLeZip: number;
    imagesTeleversees: number;
    anomalies: AnomalieCb[];
    importees?: number;
    misesAJour?: number;
  };
};

const TAILLE_MAX_FICHIER = 10 * 1024 * 1024;
const TAILLE_MAX_ZIP = 40 * 1024 * 1024;

export async function importerQuestionsCb(
  _precedent: EtatImportCb,
  donnees: FormData,
): Promise<EtatImportCb> {
  await exigerPrepa();

  const simulation = donnees.get("mode") !== "import";
  const fichier = donnees.get("fichier");
  // Plusieurs zips acceptés : les sujets arrivent par concours (figures des
  // épreuves d'ingénieurs d'un côté, captures SÉSAME de l'autre) alors que le
  // fichier de questions, lui, peut couvrir toute la session.
  const archives = donnees.getAll("images").filter(
    (a): a is File => a instanceof File && a.size > 0,
  );

  if (!(fichier instanceof File) || fichier.size === 0) {
    return { message: "Choisis le fichier de questions." };
  }
  if (fichier.size > TAILLE_MAX_FICHIER) {
    return { message: "Fichier de questions trop volumineux (10 Mo maximum)." };
  }

  // --- Lecture -------------------------------------------------------------
  const rapport = analyserFichierCb(await fichier.arrayBuffer());
  const anomalies = [...rapport.anomalies];

  const entrees: EntreeZip[] = [];
  if (archives.reduce((s, a) => s + a.size, 0) > TAILLE_MAX_ZIP) {
    return { message: "Zips d'images trop volumineux (40 Mo au total)." };
  }
  for (const archive of archives) {
    try {
      entrees.push(...lireZip(await archive.arrayBuffer()));
    } catch (e) {
      return {
        message:
          e instanceof ZipIllisible
            ? `${archive.name} : ${e.message}`
            : `${archive.name} illisible : ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  const parNom = indexerParNom(entrees);
  const controle = verifierImages(rapport.questions, new Set(parNom.keys()));
  anomalies.push(...controle.anomalies);

  // --- Épreuves : un identifiant doit se décoder ----------------------------
  const epreuvesDecodees = new Map<string, ReturnType<typeof decoderEpreuveId>>();
  for (const id of rapport.epreuves) {
    const decodee = decoderEpreuveId(id);
    epreuvesDecodees.set(id, decodee);
    if (!decodee) {
      anomalies.push({
        ligne: null,
        gravite: "bloquante",
        message:
          `Épreuve « ${id} » non reconnue. Format attendu : <concours>-<matière>[-<session>], ` +
          `concours parmi ${PREFIXES_CONNUS.concours.join(", ")}, ` +
          `matière parmi ${PREFIXES_CONNUS.matieres.join(", ")}.`,
      });
    }
  }

  const retenues = rapport.questions.filter((q) => epreuvesDecodees.get(q.epreuveIdExterne));

  const enRelecture = retenues.filter(
    (q) => q.statutExtraction !== "ok" || controle.manquantes.has(q.idExterne),
  );

  const base = {
    simulation,
    lignes: rapport.lignes,
    questionsValides: retenues.length,
    lignesIgnorees: rapport.ignorees,
    blocs: new Set(retenues.map((q) => q.blocCle)).size,
    epreuves: rapport.epreuves,
    publiables: retenues.length - enRelecture.length,
    enRelecture: enRelecture.length,
    correctionManuelle: retenues.filter((q) => !q.autoCorrection).length,
    imagesDansLeZip: entrees.length,
    imagesTeleversees: 0,
    anomalies,
  };

  if (simulation || retenues.length === 0) return { rapport: base };

  // --- Écriture ------------------------------------------------------------
  try {
    const ecriture = await ecrireQuestionsCb(
      createAdminClient(),
      retenues,
      parNom,
      controle.manquantes,
      epreuvesDecodees,
    );
    anomalies.push(...ecriture.anomalies);

    revalidatePath("/admin/prepa/import");
    revalidatePath("/admin/relecture");

    return {
      rapport: {
        ...base,
        anomalies,
        importees: ecriture.creees,
        misesAJour: ecriture.misesAJour,
        imagesTeleversees: ecriture.imagesTeleversees,
      },
    };
  } catch (e) {
    console.error("Import concours blancs échoué :", e);
    return {
      message: `L'import s'est interrompu : ${e instanceof Error ? e.message : String(e)}. Les questions déjà écrites sont en base ; relancer l'import les mettra à jour plutôt que de les dupliquer.`,
      rapport: base,
    };
  }
}

