"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { emailConfirmationEleve, envoyerEmail } from "@/lib/emails";
import { urlSite } from "@/lib/site";
import { schemaInscription } from "@/lib/validation";

export type ValeursInscription = {
  email: string;
  nom: string;
  prenom: string;
  ville: string;
  etablissement: string;
  emailParent: string;
  telephoneParent: string;
  concoursVises: string[];
  consentMarketing: boolean;
};

export type EtatInscription = {
  erreurs?: Record<string, string[]>;
  message?: string;
  succes?: { email: string };
  // Valeurs saisies, renvoyées en cas d'échec pour ne pas avoir à tout ressaisir
  // (les mots de passe ne sont volontairement jamais renvoyés).
  valeurs?: ValeursInscription;
};

export async function inscrire(
  _precedent: EtatInscription,
  donnees: FormData,
): Promise<EtatInscription> {
  const brut = {
    email: String(donnees.get("email") ?? "").trim(),
    motDePasse: String(donnees.get("motDePasse") ?? ""),
    nom: String(donnees.get("nom") ?? ""),
    prenom: String(donnees.get("prenom") ?? ""),
    ville: String(donnees.get("ville") ?? ""),
    etablissement: String(donnees.get("etablissement") ?? ""),
    emailParent: String(donnees.get("emailParent") ?? "").trim(),
    telephoneParent: String(donnees.get("telephoneParent") ?? "").trim(),
    concoursVises: donnees.getAll("concoursVises").map(String),
    consentMarketing: donnees.get("consentMarketing") === "on",
    cguAcceptees: donnees.get("cguAcceptees") === "on",
  };

  // Renvoyées telles quelles à chaque échec pour repeupler le formulaire.
  const valeurs: ValeursInscription = {
    email: brut.email,
    nom: brut.nom,
    prenom: brut.prenom,
    ville: brut.ville,
    etablissement: brut.etablissement,
    emailParent: brut.emailParent,
    telephoneParent: brut.telephoneParent,
    concoursVises: brut.concoursVises,
    consentMarketing: brut.consentMarketing,
  };

  const analyse = schemaInscription.safeParse(brut);
  if (!analyse.success) {
    return { erreurs: analyse.error.flatten().fieldErrors, valeurs };
  }
  const d = analyse.data;

  const admin = createAdminClient();
  const maintenant = new Date().toISOString();

  // Le compte auth est créé sans confirmation : c'est notre lien de double
  // opt-in, envoyé plus bas, qui l'activera. Version simplifiée : plus de
  // consentement parental, quel que soit l'âge.
  const { data: cree, error: erreurAuth } = await admin.auth.admin.createUser({
    email: d.email,
    password: d.motDePasse,
    email_confirm: false,
  });

  if (erreurAuth || !cree.user) {
    const dejaPris =
      erreurAuth?.message?.toLowerCase().includes("already") ||
      erreurAuth?.code === "email_exists";
    return {
      erreurs: dejaPris
        ? { email: ["Un compte existe déjà avec cette adresse."] }
        : undefined,
      message: dejaPris
        ? undefined
        : "La création du compte a échoué. Réessaie dans un instant.",
      valeurs,
    };
  }

  const idUtilisateur = cree.user.id;

  // À partir d'ici, toute erreur laisserait un compte auth orphelin : on le
  // supprime pour que l'élève puisse simplement recommencer.
  try {
    const { error: erreurProfil } = await admin.from("users").insert({
      id: idUtilisateur,
      email: d.email,
      role: "eleve", // jamais issu du formulaire
      nom: d.nom,
      prenom: d.prenom,
      ville: d.ville,
      etablissement: d.etablissement,
      email_parent: d.emailParent,
      telephone_parent: d.telephoneParent,
      consent_marketing: d.consentMarketing,
      consent_marketing_date: d.consentMarketing ? maintenant : null,
      cgu_acceptees_date: maintenant,
      email_verifie: false,
      autorisation_parentale: "non_requise",
    });
    if (erreurProfil) throw new Error(erreurProfil.message);

    const { error: erreurConcours } = await admin
      .from("user_concours_vises")
      .insert(
        d.concoursVises.map((concours_id) => ({
          user_id: idUtilisateur,
          concours_id,
        })),
      );
    if (erreurConcours) throw new Error(erreurConcours.message);

    // Double opt-in élève : Supabase fabrique le lien, nous l'envoyons via
    // Resend pour garder une identité visuelle cohérente sur tous les emails.
    const { data: lien, error: erreurLien } =
      await admin.auth.admin.generateLink({
        type: "signup",
        email: d.email,
        password: d.motDePasse,
      });
    if (erreurLien || !lien) throw new Error(erreurLien?.message ?? "lien");

    const urlConfirmation = `${urlSite()}/auth/confirmer?token_hash=${
      lien.properties.hashed_token
    }&type=signup`;

    await envoyerEmail(
      d.email,
      emailConfirmationEleve(d.prenom, urlConfirmation),
    );

    return { succes: { email: d.email } };
  } catch (e) {
    await admin.auth.admin.deleteUser(idUtilisateur);
    console.error("Inscription échouée, compte annulé :", e);
    return {
      message:
        "L'inscription n'a pas pu aboutir. Aucun compte n'a été créé, tu peux réessayer.",
      valeurs,
    };
  }
}
