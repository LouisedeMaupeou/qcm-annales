-- =============================================================================
-- Référentiel pédagogique : la méthode, et le retour propre à chaque réponse
-- =============================================================================
-- Le bilan doit dire à l'élève ce qui n'allait pas dans sa copie : dans quel
-- domaine, quel chapitre, quelle notion, quelle erreur, et comment la
-- corriger. Le référentiel SÉSAME porte tout cela, mais la banque n'en gardait
-- que le chapitre, la notion et une correction générale. Deux informations
-- manquaient et n'avaient nulle part où aller :
--
-- * la méthode de résolution, étape par étape — distincte du « travail à
--   réaliser » (l'exercice de transfert), qui dit quoi refaire et non comment
--   s'y prendre ;
-- * le retour propre à chaque proposition. C'est lui qui nomme l'erreur
--   commise : « oublie toutes les solutions x < −1 » n'a de sens que pour
--   l'élève qui a coché cette réponse-là.
--
-- `reponses_possibles` reste fermée aux élèves (RLS du socle) : le retour d'une
-- proposition dit si elle est juste, il ne doit pas pouvoir se lire pendant
-- une épreuve. Il n'est servi qu'après coup, par le serveur.

alter table public.questions
  add column methode text;

comment on column public.questions.methode is
  'Méthode de résolution, étape par étape (référentiel : « Méthode de '
  'résolution (étapes) »). Affichée dans le bilan avec l''erreur commise.';

alter table public.reponses_possibles
  add column retroaction text;

comment on column public.reponses_possibles.retroaction is
  'Retour propre à cette proposition (référentiel : « Feedback réponse X ») : '
  'pour une réponse fausse, il nomme l''erreur commise par l''élève qui l''a '
  'cochée. Jamais servi pendant une épreuve.';
