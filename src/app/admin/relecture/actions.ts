"use server";

import { revalidatePath } from "next/cache";
import { exigerStaff } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Validation en masse de la file de relecture (§6.1).
 *
 * Relire 104 questions une par une quand elles viennent du même sujet et
 * portent la même réserve n'apporte rien : la décision se prend par lot. Mais
 * le lot ne doit pas devenir une porte dérobée — les contrôles que le
 * formulaire unitaire impose avant de publier sont refaits ici, question par
 * question. Une question incohérente est refusée et nommée dans le rapport,
 * les autres passent : même logique d'import partiel que le reste du socle.
 *
 * Ce qui n'est pas fait ici, volontairement : aucune modification du contenu.
 * Corriger un énoncé reste l'affaire du formulaire unitaire. Le lot ne sait
 * que lever la réserve sur ce qui est déjà juste.
 */

export type RefusMasse = { id: string; enonce: string; raison: string };

export type EtatMasse = {
  message?: string;
  publiees?: number;
  refusees?: RefusMasse[];
};

/** Au-delà, la requête devient trop longue pour PostgREST : on découpe. */
const LOT = 100;

const decouper = <T,>(liste: T[]): T[][] => {
  const lots: T[][] = [];
  for (let i = 0; i < liste.length; i += LOT) lots.push(liste.slice(i, i + LOT));
  return lots;
};

type Proposition = { id: string; texte: string; est_correcte: boolean };

/** Les mêmes refus que le formulaire unitaire, avant de publier. */
function verifier(question: {
  type: string;
  chapitre: string | null;
  reponses_possibles: Proposition[] | null;
}): string | null {
  if (!question.chapitre?.trim()) return "chapitre manquant";

  // Une question rédigée n'a pas de proposition : rien d'autre à vérifier.
  if (question.type === "redaction") return null;

  const props = question.reponses_possibles ?? [];
  if (props.length < 2) return `${props.length} proposition(s), il en faut au moins 2`;
  if (props.some((p) => !p.texte?.trim())) return "une proposition est vide";

  const correctes = props.filter((p) => p.est_correcte).length;
  if (question.type === "choix_unique" && correctes !== 1) {
    return `choix unique avec ${correctes} bonne(s) réponse(s)`;
  }
  if (correctes === 0) return "aucune bonne réponse cochée";

  return null;
}

export async function validerEnMasse(
  _precedent: EtatMasse,
  donnees: FormData,
): Promise<EtatMasse> {
  const { userId } = await exigerStaff();

  const ids = [...new Set(donnees.getAll("selection").map(String).filter(Boolean))];
  if (ids.length === 0) return { message: "Aucune question sélectionnée." };

  const supabase = await createClient();

  const questions: {
    id: string;
    enonce: string;
    type: string;
    chapitre: string | null;
    reponses_possibles: Proposition[] | null;
  }[] = [];

  for (const lot of decouper(ids)) {
    const { data, error } = await supabase
      .from("questions")
      .select("id, enonce, type, chapitre, reponses_possibles(id, texte, est_correcte)")
      .in("id", lot);
    if (error) return { message: `Lecture impossible : ${error.message}` };
    questions.push(...(data ?? []));
  }

  const refusees: RefusMasse[] = [];
  const aPublier: string[] = [];

  for (const q of questions) {
    const raison = verifier(q);
    if (raison) {
      refusees.push({ id: q.id, enonce: q.enonce, raison });
    } else {
      aPublier.push(q.id);
    }
  }

  if (aPublier.length === 0) {
    return {
      message: "Aucune question publiable dans la sélection.",
      publiees: 0,
      refusees,
    };
  }

  const maintenant = new Date().toISOString();

  for (const lot of decouper(aPublier)) {
    const { error } = await supabase
      .from("questions")
      .update({
        statut: "publie",
        // La validation humaine lève la réserve d'extraction, comme en unitaire.
        statut_extraction: "ok",
        // Publiée par décision humaine, donc jamais « auto_publiee » : la
        // traçabilité du §6.1 doit rester exacte.
        auto_publiee: false,
        relue_par: userId,
        relue_le: maintenant,
      })
      .in("id", lot);
    if (error) return { message: `Publication impossible : ${error.message}`, refusees };

    // Un signalement élève est clos par la décision qui le traite.
    await supabase
      .from("signalements")
      .update({ traite: true })
      .in("question_id", lot)
      .eq("traite", false);
  }

  // Le statut des blocs n'est pas recalculé ici : le trigger
  // `questions_synchronisent_leur_bloc` s'en charge à chaque changement de
  // statut, et c'est lui qui garantit qu'un bloc de concours blanc ne devient
  // jamais jouable en entraînement libre.

  revalidatePath("/admin/relecture");
  revalidatePath("/admin/annales");

  return { publiees: aPublier.length, refusees };
}
