"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { exigerStaff } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";

export type EtatNouvelleAnnale = { message?: string };

const schema = z.object({
  concoursId: z.uuid("Choisis un concours."),
  annee: z.coerce
    .number()
    .int()
    .min(1990, "Année invalide.")
    .max(2100, "Année invalide."),
  formatSource: z.enum(["un_document", "deux_documents"]),
});

const TAILLE_MAX = 50 * 1024 * 1024;

/** §6.1 : concours + année + format, PDF archivés et rattachés. */
export async function creerAnnale(
  _precedent: EtatNouvelleAnnale,
  donnees: FormData,
): Promise<EtatNouvelleAnnale> {
  await exigerStaff();

  const analyse = schema.safeParse({
    concoursId: donnees.get("concoursId"),
    annee: donnees.get("annee"),
    formatSource: donnees.get("formatSource"),
  });
  if (!analyse.success) {
    return { message: analyse.error.issues[0]?.message };
  }
  const { concoursId, annee, formatSource } = analyse.data;

  // Écriture avec le client authentifié : la RLS staff s'applique.
  const supabase = await createClient();

  const { data: annale, error } = await supabase
    .from("annales")
    .insert({
      concours_id: concoursId,
      annee,
      statut: "brouillon",
      format_source: formatSource,
    })
    .select("id")
    .single();

  if (error) {
    return {
      message: error.code === "23505"
        ? "Une annale existe déjà pour ce concours et cette année."
        : `Création impossible : ${error.message}`,
    };
  }

  // Les PDF attendus dépendent du format déclaré (§6.1).
  const fichiers: { champ: string; type: "questions" | "corrections" | "complet" }[] =
    formatSource === "deux_documents"
      ? [
          { champ: "pdfQuestions", type: "questions" },
          { champ: "pdfCorrections", type: "corrections" },
        ]
      : [{ champ: "pdfComplet", type: "complet" }];

  for (const { champ, type } of fichiers) {
    const fichier = donnees.get(champ);
    if (!(fichier instanceof File) || fichier.size === 0) continue;

    if (fichier.type !== "application/pdf") {
      return { message: `${fichier.name} n'est pas un PDF.` };
    }
    if (fichier.size > TAILLE_MAX) {
      return { message: `${fichier.name} dépasse 50 Mo.` };
    }

    const chemin = `${concoursId}/${annee}/${type}-${Date.now()}.pdf`;
    const { error: erreurUpload } = await supabase.storage
      .from("annales")
      .upload(chemin, fichier, { contentType: "application/pdf" });

    if (erreurUpload) {
      return { message: `Téléversement échoué : ${erreurUpload.message}` };
    }

    const { error: erreurDoc } = await supabase
      .from("annale_documents")
      .insert({ annale_id: annale.id, type, fichier_url: chemin });

    if (erreurDoc) {
      return { message: `Rattachement échoué : ${erreurDoc.message}` };
    }
  }

  redirect(`/admin/annales/${annale.id}`);
}
