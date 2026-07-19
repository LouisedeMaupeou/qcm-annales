import type { Metadata } from "next";
import { ACompleter, PageLegale } from "@/components/page-legale";

export const metadata: Metadata = {
  title: "Mentions légales — Admissible",
  robots: { index: false },
};

export default function MentionsLegales() {
  return (
    <PageLegale titre="Mentions légales">
      <p>
        Conformément à la loi n° 2004-575 du 21 juin 2004 pour la confiance dans
        l&apos;économie numérique (LCEN), les informations suivantes sont portées
        à la connaissance des utilisateurs du site Admissible.
      </p>

      <h2>Éditeur du site</h2>
      <ul>
        <li>
          Raison sociale : <ACompleter>dénomination sociale</ACompleter>
        </li>
        <li>
          Forme juridique et capital social :{" "}
          <ACompleter>SAS / SARL / …, capital de … €</ACompleter>
        </li>
        <li>
          Siège social : <ACompleter>adresse postale complète</ACompleter>
        </li>
        <li>
          Immatriculation : RCS <ACompleter>ville et numéro</ACompleter> — SIRET{" "}
          <ACompleter>numéro</ACompleter>
        </li>
        <li>
          Numéro de TVA intracommunautaire : <ACompleter>numéro</ACompleter>
        </li>
        <li>
          Contact : <ACompleter>adresse email</ACompleter> —{" "}
          <ACompleter>téléphone</ACompleter>
        </li>
      </ul>

      <h2>Directeur de la publication</h2>
      <p>
        <ACompleter>nom et qualité du directeur de la publication</ACompleter>
      </p>

      <h2>Hébergeur</h2>
      <p>
        Le site est hébergé par <ACompleter>raison sociale de l&apos;hébergeur</ACompleter>,{" "}
        <ACompleter>adresse postale</ACompleter>,{" "}
        <ACompleter>téléphone</ACompleter>.
      </p>
      <p className="text-sm opacity-80">
        Le déploiement est prévu sur Vercel, avec une base de données Supabase.
        Renseigner ici les entités juridiques et adresses exactes de ces
        prestataires, ainsi que la localisation des serveurs — cette information
        est reprise dans la politique de confidentialité au titre des
        transferts de données.
      </p>

      <h2>Propriété intellectuelle</h2>
      <p>
        La structure du site, les textes, la charte graphique et les
        développements sont la propriété de l&apos;éditeur.
      </p>
      <p>
        Les sujets d&apos;annales reproduits sur la plateforme demeurent la
        propriété de leurs auteurs et des banques de concours concernées. Leur
        reproduction est soumise à{" "}
        <ACompleter>
          préciser le régime : autorisation obtenue, licence, ou exception
          invoquée, concours par concours
        </ACompleter>
        .
      </p>
      <p className="text-sm opacity-80">
        Les specs (§8.9) signalent que les droits de reproduction des annales
        doivent être sécurisés concours par concours avant tout import massif.
        Cette section ne peut être rédigée qu&apos;une fois ce point tranché.
      </p>

      <h2>Signaler un contenu</h2>
      <p>
        Toute erreur ou tout contenu litigieux peut être signalé depuis la
        correction d&apos;une session, ou à l&apos;adresse{" "}
        <ACompleter>adresse email de contact</ACompleter>.
      </p>
    </PageLegale>
  );
}
