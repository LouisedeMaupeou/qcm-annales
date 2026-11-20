-- =============================================================================
-- Un élève doit pouvoir constater que son épreuve lui est assignée
-- =============================================================================
-- La politique de lecture de `epreuves_cb` autorise un élève à voir une épreuve
-- publiée assignée à sa cohorte, et le teste ainsi :
--
--   exists (select 1 from epreuve_cb_cohortes ec
--             join users u on u.cohorte_id = ec.cohorte_id
--            where ec.epreuve_cb_id = epreuves_cb.id
--              and u.id = auth.uid())
--
-- Mais une sous-requête écrite dans une politique reste soumise à la RLS de la
-- table qu'elle interroge. Or `epreuve_cb_cohortes` n'était lisible que par le
-- personnel : pour un élève, cette sous-requête ne rendait jamais aucune ligne,
-- le test échouait toujours, et « Mes concours blancs » restait vide quoi qu'on
-- y publie. Aucun élève n'a donc jamais vu une épreuve depuis cet écran.
--
-- La recette de bout en bout ne l'avait pas vu : elle passait par la clé de
-- service, qui contourne la RLS. Un scénario qui joue le rôle d'un élève sans
-- emprunter ses droits ne prouve rien sur ce que l'élève voit.
--
-- On ouvre donc en lecture les seules lignes qui concernent l'élève : celles de
-- sa propre cohorte. Il apprend que sa promotion est convoquée à une épreuve,
-- ce qui est précisément ce que l'écran doit lui dire. Les autres cohortes
-- restent invisibles, et le contenu de l'épreuve — la liste ordonnée de ses
-- questions — reste fermé, servi par le serveur pendant le passage.

create policy epreuve_cb_cohortes_sienne on public.epreuve_cb_cohortes
  for select to authenticated
  using (
    exists (
      select 1
        from public.users u
       where u.id = (select auth.uid())
         and u.cohorte_id = epreuve_cb_cohortes.cohorte_id
    )
  );

comment on table public.epreuve_cb_cohortes is
  'Quelles cohortes composent quelle épreuve blanche. Lisible par le personnel, '
  'et par un élève pour sa seule cohorte — la politique de lecture de '
  'epreuves_cb s''appuie dessus, et une sous-requête de politique subit la RLS '
  'de la table qu''elle interroge.';
