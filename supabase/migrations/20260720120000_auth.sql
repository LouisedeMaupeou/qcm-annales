-- =============================================================================
-- Activation des comptes et parcours mineur (specs §5.1)
-- =============================================================================

-- §6.2 : l'admin peut désactiver un compte. Sans colonne dédiée, le calcul
-- automatique de `actif` écraserait cette décision au prochain UPDATE.
alter table public.users
  add column suspendu boolean not null default false;

comment on column public.users.suspendu is
  'Désactivation décidée par un admin (§6.2), distincte du parcours d''activation.';

-- `actif` n'est jamais écrit à la main : il découle du double opt-in (§5.1),
-- de l''autorisation parentale pour les moins de 15 ans, et de l''absence de
-- suspension administrative.
create function public.calculer_actif()
returns trigger
language plpgsql
as $$
begin
  new.actif :=
        new.email_verifie
    and new.autorisation_parentale <> 'en_attente'
    and not new.suspendu;
  return new;
end;
$$;

create trigger users_calculer_actif
  before insert or update of email_verifie, autorisation_parentale, suspendu
  on public.users
  for each row execute function public.calculer_actif();

-- Recalcul des lignes déjà présentes.
update public.users set email_verifie = email_verifie;

-- ---------------------------------------------------------------------------
-- Espace parent
-- ---------------------------------------------------------------------------
-- Le jeton est un porteur envoyé par email et conservé longtemps : le parent
-- ne gère pas de mot de passe (§5.1). Durée de vie bornée tout de même, pour
-- qu'une boîte mail compromise des années plus tard n'ouvre pas l'espace.
alter table public.parent_access
  alter column expires_at set default (now() + interval '2 years');

update public.parent_access
   set expires_at = created_at + interval '2 years'
 where expires_at is null;

-- Un seul accès courant par élève : réémettre un lien remplace le précédent.
create unique index parent_access_un_par_eleve on public.parent_access (user_id);
