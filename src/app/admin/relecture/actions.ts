"use server";

import { revalidatePath } from "next/cache";
import { exigerAdmin, exigerStaff } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
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

export type EtatSuppression = {
  message?: string;
  supprimees?: number;
  blocsVides?: number;
  retenues?: RefusMasse[];
};

/**
 * Suppression définitive de questions en relecture (§6.1).
 *
 * Une réserve d'extraction se solde de trois façons : on corrige, on publie,
 * ou on jette. Les deux premières existaient ; sans la troisième, un import
 * raté laissait sa trace pour toujours et la file finissait par ne plus rien
 * vouloir dire.
 *
 * Trois garde-fous, parce que l'opération ne se rattrape pas.
 *
 * 1. Réservée à l'admin. Un contributeur relit, il ne détruit pas.
 * 2. Une question déjà servie à un élève n'est jamais supprimée. La base le
 *    refuserait de toute façon — `session_questions` et `passage_reponses`
 *    sont en `on delete restrict` — mais l'échec arriverait au milieu du lot,
 *    sous forme d'erreur de contrainte. On regarde donc avant, et on nomme ces
 *    questions dans le rapport : la copie d'un élève doit rester lisible.
 * 3. Seules les questions non publiées sont concernées. Supprimer depuis cet
 *    écran une question publiée serait un effet de bord du filtre, pas une
 *    décision.
 *
 * Les blocs vidés sont retirés dans la foulée : c'est leur présence qui faisait
 * apparaître des épreuves sans une seule question.
 */
export async function supprimerEnMasse(
  _precedent: EtatSuppression,
  donnees: FormData,
): Promise<EtatSuppression> {
  await exigerAdmin();

  const ids = [...new Set(donnees.getAll("selection").map(String).filter(Boolean))];
  if (ids.length === 0) return { message: "Aucune question sélectionnée." };

  const admin = createAdminClient();

  const { data: questions, error: eLecture } = await admin
    .from("questions")
    .select("id, enonce, statut, bloc_id")
    .in("id", ids)
    .in("statut", ["brouillon", "a_verifier", "depubliee"]);
  if (eLecture) return { message: `Lecture impossible : ${eLecture.message}` };

  if (!questions || questions.length === 0) {
    return { message: "Aucune question supprimable dans la sélection." };
  }

  const presents = questions.map((q) => q.id as string);

  // Ce qui a déjà été servi à un élève : on regarde les deux tables qui
  // retiennent une question, l'entraînement libre et le concours blanc.
  const retenues = new Map<string, string>();
  for (const lot of decouper(presents)) {
    const [{ data: entrainement }, { data: concoursBlanc }] = await Promise.all([
      admin.from("session_questions").select("question_id").in("question_id", lot),
      admin.from("passage_reponses").select("question_id").in("question_id", lot),
    ]);
    for (const l of entrainement ?? []) {
      retenues.set(l.question_id as string, "déjà servie en entraînement");
    }
    for (const l of concoursBlanc ?? []) {
      retenues.set(l.question_id as string, "déjà répondue dans un concours blanc");
    }
  }

  const aSupprimer = presents.filter((id) => !retenues.has(id));
  const refusees: RefusMasse[] = questions
    .filter((q) => retenues.has(q.id as string))
    .map((q) => ({
      id: q.id as string,
      enonce: q.enonce as string,
      raison: retenues.get(q.id as string)!,
    }));

  if (aSupprimer.length === 0) {
    return { message: "Rien à supprimer : tout est retenu par une copie d'élève.", retenues: refusees };
  }

  const blocsTouches = [
    ...new Set(
      questions
        .filter((q) => aSupprimer.includes(q.id as string))
        .map((q) => q.bloc_id as string | null)
        .filter(Boolean) as string[],
    ),
  ];

  for (const lot of decouper(aSupprimer)) {
    const { error } = await admin.from("questions").delete().in("id", lot);
    if (error) return { message: `Suppression impossible : ${error.message}`, retenues: refusees };
  }

  // Un bloc dont il ne reste rien n'a plus d'objet : c'est lui qui faisait
  // apparaître des épreuves vides dans la banque.
  let blocsVides = 0;
  for (const blocId of blocsTouches) {
    const { count } = await admin
      .from("questions")
      .select("id", { count: "exact", head: true })
      .eq("bloc_id", blocId);
    if ((count ?? 0) === 0) {
      const { error } = await admin.from("blocs").delete().eq("id", blocId);
      if (!error) blocsVides += 1;
    }
  }

  revalidatePath("/admin/relecture");
  revalidatePath("/admin/annales");

  return { supprimees: aSupprimer.length, blocsVides, retenues: refusees };
}
