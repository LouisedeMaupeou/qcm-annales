-- =============================================================================
-- Paramètres d'exploitation (§6.1 : seuil de confiance « configurable »)
-- =============================================================================

create table public.parametres (
  cle         text primary key,
  valeur      text not null,
  description text,
  maj_le      timestamptz not null default now()
);

alter table public.parametres enable row level security;

create policy parametres_lecture_staff on public.parametres
  for select to authenticated
  using (public.is_staff());

create policy parametres_ecriture_admin on public.parametres
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

insert into public.parametres (cle, valeur, description) values
  (
    'seuil_confiance',
    '90',
    'Indice de confiance d''extraction (0-100) à partir duquel une question est '
    'publiée automatiquement. En dessous, elle entre en file de relecture et ne '
    'peut être publiée sans validation humaine (§6.1).'
  )
on conflict (cle) do nothing;

-- ---------------------------------------------------------------------------
-- Traçabilité de la relecture
-- ---------------------------------------------------------------------------
-- §6.1 : la file de relecture porte des décisions humaines. Savoir qui a validé
-- quoi et quand est nécessaire pour rouvrir un dossier après un signalement.
alter table public.questions
  add column relue_par uuid references public.users (id) on delete set null,
  add column relue_le  timestamptz;

comment on column public.questions.relue_par is
  'Dernier membre du back-office ayant validé ou rejeté la question en relecture.';
