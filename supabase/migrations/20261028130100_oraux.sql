-- =============================================================================
-- Oraux blancs : épreuves, grilles et évaluations (module concours blancs, §5.5)
-- =============================================================================
-- Les entretiens blancs ne se corrigent pas, ils s'évaluent : une grille de
-- huit critères par épreuve, que le jury remplit devant le candidat.
--
-- Les épreuves sont définies par filière, pas par concours. C'est ce que dit
-- la grille Parkours : commerce passe quatre oraux (collectif, personnalité,
-- image, anglais), ingénieur le seul oral de personnalité. Les pondérations
-- viennent de l'onglet Paramètres du même fichier.
--
-- La grille est stockée en JSON plutôt qu'en colonnes : les critères diffèrent
-- d'une épreuve à l'autre et la responsable doit pouvoir en ajuster un sans
-- migration. Les valeurs par défaut vivent dans src/lib/oraux.ts, avec leurs
-- tests.
--
-- Aucun commentaire à l'intérieur des create table ci-dessous : la
-- documentation durable est en comment on column, après les requêtes.

create type public.statut_evaluation_orale as enum ('brouillon', 'validee');

create table public.epreuves_orales (
  id            uuid primary key default gen_random_uuid(),
  session_cb_id uuid not null references public.sessions_cb (id) on delete cascade,
  filiere       public.filiere not null,
  cle           text not null,
  nom           text not null,
  ponderation   numeric(4, 3) not null default 0 check (ponderation >= 0 and ponderation <= 1),
  contexte      text,
  ordre         integer not null default 0,
  created_at    timestamptz not null default now(),
  unique (session_cb_id, filiere, cle)
);

comment on column public.epreuves_orales.ponderation is
  'Poids dans la note globale d''oral. 0 = épreuve passée et notée, mais hors '
  'moyenne : c''est le cas de l''oral collectif, atelier d''entraînement que '
  'l''IESEG n''annonce pas dans ses oraux.';
comment on column public.epreuves_orales.contexte is
  'Intitulé du champ de contexte que le jury renseigne en tête de grille : '
  'sujet du collectif, école visée, référence du visuel, support anglais.';

create index epreuves_orales_session_idx on public.epreuves_orales (session_cb_id, ordre);

create table public.grilles_oral (
  id               uuid primary key default gen_random_uuid(),
  epreuve_orale_id uuid not null references public.epreuves_orales (id) on delete cascade,
  criteres         jsonb not null default '[]'::jsonb,
  actif            boolean not null default true,
  created_at       timestamptz not null default now()
);

comment on column public.grilles_oral.criteres is
  'Critères de la grille : [{libelle, maximum, indicateur}]. La somme des '
  'maxima fait 20, la note de l''épreuve est donc le total des points.';

create index grilles_oral_epreuve_idx on public.grilles_oral (epreuve_orale_id) where actif;

create table public.evaluations_orales (
  id                  uuid primary key default gen_random_uuid(),
  epreuve_orale_id    uuid not null references public.epreuves_orales (id) on delete cascade,
  user_id             uuid not null references public.users (id) on delete cascade,
  professeur_id       uuid references public.users (id) on delete set null,
  contexte            text,
  notes_criteres      jsonb not null default '{}'::jsonb,
  note                numeric(5, 2),
  point_fort          text,
  progres_prioritaire text,
  commentaire_jury    text,
  statut              public.statut_evaluation_orale not null default 'brouillon',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (epreuve_orale_id, user_id)
);

comment on column public.evaluations_orales.professeur_id is
  'Auteur de l''évaluation. Sans lui, une appréciation contestée ne peut être '
  'rattachée à personne : c''est l''argument du §5.5 pour un rôle professeur '
  'plutôt qu''un compte admin partagé.';
comment on column public.evaluations_orales.note is
  'Total des points de la grille, sur 20. Recalculé à chaque enregistrement '
  'par le serveur, jamais repris du formulaire.';

create index evaluations_orales_eleve_idx on public.evaluations_orales (user_id);

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

create policy evaluations_orales_professeur on public.evaluations_orales
  for all to authenticated
  using (public.is_professeur()) with check (public.is_professeur());
create policy evaluations_orales_prepa on public.evaluations_orales
  for all to authenticated
  using (public.is_prepa()) with check (public.is_prepa());

-- L'eleve lit sa note d'oral quand son bilan est parti, jamais avant : meme
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
