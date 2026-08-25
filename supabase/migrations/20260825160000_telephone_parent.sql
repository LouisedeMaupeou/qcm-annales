-- =============================================================================
-- Coordonnées d'un parent à l'inscription : ajout du téléphone
-- =============================================================================
-- On collecte désormais l'email ET le téléphone d'un parent (champs obligatoires
-- du formulaire). L'email_parent existe déjà (conservé lors du retrait du système
-- d'autorisation parentale) ; on ajoute le téléphone.
--
-- Colonne nullable au niveau base : le caractère obligatoire est imposé à
-- l'inscription (validation applicative), pas en base — les comptes admin
-- existants n'ont pas de parent.

alter table public.users
  add column telephone_parent text;

comment on column public.users.telephone_parent is
  'Téléphone d''un parent, saisi à l''inscription (obligatoire côté formulaire).';
