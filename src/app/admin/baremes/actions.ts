"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigerAdmin } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";

export type EtatBareme = { message?: string; enregistre?: boolean };

const schema = z.object({
  baremeId: z.uuid(),
  concoursId: z.uuid(),
  pointsBonne: z.coerce.number().min(-10).max(10),
  pointsMauvaise: z.coerce.number().min(-10).max(10),
  pointsAbstention: z.coerce.number().min(-10).max(10),
  regleSpeciale: z.string().trim(),
  sourceOfficielle: z.string().trim(),
  // §2 : les barèmes doivent être vérifiés sur le règlement officiel avant
  // d'être montrés aux élèves. La date est la trace de cette vérification.
  verifieLe: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, "Date invalide."),
  tailleSession: z.coerce.number().int().min(1).max(100),
});

export async function enregistrerBareme(
  _precedent: EtatBareme,
  donnees: FormData,
): Promise<EtatBareme> {
  await exigerAdmin();

  const analyse = schema.safeParse({
    baremeId: donnees.get("baremeId"),
    concoursId: donnees.get("concoursId"),
    pointsBonne: donnees.get("pointsBonne"),
    pointsMauvaise: donnees.get("pointsMauvaise"),
    pointsAbstention: donnees.get("pointsAbstention"),
    regleSpeciale: donnees.get("regleSpeciale") ?? "",
    sourceOfficielle: donnees.get("sourceOfficielle") ?? "",
    verifieLe: donnees.get("verifieLe") ?? "",
    tailleSession: donnees.get("tailleSession"),
  });

  if (!analyse.success) {
    return { message: analyse.error.issues[0]?.message };
  }
  const d = analyse.data;

  if (d.verifieLe && !d.sourceOfficielle) {
    return {
      message:
        "Indique la source officielle avant de dater la vérification : une date sans référence ne prouve rien.",
    };
  }

  const supabase = await createClient();

  const { error: eBareme } = await supabase
    .from("baremes")
    .update({
      points_bonne: d.pointsBonne,
      points_mauvaise: d.pointsMauvaise,
      points_abstention: d.pointsAbstention,
      regle_speciale: d.regleSpeciale || null,
      source_officielle: d.sourceOfficielle || null,
      verifie_le: d.verifieLe || null,
    })
    .eq("id", d.baremeId);

  if (eBareme) return { message: `Barème : ${eBareme.message}` };

  const { error: eConcours } = await supabase
    .from("concours")
    .update({ taille_session: d.tailleSession })
    .eq("id", d.concoursId);

  if (eConcours) return { message: `Taille de session : ${eConcours.message}` };

  revalidatePath("/admin/baremes");
  return { enregistre: true };
}
