-- =============================================================================
-- Fermer `anon` par défaut, y compris sur les tables à venir
-- =============================================================================
-- La migration 20260719120100 se terminait par
--   revoke all on all tables in schema public from anon;
-- ce qui ne couvre que les tables existant à cet instant. Supabase pose des
-- privilèges par défaut qui rouvrent `anon` sur chaque nouvelle table : le seul
-- rempart d'une table créée plus tard serait sa RLS, et un oubli de politique
-- suffirait à l'exposer publiquement.
--
-- On inverse donc la valeur par défaut : rien pour `anon`, sauf autorisation
-- explicite. Aucun écran ne dépend de `anon` — la landing et les pages légales
-- sont statiques, et le formulaire d'inscription lit les concours côté serveur.

alter default privileges in schema public
  revoke all on tables from anon;

alter default privileges in schema public
  revoke all on sequences from anon;

alter default privileges in schema public
  revoke all on functions from anon;

-- Remise à plat de l'existant, y compris les tables créées après la migration
-- initiale (parametres).
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
