-- =============================================================================
-- Row Level Security par rôle (specs §9 : élève / parent lecture seule / admin)
-- =============================================================================
-- Principe de base : RLS activé partout, aucune politique permissive par
-- défaut. Ce qui n'est pas explicitement autorisé ci-dessous est refusé.
--
-- ⚠️ Décision de sécurité importante — les élèves n'ont AUCUN accès direct en
-- lecture aux tables `questions` et `reponses_possibles`. La colonne
-- `reponses_possibles.est_correcte` contient la bonne réponse : exposée via
-- PostgREST, n'importe quel élève lirait le corrigé avant de répondre en
-- interrogeant l'API avec son propre jeton. Le contenu jouable est donc servi
-- exclusivement par des routes serveur qui retirent `est_correcte` et
-- l'explication non relue avant l'envoi (cf. §5.3, étape 6 du plan §12).
-- Même raisonnement pour `explication` : §6.1 interdit d'afficher une
-- explication générée non relue.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helpers — SECURITY DEFINER pour lire public.users sans déclencher la RLS de
-- public.users depuis les politiques des autres tables (récursion infinie).
-- ---------------------------------------------------------------------------
create function public.auth_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select u.role from public.users u where u.id = (select auth.uid());
$$;

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.auth_role() = 'admin', false);
$$;

-- Admin ou contributeur : accès au back-office contenu (§4).
create function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.auth_role() in ('admin', 'contributeur'), false);
$$;

revoke execute on function public.auth_role(), public.is_admin(), public.is_staff() from public;
grant  execute on function public.auth_role(), public.is_admin(), public.is_staff() to authenticated;

-- ---------------------------------------------------------------------------
-- Activation
-- ---------------------------------------------------------------------------
alter table public.users               enable row level security;
alter table public.parent_access       enable row level security;
alter table public.user_concours_vises enable row level security;
alter table public.concours            enable row level security;
alter table public.epreuves            enable row level security;
alter table public.baremes             enable row level security;
alter table public.annales             enable row level security;
alter table public.annale_documents    enable row level security;
alter table public.blocs               enable row level security;
alter table public.bloc_documents      enable row level security;
alter table public.questions           enable row level security;
alter table public.reponses_possibles  enable row level security;
alter table public.sessions            enable row level security;
alter table public.session_questions   enable row level security;
alter table public.signalements        enable row level security;

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
create policy users_select_self on public.users
  for select to authenticated
  using (id = (select auth.uid()));

create policy users_update_self on public.users
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy users_admin_all on public.users
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Un élève ne doit pas pouvoir se promouvoir admin en modifiant sa propre ligne.
-- Les colonnes sensibles sont verrouillées au niveau des privilèges de colonne.
revoke update on public.users from authenticated;
grant  update (nom, prenom, ville, etablissement, email_parent,
               consent_marketing, consent_marketing_date)
  on public.users to authenticated;

-- ---------------------------------------------------------------------------
-- parent_access
-- ---------------------------------------------------------------------------
-- L'espace parent n'est pas un compte authentifié : le parent arrive avec un
-- jeton dans l'URL. La validation du jeton et la lecture de la progression se
-- font côté serveur (service_role), qui contourne la RLS. Ici on n'ouvre donc
-- rien à `anon`, et l'élève peut seulement constater que l'accès existe.
create policy parent_access_select_own on public.parent_access
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy parent_access_admin_all on public.parent_access
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Le hash du jeton ne sort jamais, même pour l'élève propriétaire.
revoke select on public.parent_access from authenticated;
grant  select (id, user_id, email_parent, expires_at, dernier_acces, created_at)
  on public.parent_access to authenticated;

-- ---------------------------------------------------------------------------
-- user_concours_vises
-- ---------------------------------------------------------------------------
create policy ucv_own on public.user_concours_vises
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy ucv_admin_all on public.user_concours_vises
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Référentiel : lisible par tout utilisateur connecté, écriture staff
-- ---------------------------------------------------------------------------
create policy concours_select_actifs on public.concours
  for select to authenticated
  using (actif or public.is_staff());

create policy concours_staff_write on public.concours
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy epreuves_select on public.epreuves
  for select to authenticated
  using (true);

create policy epreuves_staff_write on public.epreuves
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- Le barème est affiché à l'élève en fin de session (§5.3.4) : lecture ouverte.
create policy baremes_select on public.baremes
  for select to authenticated
  using (true);

create policy baremes_admin_write on public.baremes
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Contenu : réservé au staff (cf. avertissement en tête de fichier)
-- ---------------------------------------------------------------------------
create policy annales_staff_all on public.annales
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy annale_documents_staff_all on public.annale_documents
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy blocs_staff_all on public.blocs
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy bloc_documents_staff_all on public.bloc_documents
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy questions_staff_all on public.questions
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy reponses_possibles_staff_all on public.reponses_possibles
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- sessions / session_questions
-- ---------------------------------------------------------------------------
create policy sessions_own on public.sessions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy sessions_admin_read on public.sessions
  for select to authenticated
  using (public.is_admin());

create policy session_questions_own on public.session_questions
  for all to authenticated
  using (exists (
    select 1 from public.sessions s
     where s.id = session_questions.session_id
       and s.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.sessions s
     where s.id = session_questions.session_id
       and s.user_id = (select auth.uid())
  ));

create policy session_questions_admin_read on public.session_questions
  for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- signalements
-- ---------------------------------------------------------------------------
create policy signalements_insert_own on public.signalements
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy signalements_select_own on public.signalements
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy signalements_staff_all on public.signalements
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- Rien pour `anon` : la landing page et les pages légales sont statiques,
-- aucune table n'est lisible sans authentification.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
