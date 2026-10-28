-- =============================================================================
-- Bilans de session (module concours blancs, §5.4 et §6)
-- =============================================================================
-- Un bilan par élève et par session. Les chiffres n'y sont pas stockés : ils
-- se recalculent depuis les passages, qui font foi. Ce qui est stocké, c'est
-- ce qu'un humain a écrit ou modifié — les textes relus par la responsable —
-- plus l'état d'avancement et la trace des envois.
--
-- Pourquoi ne pas figer les chiffres : une clé corrigée en relecture change
-- une note, et un bilan qui garderait l'ancienne mentirait sans que personne
-- ne le voie. Le prix à payer est qu'un bilan déjà envoyé peut se recalculer
-- différemment ; c'est le journal des modifications qui permet de le
-- constater.

create type public.statut_bilan as enum (
  'genere', 'en_relecture', 'valide', 'envoye'
);

-- ⚠ Aucun commentaire à l'intérieur du create table ci-dessous.
-- Le découpeur de requêtes du CLI Supabase perd le fil sur une apostrophe ou
-- un guillemet rencontré dans un commentaire interne à une requête : il coupe
-- la requête à cet endroit, et Postgres reçoit un create table amputé. C'est
-- ce qui a fait échouer cette migration — « syntax error at or near analyse ».
-- Les explications vivent donc ici, et la documentation durable dans les
-- `comment on column` placés après la requête.
create table public.bilans (
  id               uuid primary key default gen_random_uuid(),
  session_cb_id    uuid not null references public.sessions_cb (id) on delete cascade,
  user_id          uuid not null references public.users (id) on delete cascade,
  statut           public.statut_bilan not null default 'genere',
  en_quelques_mots text,
  analyse          jsonb not null default '{}'::jsonb,
  priorites        jsonb not null default '[]'::jsonb,
  pdf_url          text,
  valide_par       uuid references public.users (id) on delete set null,
  valide_le        timestamptz,
  envoye_le        timestamptz,
  destinataires    jsonb not null default '[]'::jsonb,
  log_envoi        jsonb not null default '[]'::jsonb,

  genere_le        timestamptz not null default now(),
  maj_le           timestamptz not null default now(),

  unique (session_cb_id, user_id)
);

comment on column public.bilans.en_quelques_mots is
  'Encadré « En quelques mots » du modèle V10 : deux phrases, pré-remplies à '
  'la génération puis reformulées par la responsable (§5.4).';
comment on column public.bilans.analyse is
  'Textes par épreuve (forces, points d''amélioration, méthode, conseils de '
  'reprise), indexés par epreuve_cb_id. Aucun chiffre : les notes, moyennes '
  'et rangs se recalculent depuis les passages à chaque lecture.';
comment on column public.bilans.priorites is
  'Top 3 des chapitres à travailler, tel que la responsable l''a laissé. '
  'Vide = on sert le calcul automatique (§5.4).';

create index bilans_session_idx on public.bilans (session_cb_id, statut);
create index bilans_user_idx    on public.bilans (user_id);

-- `touch_updated_at` du socle écrit dans `updated_at` ; la colonne s'appelle
-- ici `maj_le`, d'où ce jumeau.
create function public.touch_maj_le()
returns trigger
language plpgsql
as $$
begin
  new.maj_le := now();
  return new;
end;
$$;

create trigger bilans_touch_maj
  before update on public.bilans
  for each row execute function public.touch_maj_le();

-- ---------------------------------------------------------------------------
-- Journal des modifications (§5.4)
-- ---------------------------------------------------------------------------
-- « Je relis chaque bilan généré : les chiffres sont calculés, je reformule
-- les textes, je valide. » Savoir qui a écrit quoi est nécessaire quand un
-- parent conteste une appréciation.
create table public.bilan_journal (
  id         uuid primary key default gen_random_uuid(),
  bilan_id   uuid not null references public.bilans (id) on delete cascade,
  auteur_id  uuid references public.users (id) on delete set null,
  champ      text not null,
  avant      text,
  apres      text,
  le         timestamptz not null default now()
);

create index bilan_journal_bilan_idx on public.bilan_journal (bilan_id, le desc);

-- ---------------------------------------------------------------------------
-- Seuils de classement des chapitres (§5.4, « restent configurables »)
-- ---------------------------------------------------------------------------
insert into public.parametres (cle, valeur, description) values
  (
    'seuil_chapitre_maitrise',
    '75',
    'Taux de réussite (%) à partir duquel un chapitre est « Maîtrisé » (§5.4).'
  ),
  (
    'seuil_chapitre_consolider',
    '40',
    'Taux de réussite (%) à partir duquel un chapitre est « À consolider » ; '
    'en dessous, « Insuffisant » (§5.4).'
  ),
  (
    'erreurs_priorite_chapitre',
    '4',
    'Nombre d''erreurs à partir duquel un chapitre peut entrer dans le top 3 '
    '« À travailler en priorité » (§5.4, règle du modèle).'
  )
on conflict (cle) do nothing;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.bilans        enable row level security;
alter table public.bilan_journal enable row level security;

-- §6 : « un élève ne lit que son bilan à l'état envoyé » — l'embargo est une
-- règle serveur, pas un masquage d'interface (§7.3).
create policy bilans_sien_envoye on public.bilans
  for select to authenticated
  using (user_id = (select auth.uid()) and statut = 'envoye');

create policy bilans_prepa on public.bilans
  for all to authenticated
  using (public.is_prepa())
  with check (public.is_prepa());

create policy bilan_journal_prepa on public.bilan_journal
  for all to authenticated
  using (public.is_prepa())
  with check (public.is_prepa());
