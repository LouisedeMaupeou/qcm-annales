"use server";

import { revalidatePath } from "next/cache";
import { exigerOraux, exigerPrepa } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { ouvrirOrauxDeLaSession } from "@/lib/oraux-donnees";
import {
  grilleComplete,
  noteEpreuveOrale,
  validerNoteCritere,
  type CritereOral,
  type NotesCriteres,
} from "@/lib/oraux";

/** Oraux blancs (module concours blancs, §5.5). */

export type EtatOral = { message?: string; succes?: string };

/**
 * Ouvre les oraux d'une session : quatre épreuves pour les cohortes commerce,
 * l'oral de personnalité pour les cohortes ingénieurs, chacune avec sa grille.
 */
export async function ouvrirOraux(formulaire: FormData) {
  await exigerPrepa();
  const sessionCbId = String(formulaire.get("sessionId") ?? "");
  await ouvrirOrauxDeLaSession(sessionCbId);
  revalidatePath("/admin/oraux");
}

/**
 * Enregistre une évaluation.
 *
 * La note est recalculée ici et jamais reçue du formulaire : une note qui
 * part dans un bilan ne se prend pas sur parole du navigateur.
 */
export async function enregistrerEvaluation(
  _precedent: EtatOral,
  donnees: FormData,
): Promise<EtatOral> {
  const { userId: professeurId } = await exigerOraux();

  const epreuveOraleId = String(donnees.get("epreuveOraleId") ?? "");
  const eleveId = String(donnees.get("eleveId") ?? "");
  const valider = donnees.get("valider") === "oui";

  const admin = createAdminClient();

  const { data: grille } = await admin
    .from("grilles_oral")
    .select("criteres")
    .eq("epreuve_orale_id", epreuveOraleId)
    .eq("actif", true)
    .maybeSingle();

  const criteres = (grille?.criteres as CritereOral[] | null) ?? [];
  if (criteres.length === 0) {
    return { message: "Cette épreuve n'a pas de grille active." };
  }

  const notes: NotesCriteres = {};
  for (const [index, critere] of criteres.entries()) {
    const brut = String(donnees.get(`critere-${index}`) ?? "").trim().replace(",", ".");
    if (!brut) {
      notes[String(index)] = null;
      continue;
    }
    const note = Number(brut);
    const refus = validerNoteCritere(critere, note);
    if (refus) return { message: `${critere.libelle} : ${refus}.` };
    notes[String(index)] = note;
  }

  // Une évaluation validée part dans un bilan : la grille doit être entière.
  if (valider && !grilleComplete(criteres, notes)) {
    return {
      message:
        "Tous les critères doivent être notés avant validation — une case vide compte zéro et fausserait la note.",
    };
  }

  const note = noteEpreuveOrale(criteres, notes);

  const { error } = await admin.from("evaluations_orales").upsert(
    {
      epreuve_orale_id: epreuveOraleId,
      user_id: eleveId,
      professeur_id: professeurId,
      contexte: String(donnees.get("contexte") ?? "").trim() || null,
      notes_criteres: notes,
      note,
      point_fort: String(donnees.get("pointFort") ?? "").trim() || null,
      progres_prioritaire: String(donnees.get("progresPrioritaire") ?? "").trim() || null,
      commentaire_jury: String(donnees.get("commentaireJury") ?? "").trim() || null,
      statut: valider ? "validee" : "brouillon",
    },
    { onConflict: "epreuve_orale_id,user_id" },
  );

  if (error) return { message: `Enregistrement impossible : ${error.message}` };

  revalidatePath(`/admin/oraux/${epreuveOraleId}`);
  revalidatePath(`/admin/oraux/${epreuveOraleId}/${eleveId}`);

  return {
    succes: valider
      ? `Évaluation validée. Note d'oral : ${note}/20 — elle entrera dans le bilan.`
      : `Brouillon enregistré. Note provisoire : ${note}/20.`,
  };
}
