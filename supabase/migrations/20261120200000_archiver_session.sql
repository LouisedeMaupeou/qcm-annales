-- =============================================================================
-- Archiver une session de concours blancs
-- =============================================================================
-- Les sessions s'accumulent : une prépa en monte plusieurs par an, et celles
-- des années passées restent utiles — leurs bilans, leurs copies — sans avoir
-- à encombrer les écrans de travail. L'archivage les retire des listes
-- quotidiennes sans rien supprimer.
--
-- Un booléen plutôt qu'une valeur d'énumération supplémentaire : `statut` dit
-- où en est la session dans son déroulé (préparation, ouverte, corrigée), et
-- l'archivage est une question de rangement, pas d'avancement. Une session
-- archivée garde donc son statut, et peut être désarchivée telle quelle.

alter table public.sessions_cb
  add column archivee boolean not null default false;

comment on column public.sessions_cb.archivee is
  'Retirée des listes de travail, sans rien perdre : les bilans, les copies et '
  'les évaluations restent lisibles et la session peut être désarchivée.';

create index sessions_cb_archivee_idx on public.sessions_cb (archivee, created_at desc);
