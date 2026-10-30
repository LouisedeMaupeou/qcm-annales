"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { exigerStaff } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";

export type EtatRelecture = { message?: string };

const schema = z.object({
  id: z.uuid(),
  decision: z.enum(["valider", "rejeter"]),
  enonce: z.string().trim().min(1, "L'énoncé est obligatoire."),
  chapitre: z.string().trim().min(1, "Le chapitre est obligatoire."),
  explication: z.string().trim(),
  explicationRelue: z.boolean(),
  propositions: z
    .array(
      z.object({
        id: z.uuid(),
        texte: z.string().trim().min(1, "Une proposition ne peut être vide."),
        estCorrecte: z.boolean(),
      }),
    )
    .min(2),
});

/**
 * §6.1 : « Valider · Corriger puis valider · Rejeter ».
 *
 * Les deux premiers cas ne diffèrent que par les modifications apportées avant
 * l'envoi : le formulaire enregistre toujours ce qu'il a sous la main, puis
 * applique la décision. Rejeter dépublie sans toucher au contenu.
 */
export async function deciderRelecture(
  _precedent: EtatRelecture,
  donnees: FormData,
): Promise<EtatRelecture> {
  const { userId } = await exigerStaff();

  const ids = donnees.getAll("propositionId").map(String);
  const analyse = schema.safeParse({
    id: String(donnees.get("id") ?? ""),
    decision: String(donnees.get("decision") ?? ""),
    enonce: String(donnees.get("enonce") ?? ""),
    chapitre: String(donnees.get("chapitre") ?? ""),
    explication: String(donnees.get("explication") ?? ""),
    explicationRelue: donnees.get("explicationRelue") === "on",
    propositions: ids.map((id) => ({
      id,
      texte: String(donnees.get(`texte-${id}`) ?? ""),
      estCorrecte: donnees.get(`correcte-${id}`) === "on",
    })),
  });

  if (!analyse.success) return { message: analyse.error.issues[0]?.message };
  const d = analyse.data;

  const supabase = await createClient();

  const { data: question } = await supabase
    .from("questions")
    .select("type, bloc_id, explication_origine")
    .eq("id", d.id)
    .single();

  if (!question) return { message: "Question introuvable." };

  if (question.type === "choix_unique") {
    const correctes = d.propositions.filter((p) => p.estCorrecte).length;
    if (correctes !== 1) {
      return {
        message: `Un choix unique doit avoir exactement une bonne réponse (${correctes} cochée·s).`,
      };
    }
  }

  // L'explication est facultative : on peut valider une question sans en saisir.
  // Une case « relue » cochée sur une explication vide est simplement ignorée
  // (jamais bloquante).
  const explication = d.explication || null;
  const explicationRelue = explication ? d.explicationRelue : false;

  // Contrainte explication_a_une_origine : une explication non nulle doit porter
  // une origine. On garde l'origine « generee » d'une explication IA relue ;
  // une explication saisie ici sur une question qui n'en avait pas est humaine.
  const explicationOrigine = explication
    ? ((question.explication_origine as string | null) ?? "humaine")
    : null;

  const maintenant = new Date().toISOString();

  const { error } = await supabase
    .from("questions")
    .update({
      enonce: d.enonce,
      chapitre: d.chapitre,
      explication,
      explication_origine: explicationOrigine,
      explication_relue: explicationRelue,
      // La validation humaine lève la réserve d'extraction : c'est tout l'objet
      // du passage en file.
      statut: d.decision === "valider" ? "publie" : "depubliee",
      statut_extraction: d.decision === "valider" ? "ok" : "a_verifier",
      // Une question validée à la main n'est pas auto-publiée, quel que soit
      // son indice de confiance : la traçabilité du §6.1 doit rester exacte.
      auto_publiee: false,
      relue_par: userId,
      relue_le: maintenant,
    })
    .eq("id", d.id);

  if (error) return { message: `Enregistrement impossible : ${error.message}` };

  for (const p of d.propositions) {
    const { error: e } = await supabase
      .from("reponses_possibles")
      .update({ texte: p.texte, est_correcte: p.estCorrecte })
      .eq("id", p.id)
      .eq("question_id", d.id);
    if (e) return { message: `Proposition : ${e.message}` };
  }

  // Le signalement qui a motivé la relecture est clos par la décision.
  await supabase
    .from("signalements")
    .update({ traite: true })
    .eq("question_id", d.id)
    .eq("traite", false);

  // Le statut du bloc n'est pas touché ici : le trigger
  // questions_synchronisent_leur_bloc s'en charge depuis la migration
  // 20260720200000, et lui seul sait qu'un bloc de concours blanc ne doit
  // jamais devenir jouable. La synchronisation manuelle qui vivait ici
  // l'ignorait et publiait le bloc : valider une question de concours blanc
  // la rendait jouable en entraînement libre.

  revalidatePath("/admin/relecture");
  redirect("/admin/relecture?decision=enregistree");
}

