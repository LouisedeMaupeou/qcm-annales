-- =============================================================================
-- Les barèmes non vérifiés n'ont pas de source, plutôt qu'une source factice
-- =============================================================================
-- La migration 20260719120200 seedait source_officielle avec le texte
-- « À VÉRIFIER — règlement officiel <concours> ». C'était un avertissement logé
-- dans un champ de données : il satisfaisait le contrôle « on ne date pas une
-- vérification sans source » du back-office, et permettait donc de marquer un
-- barème vérifié sans qu'aucune source réelle n'ait été relevée.
--
-- L'absence de vérification s'exprime par NULL sur les deux colonnes ; c'est
-- verifie_le qui pilote l'affichage, pas une chaîne à interpréter.

update public.baremes
   set source_officielle = null,
       verifie_le = null
 where source_officielle like 'À VÉRIFIER%';
