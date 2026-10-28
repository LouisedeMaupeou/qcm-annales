-- =============================================================================
-- Nouveau rôle : responsable_prepa (module concours blancs, §5)
-- =============================================================================
-- Seul contenu de cette migration : l'ajout de la valeur à l'énumération.
-- PostgreSQL autorise `alter type ... add value` dans une transaction, mais
-- interdit d'*utiliser* la valeur ajoutée avant que celle-ci soit validée.
-- Les politiques et les fonctions qui s'en servent vivent donc dans la
-- migration suivante, qui s'exécute dans sa propre transaction.

alter type public.user_role add value if not exists 'responsable_prepa';
