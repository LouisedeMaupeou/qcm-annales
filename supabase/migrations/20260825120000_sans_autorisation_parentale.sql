-- =============================================================================
-- Version simplifiée : suppression du parcours d'autorisation parentale
-- =============================================================================
-- Décision produit : démarrage sans système parental. Un compte devient actif
-- dès que l'adresse email est confirmée (double opt-in élève), quel que soit
-- l'âge, et sans consentement parental.
--
-- ⚠️ Conformité : le RGPD (art. 8, seuil français de 15 ans) impose le
-- consentement parental pour un inscrit de moins de 15 ans. Cet écart est
-- assumé par le porteur du projet pour le lancement et à régulariser ensuite
-- (barrière d'âge ou recueil du consentement). Ce commentaire fait foi de la
-- décision.
--
-- On ne DÉTRUIT rien (colonne autorisation_parentale, table parent_access
-- conservées) : seule la logique d'activation change, pour rester réversible.

create or replace function public.calculer_actif()
returns trigger
language plpgsql
as $$
begin
  -- Plus de dépendance à l'autorisation parentale.
  new.actif := new.email_verifie and not new.suspendu;
  return new;
end;
$$;

-- L'ancien trigger ne se déclenchait que sur email_verifie, autorisation_parentale
-- et suspendu. autorisation_parentale n'entrant plus dans le calcul, on recrée
-- le trigger sans elle (inutile de recalculer sur une colonne devenue neutre).
drop trigger if exists users_calculer_actif on public.users;
create trigger users_calculer_actif
  before insert or update of email_verifie, suspendu
  on public.users
  for each row execute function public.calculer_actif();

-- Toute valeur « en_attente » résiduelle devient « non_requise », et on
-- recalcule l'activation des comptes concernés.
update public.users
   set autorisation_parentale = 'non_requise'
 where autorisation_parentale = 'en_attente';

-- Recalcul de `actif` sur l'ensemble (le trigger se déclenche sur update de
-- email_verifie ; on lui réaffecte sa propre valeur).
update public.users set email_verifie = email_verifie;
