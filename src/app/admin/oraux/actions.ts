"use server";

import { revalidatePath } from "next/cache";
import { exigerOraux, exigerPrepa } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  GRILLE_MOTIVATION,
  noteGlobale,
  validerNote,
  type Critere,
  type NotesCriteres,
} from "@/lib/oraux";

/** Épreuves orales et grilles (module concours blancs, §5.5). */

export type EtatOral = { message?: string; succes?: string };

/** Création d'une épreuve orale, avec la grille de motivation par défaut. */
export async function creerEpreuveOrale(
  _precedent: EtatOral,
  donnees: FormData,
): Promise<EtatOral> {
  await exigerPrepa();

  const sessionCbId = String(donnees.get("sessionId") ?? "");
  const concoursId = String(donnees.get("concoursId") ?? "");
  const nom = String(donnees.get("nom") ?? "").trim();
  if (!sessionCbId || !concoursId || !nom) {
    return { message: "Session, concours et intitulé sont nécessaires." };
  }

  const admin = createAdminClient();
  const { data: epreuve, error } = await admin
    .from("epreuves_orales")
    .insert({ session_cb_id: sessionCbId, concours_id: concoursId, nom })
    .select("id")
    .single();

  if (error) {
    return {
      message:
        error.code === "23505"
          ? "Cette épreuve orale existe déjà pour ce concours et cette session."
          : error.message,
    };
  }

  // Une épreuve sans grille ne sert à rien : on pose celle du §5.5, modifiable.
  await admin
    .from("grilles_oral")
    .insert({ epreuve_orale_id: epreuve.id, criteres: GRILLE_MOTIVATION });

  revalidatePath("/admin/oraux");
  return { succes: `Épreuve « ${nom} » créée avec la grille par défaut.` };
}

/**
 * Enregistre une évaluation.
 *
 * La note globale est recalculée ici et jamais reçue du formulaire : une note
 * qui part dans un bilan ne se prend pas sur parole du navigateur.
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

  const criteres = ((grille?.criteres as Critere[] | null) ?? GRILLE_MOTIVATION);

  const notes: NotesCriteres = {};
  for (const [index, critere] of criteres.entries()) {
    const brut = String(donnees.get(`critere-${index}`) ?? "").trim().replace(",", ".");
    if (!brut) {
      notes[String(index)] = null;
      continue;
    }
    const note = Number(brut);
    const refus = validerNote(critere, note);
    if (refus) return { message: `${critere.libelle} : ${refus}.` };
    notes[String(index)] = note;
  }

  const globale = noteGlobale(criteres, notes);

  if (valider && globale === null) {
    return { message: "Impossible de valider une grille sans aucune note." };
  }

  const { error } = await admin.from("evaluations_orales").upsert(
    {
      epreuve_orale_id: epreuveOraleId,
      user_id: eleveId,
      professeur_id: professeurId,
      notes_criteres: notes,
      note_globale: globale,
      appreciation: String(donnees.get("appreciation") ?? "").trim() || null,
      recommandation: String(donnees.get("recommandation") ?? "").trim() || null,
      statut: valider ? "validee" : "brouillon",
    },
    { onConflict: "epreuve_orale_id,user_id" },
  );

  if (error) return { message: `Enregistrement impossible : ${error.message}` };

  revalidatePath(`/admin/oraux/${epreuveOraleId}`);
  revalidatePath(`/admin/oraux/${epreuveOraleId}/${eleveId}`);

  return {
    succes:
      globale === null
        ? "Enregistré, aucune note pour l'instant."
        : `Enregistré. Note d'oral : ${globale}/20${valider ? ", évaluation validée." : "."}`,
  };
}
