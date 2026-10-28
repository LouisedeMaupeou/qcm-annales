-- =============================================================================
-- Banque de questions des concours blancs (module concours blancs, §3 et §6)
-- =============================================================================
-- Les questions des concours blancs entrent dans la table `questions` du
-- socle : c'est ce que demande le §6 du module (« questions — colonnes
-- ajoutées »), et c'est ce qui permet de réutiliser la file de relecture, les
-- propositions et la correction automatique sans les réécrire.
--
-- Reste un problème de rattachement. Une question du socle descend d'un bloc,
-- qui descend d'une annale, qui porte un couple concours × année unique. Une
-- épreuve blanche n'est pas une annale : il y en a plusieurs par concours et
-- par an (Toussaint, Noël), et elle n'a pas vocation à être jouée en
-- entraînement libre. On rend donc `blocs.annale_id` facultatif et on ajoute
-- `blocs.epreuve_id_externe` : un bloc appartient soit à une annale, soit à une
-- épreuve blanche, jamais aux deux.
--
-- ⚠️ Conséquence à ne pas perdre de vue : le tirage de l'entraînement libre
-- sélectionne les blocs par épreuve et par statut, sans passer par l'annale.
-- Sans filtre explicite, les sujets de concours blancs apparaîtraient côté
-- public — c'est-à-dire avant que les élèves de la prépa ne composent. Les
-- trois requêtes concernées écartent désormais les blocs sans annale, et le
-- trigger de statut ci-dessous ne publie jamais un bloc de concours blanc.

create type public.source_import as enum ('xml_moodle', 'xlsx', 'csv', 'manuel');

-- ---------------------------------------------------------------------------
-- Blocs : annale ou épreuve blanche
-- ---------------------------------------------------------------------------
alter table public.blocs
  alter column annale_id drop not null;

alter table public.blocs
  add column epreuve_id_externe text,
  -- Identité stable du bloc dans le fichier d'import : réimporter le même
  -- fichier doit mettre à jour le bloc, pas en créer un second.
  add column bloc_id_externe text unique;

comment on column public.blocs.epreuve_id_externe is
  'Épreuve blanche d''origine (ex. AV-MAT-TOUS26). Exclusif avec annale_id.';
comment on column public.blocs.bloc_id_externe is
  'Clé de rapprochement du bloc à l''import (colonne bloc_id du format Parkours).';

alter table public.blocs
  add constraint bloc_annale_ou_epreuve_blanche
  check ((annale_id is not null) <> (epreuve_id_externe is not null));

create index blocs_epreuve_externe_idx on public.blocs (epreuve_id_externe)
  where epreuve_id_externe is not null;

-- ---------------------------------------------------------------------------
-- Épreuves : certaines n'existent que pour les concours blancs
-- ---------------------------------------------------------------------------
-- L'import rattache ses blocs à une épreuve du référentiel, et crée celles qui
-- manquent (« SÉSAME / Analyse documentaire », « SÉSAME / LV2 Allemand »…).
-- La page publique d'un concours liste *toutes* ses épreuves, y compris vides :
-- sans ce drapeau, l'entraînement libre afficherait une dizaine d'épreuves à
-- « 0 question » qui ne le concernent pas.
alter table public.epreuves
  add column visible_public boolean not null default true;

comment on column public.epreuves.visible_public is
  'false = épreuve créée pour les concours blancs, masquée de l''entraînement libre.';

-- ---------------------------------------------------------------------------
-- Questions : métadonnées du référentiel pédagogique
-- ---------------------------------------------------------------------------
alter table public.questions
  add column id_question_externe text unique,
  add column epreuve_id_externe  text,
  add column auto_correction     boolean not null default true,
  add column retroaction_ciblee  text,
  add column retroaction_complete text,
  add column sous_chapitre       text,
  add column notions             text,
  add column travail_a_realiser  text,
  add column critere_maitrise    text,
  add column points_defaut       numeric(5, 2) not null default 1,
  add column source_import       public.source_import,
  add column fichier_source      text;

comment on column public.questions.id_question_externe is
  'Identifiant stable du référentiel (ex. AV-MAT-TOUS26-12) : clé de '
  'rapprochement et de mise à jour à l''import (§3).';
comment on column public.questions.auto_correction is
  'false = file de correction manuelle (épreuves rédigées, §5.3).';
comment on column public.questions.points_defaut is
  'Pondération portée par l''import ; recopiée dans epreuve_cb_questions.';

create index questions_epreuve_externe_idx on public.questions (epreuve_id_externe)
  where epreuve_id_externe is not null;
create index questions_correction_manuelle_idx on public.questions (auto_correction)
  where auto_correction = false;

-- ---------------------------------------------------------------------------
-- Statut dérivé : ne jamais publier un bloc de concours blanc
-- ---------------------------------------------------------------------------
-- Un bloc « publié » est un bloc tirable en entraînement libre. Un sujet de
-- concours blanc ne doit pas l'être : il est servi par le module Prépa, à
-- partir de epreuve_cb_questions, pendant la fenêtre de passage seulement.
-- Le statut de ses questions continue de vivre sa vie (relecture, publication),
-- celui de son bloc reste « brouillon ».
create or replace function public.synchroniser_statut_bloc()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cible uuid;
  toutes_publiees boolean;
  concours_blanc boolean;
begin
  cible := coalesce(new.bloc_id, old.bloc_id);
  if cible is null then
    return null;
  end if;

  select b.annale_id is null into concours_blanc
    from public.blocs b where b.id = cible;
  if concours_blanc then
    return null;
  end if;

  select count(*) > 0 and bool_and(q.statut = 'publie')
    into toutes_publiees
    from public.questions q
   where q.bloc_id = cible;

  update public.blocs
     set statut = (case when toutes_publiees then 'publie' else 'brouillon' end)::public.contenu_statut
   where id = cible
     and statut <> 'archive'
     and statut <> (case when toutes_publiees then 'publie' else 'brouillon' end)::public.contenu_statut;

  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Stockage des images de sujets
-- ---------------------------------------------------------------------------
-- Les sujets SÉSAME sont découpés en captures : l'énoncé *est* l'image. Elles
-- doivent donc être servies à l'élève pendant son passage, contrairement aux
-- PDF d'annales qui ne sortent jamais du back-office. Bucket privé tout de
-- même : l'accès passe par une URL signée, et l'embargo du §4 interdit de
-- laisser deviner un sujet avant sa fenêtre.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'concours-blancs',
  'concours-blancs',
  false,
  10485760,                       -- 10 Mo par image
  array['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;

create policy cb_staff_lecture on storage.objects
  for select to authenticated
  using (bucket_id = 'concours-blancs' and public.is_staff());

create policy cb_staff_ecriture on storage.objects
  for insert to authenticated
  with check (bucket_id = 'concours-blancs' and public.is_staff());

create policy cb_staff_maj on storage.objects
  for update to authenticated
  using (bucket_id = 'concours-blancs' and public.is_staff())
  with check (bucket_id = 'concours-blancs' and public.is_staff());

create policy cb_staff_suppression on storage.objects
  for delete to authenticated
  using (bucket_id = 'concours-blancs' and public.is_staff());
