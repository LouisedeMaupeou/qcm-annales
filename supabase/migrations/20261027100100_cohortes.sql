-- =============================================================================
-- Cohortes de la prépa Parkours (module concours blancs, §5.1 et §6)
-- =============================================================================
-- Une cohorte est un groupe d'élèves de la prépa (« Prépa Ingénieurs
-- 2026-2027 »). Un élève appartient à 0 ou 1 cohorte : rattaché, il garde son
-- compte et son accès à l'entraînement libre ; non rattaché, c'est un
-- internaute comme un autre.

create table public.cohortes (
  id         uuid primary key default gen_random_uuid(),
  nom        text not null unique,
  filiere    public.filiere not null,
  millesime  text not null,                    -- ex. « 2026-2027 »
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.cohortes is
  'Groupe d''élèves de la prépa Parkours. Unité d''assignation des épreuves blanches.';

create index cohortes_actives_idx on public.cohortes (nom) where active;

alter table public.users
  add column cohorte_id uuid references public.cohortes (id) on delete set null,
  -- §5.1 : l'import d'une cohorte invite les comptes qui n'existent pas encore.
  -- La date d'envoi distingue « invité, en attente » de « jamais invité ».
  add column invite_le timestamptz;

comment on column public.users.cohorte_id is
  'Rattachement prépa. NULL = internaute libre (module concours blancs, §6).';
comment on column public.users.invite_le is
  'Dernier envoi d''invitation à rejoindre une cohorte (§5.1).';

create index users_cohorte_id_idx on public.users (cohorte_id) where cohorte_id is not null;

-- ---------------------------------------------------------------------------
-- Rôles
-- ---------------------------------------------------------------------------
-- Le responsable des prépas pilote tout le périmètre Prépa. Il lui faut la
-- banque de questions (composer une épreuve blanche, relire une extraction),
-- donc il entre dans is_staff() ; il reste hors de is_admin(), qui garde les
-- barèmes, les paramètres et les réglages du site public (§5).
-- Comparaison sur le texte, et non sur des littéraux de l'énumération : une
-- valeur ajoutée par `alter type ... add value` ne peut pas être utilisée
-- dans la transaction qui l'ajoute. Le cast rend ces deux fonctions valides
-- même si l'outil de migration regroupait les fichiers en une transaction.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    public.auth_role()::text in ('admin', 'contributeur', 'responsable_prepa'),
    false
  );
$$;

create function public.is_prepa()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.auth_role()::text in ('admin', 'responsable_prepa'), false);
$$;

revoke execute on function public.is_prepa() from public;
grant  execute on function public.is_prepa() to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.cohortes enable row level security;

-- Un élève doit pouvoir lire le nom de sa propre cohorte (affiché dans son
-- espace « Mes concours blancs », §4).
create policy cohortes_select_sienne on public.cohortes
  for select to authenticated
  using (
    public.is_staff()
    or id = (select u.cohorte_id from public.users u where u.id = (select auth.uid()))
  );

create policy cohortes_prepa_write on public.cohortes
  for all to authenticated
  using (public.is_prepa())
  with check (public.is_prepa());

-- Le responsable des prépas lit et écrit les fiches des élèves rattachés à une
-- cohorte, et eux seuls : les internautes libres ne relèvent pas de son
-- périmètre, et leurs données personnelles n'ont pas à lui être exposées.
create policy users_prepa_rattaches on public.users
  for select to authenticated
  using (public.is_prepa() and cohorte_id is not null);

-- L'écriture (rattachement, invitation) passe par le service_role après
-- contrôle du rôle côté serveur : les privilèges de colonne posés en §9 du
-- socle verrouillent `update` pour tout `authenticated`, admin compris.
