-- =============================================================================
-- Dépôts de sujets à extraire (module concours blancs, §3)
-- =============================================================================
-- L'import de questions attend un CSV au format Parkours et un zip d'images.
-- Avant d'en arriver là, il faut partir des sujets eux-mêmes : des PDF, parfois
-- scannés, accompagnés d'un tableur de réponses. Cette table garde la trace de
-- ces dépôts et de leur avancement, au lieu de laisser les fichiers circuler
-- par email et dossiers de téléchargement.
--
-- Pourquoi un bucket distinct de `concours-blancs` : celui-ci sert les figures
-- aux élèves pendant une épreuve, avec un plafond de 10 Mo par image et une
-- liste de types restreinte. Un sujet scanné pèse davantage et un tableur n'est
-- pas une image — mélanger les deux obligerait à relâcher les limites qui
-- protègent le premier.

create type public.statut_depot as enum (
  'depose', 'en_cours', 'livre', 'importe', 'abandonne'
);

create table public.depots_extraction (
  id           uuid primary key default gen_random_uuid(),
  libelle      text not null,
  consigne     text,
  statut       public.statut_depot not null default 'depose',
  note_suivi   text,
  depose_par   uuid references public.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.depots_extraction is
  'Un dépôt = un lot de sujets à transcrire, avec son tableur de réponses.';
comment on column public.depots_extraction.consigne is
  'Ce que le dépositaire attend : épreuves concernées, pages à ignorer, '
  'particularités du barème.';
comment on column public.depots_extraction.note_suivi is
  'Retour de la personne qui extrait : ce qui a été livré, ce qui bloque.';

create index depots_extraction_statut_idx on public.depots_extraction (statut, created_at desc);

create trigger depots_extraction_touch
  before update on public.depots_extraction
  for each row execute function public.touch_updated_at();

create type public.role_fichier_depot as enum ('sujet', 'reponses', 'autre');

create table public.depot_fichiers (
  id         uuid primary key default gen_random_uuid(),
  depot_id   uuid not null references public.depots_extraction (id) on delete cascade,
  chemin     text not null unique,
  nom        text not null,
  role       public.role_fichier_depot not null default 'autre',
  taille     bigint,
  televerse  boolean not null default false,
  created_at timestamptz not null default now()
);

comment on column public.depot_fichiers.televerse is
  'Faux jusqu''à ce que le serveur ait constaté le fichier dans le stockage. '
  'Le téléversement se fait du navigateur vers le stockage, sans passer par '
  'une fonction serveur dont le corps est plafonné : on ne croit donc pas le '
  'client sur parole, on va vérifier.';

create index depot_fichiers_depot_idx on public.depot_fichiers (depot_id);

-- ---------------------------------------------------------------------------
-- Stockage
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'depots-cb',
  'depots-cb',
  false,
  104857600,                      -- 100 Mo : un sujet scanné est volumineux
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv',
    'application/zip',
    'application/x-zip-compressed',
    'image/png',
    'image/jpeg'
  ]
)
on conflict (id) do nothing;

create policy depots_prepa_lecture on storage.objects
  for select to authenticated
  using (bucket_id = 'depots-cb' and public.is_prepa());

create policy depots_prepa_ecriture on storage.objects
  for insert to authenticated
  with check (bucket_id = 'depots-cb' and public.is_prepa());

create policy depots_prepa_maj on storage.objects
  for update to authenticated
  using (bucket_id = 'depots-cb' and public.is_prepa())
  with check (bucket_id = 'depots-cb' and public.is_prepa());

create policy depots_prepa_suppression on storage.objects
  for delete to authenticated
  using (bucket_id = 'depots-cb' and public.is_prepa());

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.depots_extraction enable row level security;
alter table public.depot_fichiers    enable row level security;

create policy depots_extraction_prepa on public.depots_extraction
  for all to authenticated
  using (public.is_prepa()) with check (public.is_prepa());

create policy depot_fichiers_prepa on public.depot_fichiers
  for all to authenticated
  using (public.is_prepa()) with check (public.is_prepa());
