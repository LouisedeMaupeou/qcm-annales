-- =============================================================================
-- Reprises d'épreuves blanches, après le bilan
-- =============================================================================
-- Une fois son bilan reçu, l'élève peut relire sa copie corrigée et refaire
-- l'épreuve autant de fois qu'il le souhaite, avec le corrigé à la fin. C'est
-- de l'entraînement : une reprise ne doit jamais toucher la note, le rang ou le
-- bilan de la session.
--
-- D'où deux tables à part plutôt qu'une ligne de plus dans `passages` :
-- `passages` est unique par (épreuve, élève) — c'est la tentative officielle
-- du §4.3 — et tout ce qui calcule un rang, une moyenne ou un bilan le lit
-- sans filtre. Une reprise qui s'y glisserait fausserait le classement de
-- toute la promotion.
--
-- Les réponses ont leur propre table, comme celles des copies : une réponse
-- par ligne, écrite à chaque geste. Un seul objet JSON réécrit en entier à
-- chaque clic perdrait la réponse précédente quand deux sauvegardes se
-- croisent.
--
-- Aucune politique élève : comme pendant le passage officiel, c'est le
-- serveur qui sert les questions, enregistre les réponses et corrige. Il
-- revérifie à chaque appel que le bilan de la session a bien été envoyé.

create table public.reprises_cb (
  id             uuid primary key default gen_random_uuid(),
  epreuve_cb_id  uuid not null references public.epreuves_cb (id) on delete cascade,
  user_id        uuid not null references public.users (id) on delete cascade,
  started_at     timestamptz not null default now(),
  -- Nulle tant que l'élève compose ; posée une fois, la reprise est close.
  remis_at       timestamptz,
  note_sur_20    numeric(5, 2),
  nb_bonnes      integer,
  nb_fausses     integer,
  nb_abstentions integer
);

comment on table public.reprises_cb is
  'Reprise d''une épreuve blanche après envoi du bilan : entraînement, sans '
  'effet sur la note, le rang ni le bilan. Autant de reprises que voulu.';

create index reprises_cb_eleve_idx on public.reprises_cb (user_id, epreuve_cb_id, started_at desc);

create table public.reprise_reponses (
  reprise_id  uuid not null references public.reprises_cb (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  reponse     jsonb,
  primary key (reprise_id, question_id)
);

alter table public.reprises_cb      enable row level security;
alter table public.reprise_reponses enable row level security;

-- L'équipe peut voir qui s'entraîne ; personne n'écrit par l'API.
create policy reprises_cb_staff_lecture on public.reprises_cb
  for select to authenticated using (public.is_staff());
create policy reprise_reponses_staff_lecture on public.reprise_reponses
  for select to authenticated using (public.is_staff());
