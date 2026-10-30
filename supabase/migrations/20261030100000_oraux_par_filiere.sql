-- =============================================================================
-- Oraux blancs : épreuves par filière, grilles Parkours, retours du jury
-- =============================================================================
-- Rectificatif de 20261028130100, qui était déjà appliquée : on ne modifie pas
-- une migration passée, on en écrit une autre. La version initiale rattachait
-- une épreuve orale à un concours et ne portait que deux champs de retour.
--
-- Ce que la grille Parkours impose en réalité :
--   * les épreuves se définissent par filière, pas par concours — commerce
--     passe quatre oraux, ingénieur le seul oral de personnalité ;
--   * chaque épreuve a une pondération dans la note globale d'oral ;
--   * le jury renseigne un contexte en tête de grille, puis trois retours
--     libres : point fort, progrès prioritaire, commentaire du jury.
--
-- Les deux tables sont vides à cette date : aucune donnée à reprendre.

-- --- Épreuves ---------------------------------------------------------------
alter table public.epreuves_orales
  add column filiere     public.filiere,
  add column cle         text,
  add column ponderation numeric(4, 3) not null default 0,
  add column contexte    text;

-- Le concours ne détermine plus l'épreuve orale : c'est la filière.
alter table public.epreuves_orales
  drop constraint if exists epreuves_orales_session_cb_id_concours_id_nom_key;
alter table public.epreuves_orales
  drop column concours_id;

alter table public.epreuves_orales
  alter column filiere set not null,
  alter column cle set not null;

alter table public.epreuves_orales
  add constraint epreuves_orales_ponderation_valide
    check (ponderation >= 0 and ponderation <= 1);

alter table public.epreuves_orales
  add constraint epreuves_orales_filiere_cle_unique
    unique (session_cb_id, filiere, cle);

comment on column public.epreuves_orales.ponderation is
  'Poids dans la note globale d''oral. 0 = épreuve passée et notée mais hors '
  'moyenne : c''est le cas de l''oral collectif, atelier d''entraînement que '
  'l''IESEG n''annonce pas dans ses oraux.';
comment on column public.epreuves_orales.contexte is
  'Intitulé du champ que le jury renseigne en tête de grille : sujet du '
  'collectif, école visée, référence du visuel, support anglais.';

-- --- Évaluations ------------------------------------------------------------
alter table public.evaluations_orales
  add column contexte            text,
  add column note                numeric(5, 2),
  add column point_fort          text,
  add column progres_prioritaire text,
  add column commentaire_jury    text;

-- `note_globale` devient `note` : une évaluation porte la note d'une épreuve,
-- la note globale est la moyenne pondérée des épreuves, calculée au bilan.
alter table public.evaluations_orales drop column note_globale;
-- `appreciation` et `recommandation` sont remplacées par les trois champs du
-- référentiel, qui ne recouvrent pas les mêmes retours.
alter table public.evaluations_orales drop column appreciation;
alter table public.evaluations_orales drop column recommandation;

comment on column public.evaluations_orales.note is
  'Total des points de la grille, sur 20. Recalculé à chaque enregistrement '
  'par le serveur, jamais repris du formulaire.';

-- --- Critères de grille -----------------------------------------------------
comment on column public.grilles_oral.criteres is
  'Critères de la grille : [{libelle, maximum, indicateur}]. La somme des '
  'maxima fait 20, la note de l''épreuve est donc le total des points.';
