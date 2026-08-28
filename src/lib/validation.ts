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

// Téléphone français : 0X XX XX XX XX ou +33X…, séparateurs (espace, point,
// tiret) tolérés.
const RE_TELEPHONE = /^(?:\+33|0)[1-9](?:[\s.\-]?\d{2}){4}$/;

export const schemaInscription = z
  .object({
    email: z.email("Adresse email invalide."),
    motDePasse: z.string().min(8, MOTIF_MOT_DE_PASSE),
    nom: z.string().trim().min(1, "Le nom est obligatoire.").max(100),
    prenom: z.string().trim().min(1, "Le prénom est obligatoire.").max(100),
    ville: z.string().trim().min(1, "La ville est obligatoire.").max(120),
    etablissement: z
      .string()
      .trim()
      .min(1, "L'établissement est obligatoire.")
      .max(160),
    emailParent: z.email("Adresse email d'un parent invalide."),
    telephoneParent: z
      .string()
      .trim()
      .min(1, "Le téléphone d'un parent est obligatoire.")
      .refine(
        (v) => RE_TELEPHONE.test(v.replace(/\s+/g, " ").trim()),
        "Numéro de téléphone invalide (ex. 06 12 34 56 78).",
      ),
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
      "L'adresse du parent doit être différente de la tienne.",
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
