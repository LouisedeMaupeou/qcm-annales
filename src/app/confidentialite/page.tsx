import type { Metadata } from "next";
import Link from "next/link";
import { ACompleter, PageLegale } from "@/components/page-legale";

export const metadata: Metadata = {
  title: "Politique de confidentialité — Admissible",
  robots: { index: false },
};

export default function Confidentialite() {
  return (
    <PageLegale titre="Politique de confidentialité">
      <p>
        Cette page décrit les données personnelles collectées par Admissible, les
        raisons de cette collecte et les droits dont disposent les personnes
        concernées.
      </p>

      <h2>Responsable de traitement</h2>
      <p>
        <ACompleter>dénomination sociale</ACompleter>,{" "}
        <ACompleter>adresse</ACompleter>. Contact pour toute question relative
        aux données : <ACompleter>adresse email dédiée</ACompleter>.
      </p>
      <p>
        Délégué à la protection des données :{" "}
        <ACompleter>coordonnées du DPO, ou mention « non désigné »</ACompleter>.
      </p>

      <h2>Données collectées</h2>
      <p>À la création du compte élève :</p>
      <ul>
        <li>identité : nom, prénom, date de naissance ;</li>
        <li>contact : adresse email de l&apos;élève ;</li>
        <li>scolarité : ville, établissement scolaire, concours visés ;</li>
        <li>
          consentements : acceptation des CGU et, séparément, consentement
          marketing, chacun horodaté.
        </li>
      </ul>
      <p>Au fil de l&apos;utilisation :</p>
      <ul>
        <li>
          sessions d&apos;entraînement jouées, réponses données, points obtenus
          et progression par matière ;
        </li>
        <li>signalements d&apos;erreurs sur les questions ;</li>
        <li>dates de connexion et de dernière activité.</li>
      </ul>

      <h2>Finalités et bases légales</h2>
      <ul>
        <li>
          <strong>Fournir le service d&apos;entraînement</strong> (compte,
          sessions, tableau de bord) — exécution du contrat.
        </li>
        <li>
          <strong>Communications commerciales</strong> sur les offres de{" "}
          <ACompleter>entité destinataire</ACompleter> — consentement, recueilli
          par une case décochée par défaut et distincte de l&apos;acceptation des
          CGU. Ce consentement est retirable à tout moment, sans conséquence sur
          l&apos;accès à la plateforme.
        </li>
        <li>
          <strong>Mesure d&apos;audience</strong> — consentement, recueilli par
          le bandeau cookies. Le refus n&apos;empêche pas l&apos;usage du site.
        </li>
      </ul>

      <h2>Mineurs</h2>
      <p>
        La plateforme s&apos;adresse à un public majoritairement mineur.
        L&apos;inscription se fait sans recueil du consentement d&apos;un parent.
      </p>
      <p className="text-sm opacity-80">
        <ACompleter>
          À faire valider par un conseil : le RGPD (article 8, seuil français de
          15 ans) impose en principe le consentement d&apos;un titulaire de
          l&apos;autorité parentale pour un inscrit de moins de 15 ans. Le
          mécanisme de recueil de ce consentement, ou une barrière d&apos;âge,
          reste à définir avant l&apos;ouverture au public.
        </ACompleter>
      </p>

      <h2>Destinataires</h2>
      <ul>
        <li>
          les équipes internes de <ACompleter>éditeur</ACompleter>, pour
          l&apos;exploitation et le support ;
        </li>
        <li>
          les sous-traitants techniques : hébergement et base de données
          (<ACompleter>Supabase, Vercel — entités et pays</ACompleter>), envoi
          d&apos;emails transactionnels (<ACompleter>prestataire</ACompleter>) ;
        </li>
        <li>
          en cas de consentement marketing, l&apos;outil de gestion de la
          relation client <ACompleter>Zoho CRM — entité et pays</ACompleter>.
        </li>
      </ul>
      <p>
        <ACompleter>
          Préciser les transferts hors Union européenne et les garanties
          associées (clauses contractuelles types, etc.)
        </ACompleter>
      </p>

      <h2>Durées de conservation</h2>
      <ul>
        <li>
          compte et historique de progression :{" "}
          <ACompleter>durée, ex. 3 ans après la dernière activité</ACompleter> ;
        </li>
        <li>
          données de prospection en cas de consentement marketing :{" "}
          <ACompleter>durée, ex. 3 ans après le dernier contact</ACompleter> ;
        </li>
        <li>
          preuves de consentement :{" "}
          <ACompleter>durée, ex. 5 ans</ACompleter>.
        </li>
      </ul>

      <h2>Vos droits</h2>
      <p>
        Vous disposez d&apos;un droit d&apos;accès, de rectification,
        d&apos;effacement, de limitation, d&apos;opposition et de portabilité.
        L&apos;élève peut supprimer son compte à tout moment depuis son espace :
        la suppression efface le compte et l&apos;ensemble des données liées
        (sessions, réponses, signalements).
      </p>
      <p>
        Pour exercer ces droits :{" "}
        <ACompleter>adresse email dédiée</ACompleter>. En cas de désaccord, vous
        pouvez saisir la CNIL (<a href="https://www.cnil.fr">www.cnil.fr</a>).
      </p>

      <h2>Cookies</h2>
      <p>
        Le site dépose uniquement les cookies strictement nécessaires à son
        fonctionnement (maintien de la session de connexion). Aucun cookie de
        mesure d&apos;audience n&apos;est déposé avant votre accord, recueilli
        par le bandeau affiché à votre arrivée. Votre choix est conservé sur
        votre appareil et modifiable à tout moment via le lien « Gérer les
        cookies » en pied de page.
      </p>
      <p className="text-sm opacity-80">
        Aucun outil de mesure d&apos;audience n&apos;est branché à ce jour. Ce
        paragraphe devra être complété par la liste des cookies effectivement
        déposés (nom, finalité, durée) lorsqu&apos;un outil sera mis en place.
      </p>

      <h2>Sécurité</h2>
      <p>
        Les mots de passe sont stockés hachés. L&apos;accès aux données est
        cloisonné par rôle au niveau de la base.
      </p>

      <p className="pt-4">
        <Link href="/cgu">Conditions générales d&apos;utilisation</Link> ·{" "}
        <Link href="/mentions-legales">Mentions légales</Link>
      </p>
    </PageLegale>
  );
}
