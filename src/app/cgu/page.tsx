import type { Metadata } from "next";
import Link from "next/link";
import { ACompleter, PageLegale } from "@/components/page-legale";

export const metadata: Metadata = {
  title: "Conditions générales d'utilisation — Admissible",
  robots: { index: false },
};

export default function Cgu() {
  return (
    <PageLegale titre="Conditions générales d'utilisation">
      <h2>1. Objet</h2>
      <p>
        Les présentes conditions régissent l&apos;accès et l&apos;utilisation de
        la plateforme Admissible, qui propose gratuitement un entraînement aux
        épreuves des concours post-bac à partir d&apos;annales officielles, avec
        correction et suivi de progression.
      </p>

      <h2>2. Accès au service</h2>
      <p>
        L&apos;inscription est libre et gratuite. Elle requiert une adresse
        email valide, que l&apos;utilisateur confirme par un lien : le compte
        devient actif une fois l&apos;adresse confirmée.
      </p>
      <p className="text-sm opacity-80">
        <ACompleter>
          Mineurs de moins de 15 ans : mécanisme de consentement parental ou
          barrière d&apos;âge à définir avec un conseil (RGPD, article 8) avant
          l&apos;ouverture au public.
        </ACompleter>
      </p>

      <h2>3. Compte et mot de passe</h2>
      <p>
        L&apos;utilisateur est responsable de la confidentialité de son mot de
        passe et des actions effectuées depuis son compte. Le compte est
        strictement personnel.
      </p>

      <h2>4. Contenu des annales</h2>
      <p>
        Les questions sont issues d&apos;annales officielles de concours. Malgré
        le soin apporté à leur transcription et à leur relecture, des erreurs
        peuvent subsister, y compris dans les sujets d&apos;origine. Chaque
        question peut être signalée depuis la correction ; un signalement
        entraîne le retrait immédiat de la question le temps de sa vérification.
      </p>
      <p>
        Les barèmes affichés reproduisent ceux des règlements officiels. Ils
        sont donnés à titre indicatif : seul le règlement de la session
        concernée fait foi. L&apos;éditeur n&apos;est ni affilié aux banques de
        concours, ni mandaté par elles.
      </p>

      <h2>5. Absence de garantie de résultat</h2>
      <p>
        La plateforme est un outil d&apos;entraînement. Aucun résultat à un
        concours n&apos;est garanti. Les scores obtenus sur la plateforme ne
        préjugent pas des résultats réels.
      </p>

      <h2>6. Comportement de l&apos;utilisateur</h2>
      <p>Il est interdit de :</p>
      <ul>
        <li>
          extraire, copier ou rediffuser tout ou partie du contenu de la
          plateforme, notamment par des moyens automatisés ;
        </li>
        <li>créer des comptes multiples ou usurper l&apos;identité d&apos;un tiers ;</li>
        <li>
          perturber le fonctionnement du service ou tenter d&apos;accéder à des
          données auxquelles l&apos;utilisateur n&apos;a pas droit.
        </li>
      </ul>

      <h2>7. Suspension et suppression</h2>
      <p>
        L&apos;éditeur peut suspendre ou supprimer un compte en cas de
        manquement aux présentes conditions,{" "}
        <ACompleter>préciser : après mise en demeure, préavis, recours</ACompleter>
        .
      </p>
      <p>
        L&apos;utilisateur peut supprimer son compte à tout moment depuis son
        espace. La suppression entraîne l&apos;effacement de ses données selon
        les modalités décrites dans la{" "}
        <Link href="/confidentialite">politique de confidentialité</Link>.
      </p>

      <h2>8. Données personnelles</h2>
      <p>
        Le traitement des données personnelles est décrit dans la{" "}
        <Link href="/confidentialite">politique de confidentialité</Link>, qui
        fait partie intégrante des présentes conditions.
      </p>

      <h2>9. Évolution du service et des conditions</h2>
      <p>
        L&apos;éditeur peut faire évoluer la plateforme et les présentes
        conditions. Les utilisateurs sont informés des modifications
        substantielles{" "}
        <ACompleter>préciser le canal et le délai de préavis</ACompleter>.
      </p>

      <h2>10. Responsabilité</h2>
      <p>
        <ACompleter>
          Clause de limitation de responsabilité à rédiger avec un conseil : le
          service étant gratuit et destiné à des mineurs, la rédaction doit être
          adaptée en conséquence
        </ACompleter>
      </p>

      <h2>11. Droit applicable</h2>
      <p>
        Les présentes conditions sont soumises au droit français. En cas de
        litige, et à défaut de résolution amiable,{" "}
        <ACompleter>
          préciser la juridiction compétente et, pour les consommateurs, le
          recours au médiateur de la consommation
        </ACompleter>
        .
      </p>
    </PageLegale>
  );
}
