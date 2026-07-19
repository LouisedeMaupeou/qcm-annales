"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigerStaff } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";

export type EtatQuestion = { message?: string; enregistre?: boolean };

const schema = z.object({
  id: z.uuid(),
  enonce: z.string().trim().min(1, "L'énoncé est obligatoire."),
  // §6.1 : chapitre obligatoire, explication facultative.
  chapitre: z.string().trim().min(1, "Le chapitre est obligatoire."),
  explication: z.string().trim(),
  explicationOrigine: z.enum(["humaine", "generee"]),
  explicationRelue: z.boolean(),
  statut: z.enum(["brouillon", "a_verifier", "publie", "depubliee"]),
  propositions: z
    .array(
      z.object({
        id: z.uuid(),
        texte: z.string().trim().min(1, "Une proposition ne peut être vide."),
        estCorrecte: z.boolean(),
      }),
    )
    .min(2, "Il faut au moins deux propositions."),
});

export async function enregistrerQuestion(
  _precedent: EtatQuestion,
  donnees: FormData,
): Promise<EtatQuestion> {
  await exigerStaff();

  const ids = donnees.getAll("propositionId").map(String);
  const brut = {
    id: String(donnees.get("id") ?? ""),
    enonce: String(donnees.get("enonce") ?? ""),
    chapitre: String(donnees.get("chapitre") ?? ""),
    explication: String(donnees.get("explication") ?? ""),
    explicationOrigine: String(donnees.get("explicationOrigine") ?? "humaine"),
    explicationRelue: donnees.get("explicationRelue") === "on",
    statut: String(donnees.get("statut") ?? "brouillon"),
    propositions: ids.map((id) => ({
      id,
      texte: String(donnees.get(`texte-${id}`) ?? ""),
      estCorrecte: donnees.get(`correcte-${id}`) === "on",
    })),
  };

  const analyse = schema.safeParse(brut);
  if (!analyse.success) {
    return { message: analyse.error.issues[0]?.message };
  }
  const d = analyse.data;

  const supabase = await createClient();

  const { data: question } = await supabase
    .from("questions")
    .select("type")
    .eq("id", d.id)
    .single();

  // Un choix unique doit avoir exactement une bonne réponse ; un vrai/faux est
  // jugé proposition par proposition, tout ou rien (§2.3), donc n'importe quelle
  // combinaison est licite.
  const nbCorrectes = d.propositions.filter((p) => p.estCorrecte).length;
  if (question?.type === "choix_unique" && nbCorrectes !== 1) {
    return {
      message: `Un choix unique doit avoir exactement une bonne réponse (${nbCorrectes} cochée·s).`,
    };
  }

  const explication = d.explication || null;

  // §6.1 : une explication générée par IA n'est jamais servie à un élève sans
  // relecture. Publier une question dont l'explication générée n'est pas relue
  // est autorisé — la question est jouable sans son explication — mais on
  // refuse de marquer « relue » une explication vide.
  if (!explication && d.explicationRelue) {
    return { message: "Impossible de marquer relue une explication vide." };
  }

  const { error } = await supabase
    .from("questions")
    .update({
      enonce: d.enonce,
      chapitre: d.chapitre,
      explication,
      explication_origine: explication ? d.explicationOrigine : null,
      explication_relue: explication ? d.explicationRelue : false,
      statut: d.statut,
    })
    .eq("id", d.id);

  if (error) return { message: `Enregistrement impossible : ${error.message}` };

  for (const p of d.propositions) {
    const { error: e } = await supabase
      .from("reponses_possibles")
      .update({ texte: p.texte, est_correcte: p.estCorrecte })
      .eq("id", p.id)
      .eq("question_id", d.id);
    if (e) return { message: `Proposition non enregistrée : ${e.message}` };
  }

  revalidatePath(`/admin/questions/${d.id}`);
  return { enregistre: true };
}
