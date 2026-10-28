-- =============================================================================
-- Rôle professeur (module concours blancs, §5.5)
-- =============================================================================
-- Seul dans son fichier : une valeur ajoutée à une énumération ne peut pas
-- être utilisée dans la transaction qui l'ajoute. La migration suivante s'en
-- sert, elle doit donc s'exécuter après celle-ci.
--
-- Le professeur évalue les oraux et rien d'autre : pas de banque de questions,
-- pas de fiches élèves, pas de réglages. C'est ce qui justifie un rôle
-- distinct plutôt qu'un compte admin partagé — le §5.5 pose le choix, et sans
-- rôle propre une évaluation ne peut pas être signée de son auteur.

alter type public.user_role add value if not exists 'professeur';
