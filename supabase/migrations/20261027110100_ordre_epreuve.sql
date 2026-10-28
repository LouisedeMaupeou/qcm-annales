-- =============================================================================
-- Ordre d'une question dans son épreuve blanche
-- =============================================================================
-- L'ordre du sujet était reconstruit à la composition d'une épreuve, par
-- `blocs.ordre + questions.ordre_dans_bloc / 100`. Ça marche, mais par
-- coïncidence : l'information d'origine — la colonne `ordre` du format
-- Parkours, « 13.2 = sous-question 2 de la question 13 » — était perdue à
-- l'import et deux grandeurs différentes la remplaçaient.
--
-- Le défaut se voit sur l'analyse documentaire SÉSAME. Ses 29 questions
-- partagent un seul bloc, celui qui porte le corpus de 41 pages : leur partie
-- entière reconstruite vaut 1 pour toutes. Or la règle officielle du concours
-- note la question à trous **en entier** — toutes les cases justes ou zéro
-- (§5.3) — et ce regroupement se lit précisément sur la partie entière de
-- l'ordre du sujet : 13.01 et 13.02 appartiennent à la question 13.
--
-- On conserve donc l'ordre tel que le fichier le donne. La correction de
-- l'étape 13 y lira ses groupes, et la composition d'une épreuve n'a plus à
-- deviner.

alter table public.questions
  add column ordre_epreuve numeric(6, 2);

comment on column public.questions.ordre_epreuve is
  'Colonne `ordre` du format Parkours : position dans l''épreuve blanche, '
  'partie décimale = sous-question. Sa partie entière groupe les cases d''une '
  'question à trous pour la correction tout ou rien (§5.3).';

create index questions_ordre_epreuve_idx
  on public.questions (epreuve_id_externe, ordre_epreuve)
  where epreuve_id_externe is not null;
