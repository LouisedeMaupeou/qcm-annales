-- =============================================================================
-- Épreuves orales et grilles d'évaluation (module concours blancs, §5.5)
-- =============================================================================
-- Les entretiens de motivation et oraux de synthèse font partie des concours
-- blancs. Ils ne se corrigent pas : ils s'évaluent, avec une grille de
-- critères pondérés que le professeur remplit devant l'élève.
--
-- Pourquoi une grille en JSON plutôt que des colonnes : les critères changent
-- par concours et par épreuve — un oral de motivation ACCES ne s'évalue pas
-- comme un oral de synthèse Advance — et la responsable doit pouvoir en
-- ajouter un sans migration.

create type public.statut_evaluation_orale as enum ('brouillon', 'validee');

create table public.epreuves_orales (
  id            uuid primary key default gen_random_uuid(),
  session_cb_id uuid not null references public.sessions_cb (id) on delete cascade,
  concours_id   uuid not null references public.concours (id) on delete restrict,
  nom           text not null,
  ordre         integer not null default 0,
  created_at    timestamptz not null default now(),
  unique (session_cb_id, concours_id, nom)
);

create index epreuves_orales_session_idx on public.epreuves_orales (session_cb_id, ordre);

create table public.grilles_oral (
  id               uuid primary key default gen_random_uuid(),
  epreuve_orale_id uuid not null references public.epreuves_orales (id) on delete cascade,
  criteres         jsonb not null default '[]'::jsonb,
  actif            boolean not null default true,
  created_at       timestamptz not null default now()
);

create index grilles_oral_epreuve_idx on public.grilles_oral (epreuve_orale_id) where actif;

comment on column public.grilles_oral.criteres is
  'Critères pondérés : [{libelle, ponderation, echelle}]. La note globale est '
  'la moyenne des critères pondérée, ramenée sur 20 (§5.5).';

create table public.evaluations_orales (
  id               uuid primary key default gen_random_uuid(),
  epreuve_orale_id uuid not null references public.epreuves_orales (id) on delete cascade,
  user_id          uuid not null references public.users (id) on delete cascade,
  professeur_id    uuid references public.users (id) on delete set null,
  notes_criteres   jsonb not null default '{}'::jsonb,
  note_globale     numeric(5, 2),
  appreciation     text,
  recommandation   text,
  statut           public.statut_evaluation_orale not null default 'brouillon',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (epreuve_orale_id, user_id)
);

create index evaluations_orales_eleve_idx on public.evaluations_orales (user_id);

comment on column public.evaluations_orales.professeur_id is
  'Auteur de l''évaluation. Sans lui, une appréciation contestée ne peut être '
  'rattachée à personne — c''est l''argument du §5.5 pour un rôle professeur '
  'plutôt qu''un compte admin partagé.';

create trigger evaluations_orales_touch
  before update on public.evaluations_orales
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Accès
-- ---------------------------------------------------------------------------
create function public.is_professeur()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.auth_role()::text = 'professeur', false);
$$;

revoke execute on function public.is_professeur() from public;
grant  execute on function public.is_professeur() to authenticated;

alter table public.epreuves_orales    enable row level security;
alter table public.grilles_oral       enable row level security;
alter table public.evaluations_orales enable row level security;

create policy epreuves_orales_lecture on public.epreuves_orales
  for select to authenticated
  using (public.is_prepa() or public.is_professeur());
create policy epreuves_orales_prepa on public.epreuves_orales
  for all to authenticated
  using (public.is_prepa()) with check (public.is_prepa());

create policy grilles_oral_lecture on public.grilles_oral
  for select to authenticated
  using (public.is_prepa() or public.is_professeur());
create policy grilles_oral_prepa on public.grilles_oral
  for all to authenticated
  using (public.is_prepa()) with check (public.is_prepa());

-- Le professeur écrit les évaluations ; la responsable voit et corrige tout.
create policy evaluations_orales_professeur on public.evaluations_orales
  for all to authenticated
  using (public.is_professeur()) with check (public.is_professeur());
create policy evaluations_orales_prepa on public.evaluations_orales
  for all to authenticated
  using (public.is_prepa()) with check (public.is_prepa());

-- L'élève lit sa note d'oral quand son bilan est parti, jamais avant : même
-- embargo que le reste de la session (§4.4).
create policy evaluations_orales_eleve on public.evaluations_orales
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1
        from public.bilans b
        join public.epreuves_orales eo on eo.session_cb_id = b.session_cb_id
       where eo.id = evaluations_orales.epreuve_orale_id
         and b.user_id = (select auth.uid())
         and b.statut = 'envoye'
    )
  );
