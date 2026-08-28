-- =============================================================================
-- Retrait de la date de naissance du formulaire d'inscription
-- =============================================================================
-- La date de naissance n'est plus demandée à la création de compte (le système
-- d'autorisation parentale, seul usage qui en dépendait, a été retiré en
-- 20260825120000). On rend donc la colonne nullable : les nouveaux comptes
-- n'en fourniront pas, les comptes existants conservent la valeur saisie.
-- La contrainte de plausibilité (date_naissance_plausible) reste valide : une
-- valeur NULL ne la déclenche pas.

alter table public.users
  alter column date_naissance drop not null;

comment on column public.users.date_naissance is
  'Date de naissance (facultative, historique) ; plus collectée à l''inscription.';
