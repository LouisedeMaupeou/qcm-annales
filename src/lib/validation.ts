import { z } from "zod";

/** Âge en années révolues — même règle que public.age_ans() côté base. */
export function ageAns(dateNaissance: string | Date): number {
  const n = new Date(dateNaissance);
  const aujourdhui = new Date();
  let age = aujourdhui.getFullYear() - n.getFullYear();
  const m = aujourdhui.getMonth() - n.getMonth();
  if (m < 0 || (m === 0 && aujourdhui.getDate() < n.getDate())) age--;
  return age;
}

const MOTIF_MOT_DE_PASSE = "Le mot de passe doit faire au moins 8 caractères.";

export const schemaInscription = z
  .object({
    email: z.email("Adresse email invalide."),
    motDePasse: z.string().min(8, MOTIF_MOT_DE_PASSE),
    nom: z.string().trim().min(1, "Le nom est obligatoire.").max(100),
    prenom: z.string().trim().min(1, "Le prénom est obligatoire.").max(100),
    dateNaissance: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date de naissance invalide.")
      .refine((v) => {
        const age = ageAns(v);
        return age >= 5 && age <= 100;
      }, "Date de naissance invalide."),
    ville: z.string().trim().min(1, "La ville est obligatoire.").max(120),
    etablissement: z
      .string()
      .trim()
      .min(1, "L'établissement est obligatoire.")
      .max(160),
    concoursVises: z
      .array(z.uuid())
      .min(1, "Choisis au moins un concours visé."),
    consentMarketing: z.boolean(),
    cguAcceptees: z.literal(true, {
      message: "Tu dois accepter les CGU pour créer un compte.",
    }),
  });

export type DonneesInscription = z.infer<typeof schemaInscription>;

export const schemaConnexion = z.object({
  email: z.email("Adresse email invalide."),
  motDePasse: z.string().min(1, "Mot de passe requis."),
});

export const schemaEmail = z.object({
  email: z.email("Adresse email invalide."),
});

export const schemaNouveauMotDePasse = z
  .object({
    motDePasse: z.string().min(8, MOTIF_MOT_DE_PASSE),
    confirmation: z.string(),
  })
  .refine((d) => d.motDePasse === d.confirmation, {
    path: ["confirmation"],
    message: "Les deux mots de passe ne correspondent pas.",
  });
