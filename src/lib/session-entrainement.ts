import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Bareme } from "@/lib/scoring";

/**
 * Accès au contenu jouable.
 *
 * ⚠️ Tout passe par le client service_role, et c'est délibéré : la RLS ferme
 * `questions` et `reponses_possibles` aux élèves (cf. 20260719120100_rls.sql).
 * `reponses_possibles.est_correcte` contient le corrigé — exposé via PostgREST,
 * n'importe quel élève lirait la réponse avant de répondre.
 *
 * Les fonctions de ce module sont donc les seules à toucher ce contenu, et
 * elles retirent `est_correcte` et les explications non relues avant de rendre
 * quoi que ce soit destiné au navigateur.
 */

export type QuestionJouable = {
  sessionQuestionId: string;
  questionId: string;
  type: "choix_unique" | "vrai_faux";
  enonce: string;
  imageUrl: string | null;
  enonceCommun: string | null;
  /** Position dans le bloc lié, pour signaler un enchaînement à l'élève. */
  rangDansBloc: number;
  tailleBloc: number;
  propositions: { id: string; texte: string }[]; // sans est_correcte
};

/** Barème applicable au couple concours × épreuve (§6.1). */
export async function chargerBareme(
  concoursId: string,
  epreuveId: string,
): Promise<Bareme> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("baremes")
    .select("epreuve_id, points_bonne, points_mauvaise, points_abstention")
    .eq("concours_id", concoursId);

  const lignes = data ?? [];
  // Un barème propre à l'épreuve surcharge le barème par défaut du concours.
  const choisi =
    lignes.find((b) => b.epreuve_id === epreuveId) ??
    lignes.find((b) => b.epreuve_id === null);

  return {
    pointsBonne: Number(choisi?.points_bonne ?? 1),
    pointsMauvaise: Number(choisi?.points_mauvaise ?? 0),
    pointsAbstention: Number(choisi?.points_abstention ?? 0),
  };
}

/**
 * Blocs jouables d'un couple concours × épreuve.
 *
 * Un bloc n'est éligible que si toutes ses questions sont publiées : le §2.2
 * impose de le servir entier, un bloc amputé n'aurait pas de sens.
 */
export async function blocsJouables(epreuveId: string, userId: string) {
  const admin = createAdminClient();

  const { data: blocs } = await admin
    .from("blocs")
    .select("id, statut, questions(id, statut)")
    .eq("epreuve_id", epreuveId)
    .eq("statut", "publie");

  const eligibles = (blocs ?? [])
    .map((b) => {
      const questions = (b.questions as unknown as { id: string; statut: string }[]) ?? [];
      return {
        id: b.id as string,
        questions,
        toutesPubliees:
          questions.length > 0 && questions.every((q) => q.statut === "publie"),
      };
    })
    .filter((b) => b.toutesPubliees);

  if (eligibles.length === 0) return [];

  // Historique de l'élève, pour le tirage anti-répétition (§5.3.3).
  const idsQuestions = eligibles.flatMap((b) => b.questions.map((q) => q.id));
  const { data: vues } = await admin
    .from("session_questions")
    .select("question_id, sessions!inner(user_id)")
    .in("question_id", idsQuestions)
    .eq("sessions.user_id", userId);

  const compteur = new Map<string, number>();
  for (const v of vues ?? []) {
    compteur.set(v.question_id, (compteur.get(v.question_id) ?? 0) + 1);
  }

  return eligibles.map((b) => ({
    id: b.id,
    taille: b.questions.length,
    vues: b.questions.reduce((s, q) => s + (compteur.get(q.id) ?? 0), 0),
    questionIds: b.questions.map((q) => q.id),
  }));
}

/**
 * Charge la question courante d'une session, expurgée.
 *
 * Ne renvoie ni `est_correcte`, ni l'explication : l'élève n'a pas à les
 * connaître avant d'avoir répondu.
 */
export async function chargerQuestionJouable(
  sessionQuestionId: string,
): Promise<QuestionJouable | null> {
  const admin = createAdminClient();

  const { data } = await admin
    .from("session_questions")
    .select(
      "id, question_id, questions(id, type, enonce, image_url, ordre_dans_bloc, bloc_id, reponses_possibles(id, texte, ordre))",
    )
    .eq("id", sessionQuestionId)
    .maybeSingle();

  if (!data) return null;

  const q = data.questions as unknown as {
    id: string;
    type: "choix_unique" | "vrai_faux";
    enonce: string;
    image_url: string | null;
    ordre_dans_bloc: number;
    bloc_id: string;
    reponses_possibles: { id: string; texte: string; ordre: number }[];
  };

  const { data: bloc } = await admin
    .from("blocs")
    .select("enonce_commun, questions(id)")
    .eq("id", q.bloc_id)
    .maybeSingle();

  const tailleBloc =
    ((bloc?.questions as unknown as { id: string }[]) ?? []).length || 1;

  return {
    sessionQuestionId: data.id as string,
    questionId: q.id,
    type: q.type,
    enonce: q.enonce,
    imageUrl: q.image_url,
    enonceCommun: (bloc?.enonce_commun as string | null) ?? null,
    rangDansBloc: q.ordre_dans_bloc,
    tailleBloc,
    propositions: [...(q.reponses_possibles ?? [])]
      .sort((a, b) => a.ordre - b.ordre)
      .map((p) => ({ id: p.id, texte: p.texte })),
  };
}

/** Propositions avec leur vérité — usage serveur uniquement, pour la notation. */
export async function chargerPropositionsCorrigees(questionId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("reponses_possibles")
    .select("id, est_correcte, ordre")
    .eq("question_id", questionId)
    .order("ordre");

  return (data ?? []).map((p) => ({
    id: p.id as string,
    estCorrecte: p.est_correcte as boolean,
  }));
}
