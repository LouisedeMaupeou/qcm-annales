"use server";

import { revalidatePath } from "next/cache";
import { exigerPrepa } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { baremeOfficiel, decoderEpreuveId, dureeOfficielle } from "@/lib/epreuves-cb";
import { emailRelanceConcoursBlanc, envoyerEmail } from "@/lib/emails";
import { urlSite } from "@/lib/site";

/**
 * Sessions et épreuves blanches (module concours blancs, §5.2).
 *
 * Écritures du back-office Prépa, en service_role après contrôle du rôle :
 * la RLS laisse écrire `responsable_prepa`, mais les listes d'élèves du suivi
 * demandent de lire `users` au-delà de ce que la politique expose.
 */

export type EtatSession = { message?: string; succes?: string };

export async function creerSession(
  _precedent: EtatSession,
  donnees: FormData,
): Promise<EtatSession> {
  await exigerPrepa();

  const nom = String(donnees.get("nom") ?? "").trim();
  if (!nom) return { message: "Donne un nom à la session." };

  const admin = createAdminClient();
  const { error } = await admin.from("sessions_cb").insert({ nom });
  if (error) {
    return {
      message: error.code === "23505" ? "Une session porte déjà ce nom." : error.message,
    };
  }

  revalidatePath("/admin/prepa/sessions");
  return { succes: `Session « ${nom} » créée.` };
}

export async function changerStatutSession(formulaire: FormData) {
  await exigerPrepa();
  const id = String(formulaire.get("sessionId") ?? "");
  const statut = String(formulaire.get("statut") ?? "");
  if (!["preparation", "ouverte", "correction", "cloturee"].includes(statut)) return;

  const admin = createAdminClient();
  await admin.from("sessions_cb").update({ statut }).eq("id", id);
  revalidatePath("/admin/prepa/sessions");
  revalidatePath(`/admin/prepa/sessions/${id}`);
}

// ---------------------------------------------------------------------------
// Épreuves
// ---------------------------------------------------------------------------

export type EtatEpreuve = { message?: string; succes?: string };

/**
 * Place une épreuve importée dans la session : copie ses questions dans
 * l'ordre du sujet, et préremplit durée et barème officiels (§3 et §10).
 *
 * L'ordre vient de `questions.ordre_epreuve`, écrit à l'import depuis la
 * colonne `ordre` du fichier. Pour les questions importées avant que cette
 * colonne existe, on retombe sur la reconstruction historique
 * (`blocs.ordre` + `ordre_dans_bloc`), qui donne le même résultat partout
 * sauf là où un bloc porte plusieurs questions numérotées — l'analyse
 * documentaire SÉSAME.
 */
export async function ajouterEpreuve(
  _precedent: EtatEpreuve,
  donnees: FormData,
): Promise<EtatEpreuve> {
  await exigerPrepa();

  const sessionCbId = String(donnees.get("sessionId") ?? "");
  const choisies = [
    ...new Set(donnees.getAll("epreuveIdExterne").map(String).map((v) => v.trim()).filter(Boolean)),
  ];
  if (choisies.length === 0) return { message: "Choisis au moins une épreuve." };

  const admin = createAdminClient();
  const succes: string[] = [];
  const echecs: string[] = [];

  // Une épreuve qui échoue n'empêche pas les suivantes d'entrer : le rapport
  // dit ce qui est passé et ce qui ne l'est pas, comme à l'import.
  for (const epreuveIdExterne of choisies.sort()) {
    const resultat = await ajouterUneEpreuve(admin, sessionCbId, epreuveIdExterne);
    if (resultat.erreur) echecs.push(`${epreuveIdExterne} : ${resultat.erreur}`);
    else succes.push(resultat.resume!);
  }

  revalidatePath(`/admin/prepa/sessions/${sessionCbId}`);

  return {
    succes: succes.length > 0 ? succes.join(" · ") : undefined,
    message: echecs.length > 0 ? echecs.join(" — ") : undefined,
  };
}

type ClientAdmin = ReturnType<typeof createAdminClient>;

/** Place une épreuve dans la session. Ne révalide pas : l'appelant s'en charge. */
async function ajouterUneEpreuve(
  admin: ClientAdmin,
  sessionCbId: string,
  epreuveIdExterne: string,
): Promise<{ resume?: string; erreur?: string }> {
  const decodee = decoderEpreuveId(epreuveIdExterne);
  if (!decodee) return { erreur: "identifiant non reconnu" };

  const { data: concours } = await admin
    .from("concours")
    .select("id")
    .eq("nom", decodee.concours)
    .maybeSingle();
  if (!concours) return { erreur: `concours « ${decodee.concours} » absent du référentiel` };

  const { data: epreuveRef } = await admin
    .from("epreuves")
    .select("id")
    .eq("concours_id", concours.id)
    .eq("nom", decodee.matiere)
    .maybeSingle();
  if (!epreuveRef) return { erreur: `épreuve « ${decodee.matiere} » absente du référentiel` };

  // Les questions, dans l'ordre du sujet.
  const { data: questions } = await admin
    .from("questions")
    .select("id, ordre_epreuve, ordre_dans_bloc, points_defaut, blocs!inner(ordre)")
    .eq("epreuve_id_externe", epreuveIdExterne)
    .neq("statut", "depubliee")
    .limit(2000);

  if (!questions || questions.length === 0) return { erreur: "aucune question importée" };

  const bareme = baremeOfficiel(decodee.concours, decodee.matiere);
  const duree = dureeOfficielle(decodee.concours, decodee.matiere);

  const { data: epreuveCb, error } = await admin
    .from("epreuves_cb")
    .insert({
      session_cb_id: sessionCbId,
      epreuve_id_externe: epreuveIdExterne,
      concours_id: concours.id,
      epreuve_id: epreuveRef.id,
      matiere: decodee.matiere,
      // Sans durée officielle connue, on ne devine pas : 60 minutes, à régler.
      duree_minutes: duree ?? 60,
      points_bonne: bareme?.pointsBonne ?? 1,
      points_mauvaise: bareme?.pointsMauvaise ?? 0,
      points_abstention: bareme?.pointsAbstention ?? 0,
      regles: bareme?.regles ?? {},
      bareme_source: bareme?.source ?? null,
    })
    .select("id")
    .single();

  if (error) {
    return { erreur: error.code === "23505" ? "déjà dans cette session" : error.message };
  }

  const liens = questions.map((q) => {
    const bloc = q.blocs as unknown as { ordre: number } | null;
    return {
      epreuve_cb_id: epreuveCb.id,
      question_id: q.id,
      ordre:
        q.ordre_epreuve !== null
          ? Number(q.ordre_epreuve)
          : Number(bloc?.ordre ?? 0) + Number(q.ordre_dans_bloc ?? 0) / 100,
      points: Number(q.points_defaut ?? 1),
    };
  });

  const { error: eLiens } = await admin.from("epreuve_cb_questions").insert(liens);
  if (eLiens) {
    // Une épreuve sans ses questions ne sert à rien : on annule l'ajout.
    await admin.from("epreuves_cb").delete().eq("id", epreuveCb.id);
    return { erreur: `questions : ${eLiens.message}` };
  }

  return {
    resume:
      `${epreuveIdExterne} (${liens.length} questions` +
      (duree ? `, ${duree} min)` : ", durée à régler)"),
  };
}

export async function enregistrerEpreuve(
  _precedent: EtatEpreuve,
  donnees: FormData,
): Promise<EtatEpreuve> {
  await exigerPrepa();

  const id = String(donnees.get("epreuveCbId") ?? "");
  const sessionCbId = String(donnees.get("sessionId") ?? "");
  const admin = createAdminClient();

  const duree = Number(donnees.get("dureeMinutes"));
  if (!Number.isFinite(duree) || duree < 5 || duree > 480) {
    return { message: "Durée attendue entre 5 et 480 minutes." };
  }

  const noteSur = Number(donnees.get("noteSur"));
  if (!Number.isFinite(noteSur) || noteSur <= 0) {
    return { message: "Note sur : valeur invalide." };
  }

  const lireDate = (cle: string) => {
    const v = String(donnees.get(cle) ?? "").trim();
    return v ? new Date(v).toISOString() : null;
  };
  const debut = lireDate("fenetreDebut");
  const fin = lireDate("fenetreFin");
  if (debut && fin && debut >= fin) {
    return { message: "La fenêtre se termine avant de commencer." };
  }

  const statut = donnees.get("statut") === "publiee" ? "publiee" : "brouillon";

  // Une épreuve ne se publie pas avec des questions en relecture : l'élève
  // composerait sur un énoncé dont personne n'a validé la transcription.
  if (statut === "publiee") {
    const { data: liens } = await admin
      .from("epreuve_cb_questions")
      .select("questions(statut)")
      .eq("epreuve_cb_id", id);
    const douteuses = (liens ?? []).filter(
      (l) => (l.questions as unknown as { statut: string } | null)?.statut !== "publie",
    ).length;
    if (douteuses > 0) {
      return {
        message: `Publication refusée : ${douteuses} question(s) encore en relecture. Valide-les d'abord dans la file de relecture.`,
      };
    }
    if (!debut || !fin) {
      return { message: "Publication refusée : la fenêtre de passage n'est pas fixée." };
    }
  }

  const { error } = await admin
    .from("epreuves_cb")
    .update({
      duree_minutes: Math.round(duree),
      fenetre_debut: debut,
      fenetre_fin: fin,
      points_bonne: Number(donnees.get("pointsBonne") ?? 1),
      points_mauvaise: Number(donnees.get("pointsMauvaise") ?? 0),
      points_abstention: Number(donnees.get("pointsAbstention") ?? 0),
      note_sur: noteSur,
      statut,
    })
    .eq("id", id);
  if (error) return { message: error.message };

  // Cohortes assignées : remplacées en bloc, l'écran envoie l'état complet.
  const cohortes = donnees.getAll("cohortes").map(String).filter(Boolean);
  await admin.from("epreuve_cb_cohortes").delete().eq("epreuve_cb_id", id);
  if (cohortes.length > 0) {
    const { error: eCohortes } = await admin
      .from("epreuve_cb_cohortes")
      .insert(cohortes.map((cohorte_id) => ({ epreuve_cb_id: id, cohorte_id })));
    if (eCohortes) return { message: `Cohortes : ${eCohortes.message}` };
  }

  revalidatePath(`/admin/prepa/sessions/${sessionCbId}`);
  return { succes: "Épreuve enregistrée." };
}

export async function retirerEpreuve(formulaire: FormData) {
  await exigerPrepa();
  const id = String(formulaire.get("epreuveCbId") ?? "");
  const sessionCbId = String(formulaire.get("sessionId") ?? "");

  const admin = createAdminClient();
  // Une épreuve déjà composée ne se retire pas : on perdrait des copies.
  const { count } = await admin
    .from("passages")
    .select("id", { count: "exact", head: true })
    .eq("epreuve_cb_id", id);
  if ((count ?? 0) > 0) return;

  await admin.from("epreuves_cb").delete().eq("id", id);
  revalidatePath(`/admin/prepa/sessions/${sessionCbId}`);
}

/** §5.2 : relance email en un clic des élèves qui n'ont pas commencé. */
export async function relancerRetardataires(formulaire: FormData) {
  await exigerPrepa();

  const id = String(formulaire.get("epreuveCbId") ?? "");
  const sessionCbId = String(formulaire.get("sessionId") ?? "");
  const admin = createAdminClient();

  const { data: epreuve } = await admin
    .from("epreuves_cb")
    .select("id, matiere, fenetre_fin, concours(nom)")
    .eq("id", id)
    .maybeSingle();
  if (!epreuve) return;

  const { data: cohortes } = await admin
    .from("epreuve_cb_cohortes")
    .select("cohorte_id")
    .eq("epreuve_cb_id", id);
  const ids = (cohortes ?? []).map((c) => c.cohorte_id);
  if (ids.length === 0) return;

  const [{ data: eleves }, { data: passages }] = await Promise.all([
    admin.from("users").select("id, email, prenom").in("cohorte_id", ids),
    admin.from("passages").select("user_id").eq("epreuve_cb_id", id),
  ]);

  const ontCommence = new Set((passages ?? []).map((p) => p.user_id));
  const retardataires = (eleves ?? []).filter((e) => !ontCommence.has(e.id));

  const concours = (epreuve.concours as unknown as { nom: string } | null)?.nom ?? "";
  for (const eleve of retardataires) {
    try {
      await envoyerEmail(
        eleve.email,
        emailRelanceConcoursBlanc(
          eleve.prenom,
          `${concours} — ${epreuve.matiere}`,
          epreuve.fenetre_fin,
          `${urlSite()}/tableau-de-bord`,
        ),
      );
    } catch (e) {
      console.error(`Relance non envoyée à ${eleve.email} :`, e);
    }
  }

  revalidatePath(`/admin/prepa/sessions/${sessionCbId}`);
}
