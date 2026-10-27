-- =============================================================================
-- Sessions et épreuves blanches (module concours blancs, §5.2 et §6)
-- =============================================================================
-- Une session (« Toussaint 2026 ») regroupe des épreuves blanches. Une épreuve
-- blanche est une liste de questions **fixes et ordonnées** — jamais de tirage
-- aléatoire, contrairement à l'entraînement libre — avec sa durée officielle,
-- sa fenêtre de passage, son barème et les cohortes qui la composent.
--
-- Écart assumé par rapport au §6, à lire avant de toucher au barème : le §6
-- prévoyait `epreuves_cb.bareme_id` pointant vers la table `baremes` du socle.
-- Ce n'est pas tenable. `baremes` est unique par (concours, épreuve) : elle ne
-- peut pas porter deux barèmes différents pour « Avenir / Mathématiques », or
-- c'est exactement le cas (README : +3/−1 en 2025, +1/−1 en 2026, et le
-- concours blanc a le sien). Et surtout, trois des quatre barèmes relevés sur
-- les sujets ne s'expriment pas avec un triplet bonne/mauvaise/abstention :
-- plancher par exercice chez GEIPI, bonification par exercice entièrement
-- juste chez Puissance Alpha, tout ou rien par question en analyse
-- documentaire SÉSAME. L'épreuve blanche porte donc son propre barème, plus
-- un objet `regles` pour ce que le triplet ne dit pas.

create type public.statut_session_cb as enum (
  'preparation', 'ouverte', 'correction', 'cloturee'
);
create type public.statut_epreuve_cb as enum ('brouillon', 'publiee');
create type public.statut_passage    as enum ('en_cours', 'remis', 'corrige');
create type public.statut_reponse_cb as enum (
  'correcte', 'incorrecte', 'abstention', 'a_corriger'
);

-- ---------------------------------------------------------------------------
-- Sessions
-- ---------------------------------------------------------------------------
create table public.sessions_cb (
  id         uuid primary key default gen_random_uuid(),
  nom        text not null unique,
  statut     public.statut_session_cb not null default 'preparation',
  created_at timestamptz not null default now()
);

comment on table public.sessions_cb is
  'Campagne de concours blancs (ex. Toussaint 2026). Unité du bilan (§2).';

-- ---------------------------------------------------------------------------
-- Épreuves blanches
-- ---------------------------------------------------------------------------
create table public.epreuves_cb (
  id                 uuid primary key default gen_random_uuid(),
  session_cb_id      uuid not null references public.sessions_cb (id) on delete cascade,
  epreuve_id_externe text not null,
  concours_id        uuid not null references public.concours (id) on delete restrict,
  epreuve_id         uuid not null references public.epreuves (id) on delete restrict,
  matiere            text not null,

  duree_minutes      integer not null check (duree_minutes between 5 and 480),
  fenetre_debut      timestamptz,
  fenetre_fin        timestamptz,

  -- Barème : le triplet du socle…
  points_bonne       numeric(5, 2) not null default 1,
  points_mauvaise    numeric(5, 2) not null default 0,
  points_abstention  numeric(5, 2) not null default 0,
  -- …et ce que le triplet ne sait pas dire. Clés reconnues :
  --   plancher_par_bloc          (bool)    GEIPI : un exercice ne peut pas être négatif
  --   bonification_bloc_complet  (numeric) Puissance Alpha : +1 par exercice tout juste
  --   tout_ou_rien_par_question  (bool)    SÉSAME analyse documentaire
  --   blocs_au_choix             (objet)   Puissance Alpha : 4 obligatoires + 4 au choix
  regles             jsonb not null default '{}'::jsonb,
  bareme_source      text,
  note_sur           numeric(5, 2) not null default 20 check (note_sur > 0),

  statut             public.statut_epreuve_cb not null default 'brouillon',
  created_at         timestamptz not null default now(),

  unique (session_cb_id, epreuve_id_externe),
  constraint fenetre_coherente
    check (fenetre_debut is null or fenetre_fin is null or fenetre_debut < fenetre_fin)
);

comment on column public.epreuves_cb.regles is
  'Règles de barème non exprimables par le triplet (plancher par exercice, '
  'bonification, tout ou rien). Lues par la correction, §5.3.';
comment on column public.epreuves_cb.bareme_source is
  'Consigne du sujet dont le barème est tiré — à vérifier avant usage noté.';

create index epreuves_cb_session_idx on public.epreuves_cb (session_cb_id);

-- Questions fixes et ordonnées (§2 : « jamais de tirage aléatoire »).
create table public.epreuve_cb_questions (
  epreuve_cb_id uuid not null references public.epreuves_cb (id) on delete cascade,
  question_id   uuid not null references public.questions (id) on delete restrict,
  ordre         numeric(6, 2) not null,
  points        numeric(5, 2) not null default 1,
  primary key (epreuve_cb_id, question_id)
);

create index epreuve_cb_questions_ordre_idx
  on public.epreuve_cb_questions (epreuve_cb_id, ordre);

create table public.epreuve_cb_cohortes (
  epreuve_cb_id uuid not null references public.epreuves_cb (id) on delete cascade,
  cohorte_id    uuid not null references public.cohortes (id) on delete cascade,
  primary key (epreuve_cb_id, cohorte_id)
);

create index epreuve_cb_cohortes_cohorte_idx on public.epreuve_cb_cohortes (cohorte_id);

-- ---------------------------------------------------------------------------
-- Passages
-- ---------------------------------------------------------------------------
-- Créés ici, servis à l'étape 12 : le suivi en temps réel du §5.2 les lit déjà
-- (qui a composé, qui est en cours, qui n'a pas commencé).
create table public.passages (
  id             uuid primary key default gen_random_uuid(),
  epreuve_cb_id  uuid not null references public.epreuves_cb (id) on delete cascade,
  user_id        uuid not null references public.users (id) on delete cascade,
  started_at     timestamptz not null default now(),
  remis_at       timestamptz,
  temps_passe    integer,
  statut         public.statut_passage not null default 'en_cours',
  note           numeric(7, 2),
  note_sur_20    numeric(5, 2),
  nb_bonnes      integer not null default 0,
  nb_fausses     integer not null default 0,
  nb_abstentions integer not null default 0,

  -- §4 : tentative unique.
  unique (epreuve_cb_id, user_id)
);

create index passages_user_idx on public.passages (user_id);

create table public.passage_reponses (
  id           uuid primary key default gen_random_uuid(),
  passage_id   uuid not null references public.passages (id) on delete cascade,
  question_id  uuid not null references public.questions (id) on delete restrict,
  reponse      jsonb,
  statut       public.statut_reponse_cb,
  points       numeric(5, 2),
  correcteur_id uuid references public.users (id) on delete set null,
  annotation   text,
  unique (passage_id, question_id)
);

create index passage_reponses_passage_idx on public.passage_reponses (passage_id);
create index passage_reponses_a_corriger_idx on public.passage_reponses (statut)
  where statut = 'a_corriger';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.sessions_cb          enable row level security;
alter table public.epreuves_cb          enable row level security;
alter table public.epreuve_cb_questions enable row level security;
alter table public.epreuve_cb_cohortes  enable row level security;
alter table public.passages             enable row level security;
alter table public.passage_reponses     enable row level security;

create policy sessions_cb_staff_lecture on public.sessions_cb
  for select to authenticated using (public.is_staff());
create policy sessions_cb_prepa_ecriture on public.sessions_cb
  for all to authenticated using (public.is_prepa()) with check (public.is_prepa());

-- L'élève voit les épreuves publiées assignées à sa cohorte — c'est l'onglet
-- « Mes concours blancs » (§4.2). Il n'y voit que le cadre : matière, durée,
-- fenêtre. Les questions, elles, restent hors de sa portée (politique
-- suivante), et lui sont servies par le serveur pendant son passage.
create policy epreuves_cb_lecture on public.epreuves_cb
  for select to authenticated
  using (
    public.is_staff()
    or (
      statut = 'publiee'
      and exists (
        select 1
          from public.epreuve_cb_cohortes ec
          join public.users u on u.cohorte_id = ec.cohorte_id
         where ec.epreuve_cb_id = epreuves_cb.id
           and u.id = (select auth.uid())
      )
    )
  );

create policy epreuves_cb_prepa_ecriture on public.epreuves_cb
  for all to authenticated using (public.is_prepa()) with check (public.is_prepa());

-- Le contenu d'une épreuve n'est jamais lisible par un élève : la liste
-- ordonnée des questions dirait le sujet avant l'heure, et `questions` est
-- déjà fermée aux élèves pour la même raison (cf. migration RLS du socle).
create policy epreuve_cb_questions_staff on public.epreuve_cb_questions
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy epreuve_cb_cohortes_lecture on public.epreuve_cb_cohortes
  for select to authenticated using (public.is_staff());
create policy epreuve_cb_cohortes_prepa on public.epreuve_cb_cohortes
  for all to authenticated using (public.is_prepa()) with check (public.is_prepa());

-- --- Embargo (§4.4) --------------------------------------------------------
-- « La correction et le bilan ne deviennent visibles qu'après validation par
-- la responsable », et le §7.3 précise que l'embargo est une règle serveur,
-- pas un masquage d'interface. L'élève peut donc constater l'état de sa copie
-- — c'est ce qui lui permet de la reprendre après une coupure — mais aucune
-- colonne de résultat ne lui est exposée. Le verrou est posé au niveau des
-- privilèges de colonne, que la RLS ne peut pas exprimer.
create policy passages_siens on public.passages
  for select to authenticated using (user_id = (select auth.uid()));
create policy passages_prepa on public.passages
  for all to authenticated using (public.is_prepa()) with check (public.is_prepa());

revoke select on public.passages from authenticated;
grant  select (id, epreuve_cb_id, user_id, started_at, remis_at, temps_passe, statut)
  on public.passages to authenticated;

-- Même raisonnement pour le détail : l'élève relit ses réponses pendant
-- l'épreuve, jamais leur correction.
create policy passage_reponses_siennes on public.passage_reponses
  for select to authenticated
  using (exists (
    select 1 from public.passages p
     where p.id = passage_reponses.passage_id
       and p.user_id = (select auth.uid())
  ));
create policy passage_reponses_prepa on public.passage_reponses
  for all to authenticated using (public.is_prepa()) with check (public.is_prepa());

revoke select on public.passage_reponses from authenticated;
grant  select (id, passage_id, question_id, reponse) on public.passage_reponses to authenticated;
