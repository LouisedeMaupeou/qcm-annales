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

/**
 * §5.1 : sous 15 ans le consentement parental est bloquant (seuil français de
 * l'article 8 du RGPD) ; de 15 à 17 ans le parent est informé sans blocage.
 */
export type ParcoursAge = "moins_de_15" | "mineur_15_17" | "majeur";

export function parcoursAge(dateNaissance: string | Date): ParcoursAge {
  const age = ageAns(dateNaissance);
  if (age < 15) return "moins_de_15";
  if (age < 18) return "mineur_15_17";
  return "majeur";
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
    emailParent: z.email("Adresse email du parent invalide."),
    concoursVises: z
      .array(z.uuid())
      .min(1, "Choisis au moins un concours visé."),
    consentMarketing: z.boolean(),
    cguAcceptees: z.literal(true, {
      message: "Tu dois accepter les CGU pour créer un compte.",
    }),
  })
  .refine((d) => d.email.toLowerCase() !== d.emailParent.toLowerCase(), {
    path: ["emailParent"],
    message:
      "L'adresse du parent doit être différente de la tienne : c'est elle qui reçoit l'autorisation et le suivi.",
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
