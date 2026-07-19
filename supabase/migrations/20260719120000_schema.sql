-- =============================================================================
-- Plateforme QCM annales — schéma complet (specs v1.2, §7)
-- =============================================================================
-- Écarts assumés par rapport au §7, documentés ici :
--
--  * users.password_hash n'existe pas : Supabase Auth (auth.users) détient les
--    mots de passe hashés (§8.7). public.users porte l'identité applicative et
--    référence auth.users(id).
--  * parent_access.token_magique est stocké *hashé* (token_hash) et non en
--    clair : la table est un magasin de jetons porteurs, un dump de base ne doit
--    pas donner accès aux espaces parents. Ajout d'un expires_at.
--  * baremes.epreuve_id est nullable = barème par défaut du concours, surchargé
--    par un barème plus spécifique quand epreuve_id est renseigné.
-- =============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.user_role              as enum ('eleve', 'admin', 'contributeur');
create type public.filiere                as enum ('commerce', 'ingenieur');
create type public.autorisation_parentale as enum ('non_requise', 'en_attente', 'accordee');
create type public.format_source          as enum ('un_document', 'deux_documents');
create type public.document_type          as enum ('questions', 'corrections', 'complet');
create type public.contenu_statut         as enum ('brouillon', 'publie', 'archive');
create type public.question_type          as enum ('choix_unique', 'vrai_faux', 'choix_multiple', 'redaction');
create type public.explication_origine    as enum ('humaine', 'generee');
create type public.question_statut        as enum ('brouillon', 'a_verifier', 'publie', 'depubliee');
create type public.statut_extraction      as enum ('manuel', 'ok', 'a_verifier');
create type public.question_origine       as enum ('extraite', 'manuelle', 'generee');
create type public.session_mode           as enum ('entrainement', 'conditions_reelles');
create type public.reponse_statut         as enum ('correcte', 'incorrecte', 'abstention');

-- ---------------------------------------------------------------------------
-- Utilisateurs
-- ---------------------------------------------------------------------------
create table public.users (
  id                     uuid primary key references auth.users (id) on delete cascade,
  email                  text not null unique,
  role                   public.user_role not null default 'eleve',
  nom                    text not null,
  prenom                 text not null,
  date_naissance         date not null,
  ville                  text,
  etablissement          text,
  email_parent           text,
  consent_marketing      boolean not null default false,
  consent_marketing_date timestamptz,
  cgu_acceptees_date     timestamptz,
  email_verifie          boolean not null default false,
  autorisation_parentale public.autorisation_parentale not null default 'non_requise',
  actif                  boolean not null default false,
  created_at             timestamptz not null default now(),

  -- §5.1 : la case marketing est horodatée quand elle est cochée.
  constraint consent_marketing_horodate
    check (consent_marketing = false or consent_marketing_date is not null),
  constraint date_naissance_plausible
    check (date_naissance > date '1940-01-01' and date_naissance < current_date)
);

comment on table public.users is
  'Identité applicative. Les mots de passe vivent dans auth.users (Supabase Auth).';

create index users_role_idx       on public.users (role);
create index users_created_at_idx on public.users (created_at desc);

-- Âge en années révolues à la date du jour (§5.1, parcours mineur).
create function public.age_ans(date_naissance date)
returns integer
language sql
immutable
as $$
  select extract(year from age(current_date, date_naissance))::integer;
$$;

-- §5.1 : < 15 ans → autorisation parentale bloquante ; 15-17 → information ;
-- majeur → non requise. Utilisé à l'inscription pour initialiser le statut.
create function public.autorisation_requise(date_naissance date)
returns public.autorisation_parentale
language sql
immutable
as $$
  select case
    when public.age_ans(date_naissance) < 15 then 'en_attente'
    else 'non_requise'
  end::public.autorisation_parentale;
$$;

-- Espace parent en lecture seule, accès par lien magique (§5.1).
create table public.parent_access (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users (id) on delete cascade,
  email_parent   text not null,
  token_hash     text not null unique,
  expires_at     timestamptz,
  dernier_acces  timestamptz,
  created_at     timestamptz not null default now()
);

comment on column public.parent_access.token_hash is
  'sha256 du jeton envoyé par email. Le jeton en clair n''est jamais stocké.';

create index parent_access_user_id_idx on public.parent_access (user_id);

-- ---------------------------------------------------------------------------
-- Référentiel concours
-- ---------------------------------------------------------------------------
create table public.concours (
  id             uuid primary key default gen_random_uuid(),
  nom            text not null unique,
  filiere        public.filiere not null,
  taille_session integer not null default 10 check (taille_session between 1 and 100),
  actif          boolean not null default true,
  created_at     timestamptz not null default now()
);

create table public.epreuves (
  id              uuid primary key default gen_random_uuid(),
  concours_id     uuid not null references public.concours (id) on delete cascade,
  nom             text not null,
  ordre_affichage integer not null default 0,
  created_at      timestamptz not null default now(),
  unique (concours_id, nom)
);

create index epreuves_concours_id_idx on public.epreuves (concours_id, ordre_affichage);

-- §2 : barème officiel appliqué dès la V1, points négatifs compris.
create table public.baremes (
  id                uuid primary key default gen_random_uuid(),
  concours_id       uuid not null references public.concours (id) on delete cascade,
  epreuve_id        uuid references public.epreuves (id) on delete cascade,
  points_bonne      numeric(5, 2) not null,
  points_mauvaise   numeric(5, 2) not null,
  points_abstention numeric(5, 2) not null default 0,
  regle_speciale    text,
  source_officielle text,
  verifie_le        date,
  created_at        timestamptz not null default now(),

  unique nulls not distinct (concours_id, epreuve_id)
);

comment on column public.baremes.epreuve_id is
  'NULL = barème par défaut du concours ; une ligne avec epreuve_id le surcharge.';
comment on column public.baremes.verifie_le is
  'Specs §2 : barèmes à revérifier sur le règlement officiel avant affichage élève.';

-- ---------------------------------------------------------------------------
-- Contenu : annales → blocs → questions → propositions
-- ---------------------------------------------------------------------------
create table public.annales (
  id            uuid primary key default gen_random_uuid(),
  concours_id   uuid not null references public.concours (id) on delete cascade,
  annee         integer not null check (annee between 1990 and 2100),
  statut        public.contenu_statut not null default 'brouillon',
  format_source public.format_source not null,
  created_at    timestamptz not null default now(),
  unique (concours_id, annee)
);

create table public.annale_documents (
  id          uuid primary key default gen_random_uuid(),
  annale_id   uuid not null references public.annales (id) on delete cascade,
  type        public.document_type not null,
  fichier_url text not null,
  created_at  timestamptz not null default now()
);

create index annale_documents_annale_id_idx on public.annale_documents (annale_id);

-- §2.2 : un bloc est tiré entier ou pas du tout, servi dans l'ordre.
create table public.blocs (
  id            uuid primary key default gen_random_uuid(),
  annale_id     uuid not null references public.annales (id) on delete cascade,
  epreuve_id    uuid not null references public.epreuves (id) on delete restrict,
  enonce_commun text,
  image_url     text,
  ordre         integer not null default 0,
  statut        public.contenu_statut not null default 'brouillon',
  created_at    timestamptz not null default now()
);

create index blocs_annale_id_idx  on public.blocs (annale_id, ordre);
create index blocs_epreuve_id_idx on public.blocs (epreuve_id) where statut = 'publie';

-- Corpus documentaire rattaché à un bloc (analyse documentaire SÉSAME, §6.1).
create table public.bloc_documents (
  id          uuid primary key default gen_random_uuid(),
  bloc_id     uuid not null references public.blocs (id) on delete cascade,
  fichier_url text not null,
  titre       text,
  created_at  timestamptz not null default now()
);

create index bloc_documents_bloc_id_idx on public.bloc_documents (bloc_id);

create table public.questions (
  id                     uuid primary key default gen_random_uuid(),
  bloc_id                uuid not null references public.blocs (id) on delete cascade,
  type                   public.question_type not null,
  enonce                 text not null,
  image_url              text,
  explication            text,
  explication_origine    public.explication_origine,
  explication_relue      boolean not null default false,
  chapitre               text not null,                      -- §6.1 : obligatoire
  statut                 public.question_statut not null default 'brouillon',
  statut_extraction      public.statut_extraction not null default 'manuel',
  commentaire_extraction text,
  confiance_extraction   integer check (confiance_extraction between 0 and 100),
  auto_publiee           boolean not null default false,
  origine                public.question_origine not null default 'manuelle',
  question_source_id     uuid references public.questions (id) on delete set null,
  variables              jsonb,                              -- V2
  scenario               text,                               -- V2
  ordre_dans_bloc        integer not null default 0,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint explication_a_une_origine
    check (explication is null or explication_origine is not null)
);

comment on column public.questions.explication_relue is
  '§6.1 : une explication générée par IA n''est jamais servie à un élève tant que
   explication_relue est false. La question reste jouable sans son explication.';
comment on column public.questions.chapitre is
  '§6.1 : chapitre obligatoire — alimente « chapitres à retravailler » (§5.4).';

create index questions_bloc_id_idx  on public.questions (bloc_id, ordre_dans_bloc);
create index questions_statut_idx   on public.questions (statut);
create index questions_chapitre_idx on public.questions (chapitre);
-- File de relecture : questions sous le seuil de confiance (§6.1).
create index questions_relecture_idx on public.questions (confiance_extraction)
  where statut in ('brouillon', 'a_verifier');

create table public.reponses_possibles (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions (id) on delete cascade,
  texte       text not null,
  est_correcte boolean not null default false,
  ordre       integer not null default 0
);

create index reponses_possibles_question_id_idx on public.reponses_possibles (question_id, ordre);

-- ---------------------------------------------------------------------------
-- Jeu : sessions et réponses
-- ---------------------------------------------------------------------------
create table public.sessions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users (id) on delete cascade,
  concours_id     uuid not null references public.concours (id) on delete restrict,
  epreuve_id      uuid not null references public.epreuves (id) on delete restrict,
  mode            public.session_mode not null default 'entrainement',
  points          numeric(7, 2),
  points_max      numeric(7, 2),
  -- §2.4 : score normalisé = points / points_max, plancher 0, pour comparer
  -- des concours dont les barèmes diffèrent.
  score_normalise numeric(4, 3) check (score_normalise between 0 and 1),
  nb_questions    integer not null default 0,
  nb_correctes    integer not null default 0,
  nb_abstentions  integer not null default 0,
  started_at      timestamptz not null default now(),
  completed_at    timestamptz
);

create index sessions_user_id_idx     on public.sessions (user_id, started_at desc);
create index sessions_concours_id_idx on public.sessions (concours_id, epreuve_id);
create index sessions_completed_idx   on public.sessions (completed_at) where completed_at is not null;

create table public.session_questions (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete restrict,
  ordre       integer not null default 0,
  -- Choix unique : {"reponse_id": "..."} ; vrai/faux : {"<reponse_id>": true|false}
  reponse     jsonb,
  statut      public.reponse_statut,
  points      numeric(5, 2),
  answered_at timestamptz,
  unique (session_id, question_id)
);

create index session_questions_session_id_idx  on public.session_questions (session_id, ordre);
-- KPI §6.3 : « taux d'annales réalisées » = questions publiées vues au moins une fois.
create index session_questions_question_id_idx on public.session_questions (question_id);

-- §6.1 : un signalement dépublie immédiatement la question et la met en file.
create table public.signalements (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions (id) on delete cascade,
  user_id     uuid references public.users (id) on delete set null,
  motif       text not null,
  traite      boolean not null default false,
  created_at  timestamptz not null default now()
);

create index signalements_question_id_idx on public.signalements (question_id);
create index signalements_ouverts_idx     on public.signalements (created_at desc) where traite = false;

-- Concours visés à l'inscription (§5.1, multi-sélection).
create table public.user_concours_vises (
  user_id     uuid not null references public.users (id) on delete cascade,
  concours_id uuid not null references public.concours (id) on delete cascade,
  primary key (user_id, concours_id)
);

create index user_concours_vises_concours_id_idx on public.user_concours_vises (concours_id);

-- ---------------------------------------------------------------------------
-- Déclencheurs
-- ---------------------------------------------------------------------------
create function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger questions_touch_updated_at
  before update on public.questions
  for each row execute function public.touch_updated_at();

-- §6.1 : signalement élève → dépublication immédiate, sans attendre l'admin.
create function public.depublier_sur_signalement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.questions
     set statut = 'depubliee'
   where id = new.question_id
     and statut = 'publie';
  return new;
end;
$$;

create trigger signalements_depublient_la_question
  after insert on public.signalements
  for each row execute function public.depublier_sur_signalement();
