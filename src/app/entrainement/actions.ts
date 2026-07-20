"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  blocsJouables,
  chargerBareme,
  chargerPropositionsCorrigees,
} from "@/lib/session-entrainement";
import { tirerSession } from "@/lib/tirage";
import { evaluer, pointsDe, totaliser, type ReponseEleve } from "@/lib/scoring";

async function eleveConnecte() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");
  return { supabase, userId: user.id };
}

/** Garantit que la session appartient bien à l'élève connecté. */
async function sessionDeLEleve(sessionId: string, userId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("sessions")
    .select("id, user_id, concours_id, epreuve_id, completed_at")
    .eq("id", sessionId)
    .maybeSingle();

  if (!data || data.user_id !== userId) return null;
  return data;
}

// ---------------------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------------------
export async function demarrerSession(donnees: FormData) {
  const { userId } = await eleveConnecte();

  const concoursId = String(donnees.get("concoursId") ?? "");
  const epreuveId = String(donnees.get("epreuveId") ?? "");
  if (!z.uuid().safeParse(concoursId).success || !z.uuid().safeParse(epreuveId).success) {
    redirect("/entrainement");
  }

  const admin = createAdminClient();

  const { data: concours } = await admin
    .from("concours")
    .select("id, taille_session, actif")
    .eq("id", concoursId)
    .maybeSingle();

  if (!concours?.actif) redirect("/entrainement");

  const candidats = await blocsJouables(epreuveId, userId);
  const tirage = tirerSession(candidats, concours.taille_session);

  if (tirage.nbQuestions === 0) {
    redirect(`/entrainement/${concoursId}?vide=1`);
  }

  const { data: session, error } = await admin
    .from("sessions")
    .insert({
      user_id: userId,
      concours_id: concoursId,
      epreuve_id: epreuveId,
      mode: "entrainement",
      nb_questions: tirage.nbQuestions,
    })
    .select("id")
    .single();

  if (error || !session) redirect(`/entrainement/${concoursId}?erreur=1`);

  // Les blocs sont servis entiers et dans l'ordre (§2.2) : l'ordre des questions
  // suit l'ordre des blocs tirés, puis ordre_dans_bloc.
  const parBloc = new Map(candidats.map((b) => [b.id, b.questionIds]));
  const idsOrdonnes: string[] = [];
  for (const bloc of tirage.blocs) {
    idsOrdonnes.push(...(parBloc.get(bloc.id) ?? []));
  }

  const { data: questions } = await admin
    .from("questions")
    .select("id, bloc_id, ordre_dans_bloc")
    .in("id", idsOrdonnes);

  const rang = new Map(
    (questions ?? []).map((q) => [q.id as string, q.ordre_dans_bloc as number]),
  );

  const ordonnees = tirage.blocs.flatMap((bloc) =>
    [...(parBloc.get(bloc.id) ?? [])].sort(
      (a, b) => (rang.get(a) ?? 0) - (rang.get(b) ?? 0),
    ),
  );

  const { error: erreurLignes } = await admin.from("session_questions").insert(
    ordonnees.map((questionId, i) => ({
      session_id: session.id,
      question_id: questionId,
      ordre: i,
    })),
  );

  if (erreurLignes) {
    await admin.from("sessions").delete().eq("id", session.id);
    redirect(`/entrainement/${concoursId}?erreur=1`);
  }

  redirect(`/entrainement/session/${session.id}${tirage.reduite ? "?reduite=1" : ""}`);
}

// ---------------------------------------------------------------------------
// Réponse
// ---------------------------------------------------------------------------
export async function repondre(donnees: FormData) {
  const { userId } = await eleveConnecte();

  const sessionId = String(donnees.get("sessionId") ?? "");
  const sessionQuestionId = String(donnees.get("sessionQuestionId") ?? "");
  const session = await sessionDeLEleve(sessionId, userId);
  if (!session) redirect("/entrainement");
  if (session.completed_at) redirect(`/entrainement/session/${sessionId}/correction`);

  const admin = createAdminClient();

  const { data: ligne } = await admin
    .from("session_questions")
    .select("id, question_id, statut, questions(type)")
    .eq("id", sessionQuestionId)
    .eq("session_id", sessionId)
    .maybeSingle();

  if (!ligne) redirect(`/entrainement/session/${sessionId}`);

  // Pas de retour arrière (§5.3.3) : une question déjà répondue ne se rejoue pas.
  if (ligne.statut) redirect(`/entrainement/session/${sessionId}`);

  const type = (ligne.questions as unknown as { type: string } | null)?.type;
  const abstention = donnees.get("abstention") === "1";

  const propositions = await chargerPropositionsCorrigees(ligne.question_id);

  let reponse: ReponseEleve;
  if (abstention) {
    reponse = { type: "abstention" };
  } else if (type === "choix_unique") {
    reponse = {
      type: "choix_unique",
      reponseId: String(donnees.get("reponseId") ?? "") || null,
    };
  } else {
    const jugements: Record<string, boolean> = {};
    for (const p of propositions) {
      const valeur = donnees.get(`jugement-${p.id}`);
      if (valeur === "vrai") jugements[p.id] = true;
      else if (valeur === "faux") jugements[p.id] = false;
    }
    reponse = { type: "vrai_faux", jugements };
  }

  // La notation se fait ici, avec le corrigé chargé côté serveur : le
  // navigateur n'a jamais vu `est_correcte`.
  const statut = evaluer(reponse, propositions);
  const bareme = await chargerBareme(session.concours_id, session.epreuve_id);

  await admin
    .from("session_questions")
    .update({
      reponse: reponse as unknown as Record<string, unknown>,
      statut,
      points: pointsDe(statut, bareme),
      answered_at: new Date().toISOString(),
    })
    .eq("id", sessionQuestionId);

  // Dernière question ? On clôture.
  const { data: restantes } = await admin
    .from("session_questions")
    .select("id")
    .eq("session_id", sessionId)
    .is("statut", null);

  if ((restantes ?? []).length === 0) {
    await cloturer(sessionId, session.concours_id, session.epreuve_id);
    redirect(`/entrainement/session/${sessionId}/correction`);
  }

  redirect(`/entrainement/session/${sessionId}`);
}

async function cloturer(sessionId: string, concoursId: string, epreuveId: string) {
  const admin = createAdminClient();
  const bareme = await chargerBareme(concoursId, epreuveId);

  const { data: lignes } = await admin
    .from("session_questions")
    .select("statut")
    .eq("session_id", sessionId);

  const statuts = (lignes ?? [])
    .map((l) => l.statut)
    .filter((s): s is "correcte" | "incorrecte" | "abstention" => s !== null);

  const totaux = totaliser(statuts, bareme);

  await admin
    .from("sessions")
    .update({
      points: totaux.points,
      points_max: totaux.pointsMax,
      score_normalise: Number(totaux.scoreNormalise.toFixed(3)),
      nb_questions: totaux.nbQuestions,
      nb_correctes: totaux.nbCorrectes,
      nb_abstentions: totaux.nbAbstentions,
      completed_at: new Date().toISOString(),
    })
    .eq("id", sessionId);
}

// ---------------------------------------------------------------------------
// Abandon
// ---------------------------------------------------------------------------
/** Quitter en cours de route clôture la session sur les réponses données. */
export async function abandonnerSession(donnees: FormData) {
  const { userId } = await eleveConnecte();
  const sessionId = String(donnees.get("sessionId") ?? "");
  const session = await sessionDeLEleve(sessionId, userId);
  if (!session) redirect("/entrainement");

  const admin = createAdminClient();
  // Les questions non atteintes comptent comme des abstentions : elles n'ont
  // pas été vues, mais la session doit avoir un total cohérent.
  const bareme = await chargerBareme(session.concours_id, session.epreuve_id);
  await admin
    .from("session_questions")
    .update({ statut: "abstention", points: bareme.pointsAbstention })
    .eq("session_id", sessionId)
    .is("statut", null);

  await cloturer(sessionId, session.concours_id, session.epreuve_id);
  redirect(`/entrainement/session/${sessionId}/correction`);
}

// ---------------------------------------------------------------------------
// Signalement (§5.3.4)
// ---------------------------------------------------------------------------
export type EtatSignalement = { message?: string; envoye?: boolean };

export async function signalerErreur(
  _precedent: EtatSignalement,
  donnees: FormData,
): Promise<EtatSignalement> {
  const { supabase, userId } = await eleveConnecte();

  const questionId = String(donnees.get("questionId") ?? "");
  const motif = String(donnees.get("motif") ?? "").trim();

  if (!z.uuid().safeParse(questionId).success) {
    return { message: "Question inconnue." };
  }
  if (motif.length < 5) {
    return { message: "Explique en quelques mots ce qui ne va pas." };
  }
  if (motif.length > 1000) {
    return { message: "Message trop long (1000 caractères maximum)." };
  }

  // Insertion avec le client de l'élève : la politique signalements_insert_own
  // vérifie que le signalement lui est bien attribué. Le trigger dépublie
  // ensuite la question immédiatement (§6.1).
  const { error } = await supabase
    .from("signalements")
    .insert({ question_id: questionId, user_id: userId, motif });

  if (error) return { message: "Le signalement n'a pas pu être envoyé." };

  revalidatePath("/admin/relecture");
  return { envoye: true };
}
