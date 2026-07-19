"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  emailAutorisationParent,
  emailConfirmationEleve,
  emailInformationParent,
  envoyerEmail,
} from "@/lib/emails";
import { creerJetonParent, urlEspaceParent, urlSite } from "@/lib/parent";
import { parcoursAge, schemaInscription } from "@/lib/validation";

export type EtatInscription = {
  erreurs?: Record<string, string[]>;
  message?: string;
  succes?: { parcours: ReturnType<typeof parcoursAge>; emailParent: string };
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
    dateNaissance: String(donnees.get("dateNaissance") ?? ""),
    ville: String(donnees.get("ville") ?? ""),
    etablissement: String(donnees.get("etablissement") ?? ""),
    emailParent: String(donnees.get("emailParent") ?? "").trim(),
    concoursVises: donnees.getAll("concoursVises").map(String),
    consentMarketing: donnees.get("consentMarketing") === "on",
    cguAcceptees: donnees.get("cguAcceptees") === "on",
  };

  const analyse = schemaInscription.safeParse(brut);
  if (!analyse.success) {
    return { erreurs: analyse.error.flatten().fieldErrors };
  }
  const d = analyse.data;

  const admin = createAdminClient();
  const parcours = parcoursAge(d.dateNaissance);
  const maintenant = new Date().toISOString();

  // Le compte auth est créé sans confirmation : c'est notre lien de double
  // opt-in, envoyé plus bas, qui la déclenchera (§5.1).
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
      date_naissance: d.dateNaissance,
      ville: d.ville,
      etablissement: d.etablissement,
      email_parent: d.emailParent,
      consent_marketing: d.consentMarketing,
      consent_marketing_date: d.consentMarketing ? maintenant : null,
      cgu_acceptees_date: maintenant,
      email_verifie: false,
      autorisation_parentale:
        parcours === "moins_de_15" ? "en_attente" : "non_requise",
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

    // Accès parent : créé pour tous les mineurs (§5.1). Un majeur n'a pas de
    // parent à informer, et l'email parent reste alors inutilisé.
    let lienParent: string | null = null;
    if (parcours !== "majeur") {
      const { jeton, empreinte } = creerJetonParent();
      const { error: erreurParent } = await admin.from("parent_access").insert({
        user_id: idUtilisateur,
        email_parent: d.emailParent,
        token_hash: empreinte,
      });
      if (erreurParent) throw new Error(erreurParent.message);
      lienParent = urlEspaceParent(jeton);
    }

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

    if (lienParent) {
      await envoyerEmail(
        d.emailParent,
        parcours === "moins_de_15"
          ? emailAutorisationParent(d.prenom, lienParent)
          : emailInformationParent(d.prenom, lienParent),
      );
    }

    return { succes: { parcours, emailParent: d.emailParent } };
  } catch (e) {
    await admin.auth.admin.deleteUser(idUtilisateur);
    console.error("Inscription échouée, compte annulé :", e);
    return {
      message:
        "L'inscription n'a pas pu aboutir. Aucun compte n'a été créé, tu peux réessayer.",
    };
  }
}
