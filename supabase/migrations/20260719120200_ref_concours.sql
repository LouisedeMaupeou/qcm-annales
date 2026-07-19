-- =============================================================================
-- Référentiel concours (specs §2)
-- =============================================================================
-- Données de référence, donc migration et non supabase/seed.sql : les 6 concours
-- doivent exister en production comme en local, et seed.sql n'est joué que par
-- `supabase db reset` en local. Idempotent (ON CONFLICT DO NOTHING).
--
-- ⚠️ Les barèmes ci-dessous sont repris du tableau §2 des specs, qui porte
-- lui-même l'avertissement : « Barèmes exacts (notamment Avenir) à vérifier sur
-- le règlement officiel de la session concernée avant affichage aux élèves ».
-- Tous sont donc seedés avec source_officielle ET verifie_le à NULL : l'absence
-- de vérification s'exprime par NULL, jamais par un texte d'avertissement logé
-- dans un champ de données. Le back-office (§6.1) doit
-- refuser d'afficher un barème non vérifié, ou l'afficher comme provisoire.
--
-- Les épreuves ne sont pas seedées : les specs ne les énumèrent pas. Elles
-- arrivent à l'étape 4 du §12, avec l'annale ACCÈS 2025 du POC.
-- =============================================================================

insert into public.concours (nom, filiere, taille_session, actif) values
  ('ACCÈS',           'commerce',  10, true),
  ('SÉSAME',          'commerce',  20, true),   -- §2 : session de 20
  ('Avenir',          'ingenieur', 10, true),
  ('Advance',         'ingenieur', 10, true),
  ('Puissance Alpha', 'ingenieur', 10, true),
  ('GEIPI Polytech',  'ingenieur', 10, true)
on conflict (nom) do nothing;

insert into public.baremes
  (concours_id, epreuve_id, points_bonne, points_mauvaise, points_abstention,
   regle_speciale, source_officielle, verifie_le)
select c.id, null, b.bonne, b.mauvaise, b.abstention, b.regle, b.source, null
from public.concours c
join (values
  ('ACCÈS',            1.0, -1.0, 0.0,
   'Vrai/faux par proposition : 1 énoncé = 4 propositions, scoring tout ou rien (§2.3).',
   null),
  ('SÉSAME',           1.0,  0.0, 0.0,
   'Pas de points négatifs.',
   null),
  ('Avenir',           1.0, -1.0, 0.0,
   'Specs §2 : barème explicitement signalé comme à vérifier.',
   null),
  ('Advance',          2.0, -0.5, 0.0,
   null,
   null),
  ('Puissance Alpha',  1.0, -0.5, 0.0,
   'Sciences : vrai/faux par affirmation, 1 exercice = 4 V/F. Anglais : choix unique.',
   null),
  ('GEIPI Polytech',   1.0,  0.0, 0.0,
   'Pas de points négatifs.',
   null)
) as b(nom, bonne, mauvaise, abstention, regle, source)
  on b.nom = c.nom
on conflict (concours_id, epreuve_id) do nothing;
