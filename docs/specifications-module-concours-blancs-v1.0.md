# Module Concours Blancs (Prépa Parkours) — Spécifications

**Version 1.0 — Octobre 2026 · complément aux spécifications plateforme v1.2 (qui restent la référence du socle)**
**Objet : admissible.parkours.fr devient aussi la plateforme de concours blancs de la prépa Parkours — passage en ligne, correction automatisée, bilan au format Parkours V10 relu par la responsable des prépas, envoyé aux parents et élèves par email et consultable via le login candidat.**

---

## 1. Vision et périmètre

Le module remplace la chaîne actuelle : quiz Moodle → export CSV de notes → rapprochement Google Sheets (référentiel pédagogique) → mise en forme manuelle du bilan → envoi email. Tout se fait désormais sur le site : les élèves de la prépa composent en ligne, la correction est automatisée (avec file de correction manuelle pour les questions qui l'exigent), le bilan est généré au format officiel Parkours V10, relu et validé par la responsable des prépas, puis envoyé aux parents et élèves et publié dans l'espace candidat.

**Hors périmètre du module** : les épreuves rédactionnelles corrigées (synthèse ACCÈS, exercices rédigés GEIPI) restent en V2 ; la prise de RDV de restitution reste hors site (SMS/agenda actuels).

---

## 2. Concepts et vocabulaire

| Concept | Définition |
|---|---|
| **Cohorte** | Groupe d'élèves de la prépa (ex. « Prépa Ingénieurs 2026-2027 », « Prépa Commerce 2026-2027 »). Un élève appartient à 0 ou 1 cohorte. |
| **Élève Parkours** | Compte élève standard (même login/mot de passe que le site public) rattaché à une cohorte. Conserve l'accès à l'entraînement libre. |
| **Session de concours blancs** | Campagne regroupant plusieurs épreuves blanches (ex. « Toussaint 2026 »). C'est l'unité du bilan. |
| **Épreuve blanche** | Une épreuve à questions **fixes et ordonnées** (jamais de tirage aléatoire), identifiée par un `EPREUVE_ID` stable (ex. `AV-MAT-TOUS26`), avec durée officielle et barème. |
| **Passage** | La copie d'un élève sur une épreuve : tentative unique, chronométrée, dans une fenêtre de dates. |
| **Bilan de session** | Document par élève au format Parkours V10 (2 pages), généré → relu → validé → envoyé/publié. |

---

## 3. Imports (l'existant d'abord) — Moodle non requis

Priorité absolue : **ne rien ressaisir**, et **ne pas dépendre de Moodle** (son abandon est envisagé). Deux formats d'entrée équivalents, au choix à chaque import :

1. **Import XML Moodle** (format pivot des 713 questions déjà encodées) : énoncés, types (`truefalse`, `multichoice`, `matching`...), propositions, clés, rétroactions, images intégrées, tags. Mapping vers les types du socle (`matching` → sous-questions vrai/faux). Sert à récupérer l'existant ; plus nécessaire ensuite.
2. **Import CSV/XLSX au format Parkours** (le format de référence pour l'avenir, défini ci-dessous — modèle fourni : `modele-import-questions-cb.csv`). **1 ligne = 1 question**, UTF-8, séparateur point-virgule :

| Colonne | Contenu |
|---|---|
| `id_question` | Identifiant stable unique (ex. `AV-MAT-TOUS26-12`) — clé de rapprochement et de mise à jour |
| `epreuve_id` | Identifiant de l'épreuve blanche (ex. `AV-MAT-TOUS26`) |
| `ordre` | Position dans l'épreuve (tri numérique ; `5.2` = sous-question 2 de la question 5) |
| `type` | `choix_unique` \| `choix_multiple` \| `vrai_faux` \| `redaction` |
| `bloc_id` | Identifiant de bloc pour les questions liées (vide = question isolée) |
| `enonce_commun` | Énoncé partagé par le bloc (rempli sur la 1re ligne du bloc) |
| `enonce` | Énoncé propre de la question (peut être vide si porté par l'image) |
| `proposition_a` … `proposition_f` | Textes des propositions (2 à 6) ; vides si portées par l'image |
| `cle` | `B` (choix unique) ; `A;C` (choix multiple) ; `VRAI` ou `FAUX` (vrai/faux) ; vide (rédaction) |
| `points` | Pondération de la question (défaut 1) |
| `chapitre` / `sous_chapitre` / `notions` / `travail_a_realiser` | Métadonnées pédagogiques |
| `auto_correction` | `OUI` / `NON` (NON = file de correction manuelle, ex. rédaction) |
| `retroaction` | Explication affichée à la correction |
| `fichier_image` / `document_associe` | Noms de fichiers joints dans le zip d'images accompagnant le CSV |

   Validation à l'import : unicité des `id_question`, clé cohérente avec le type et les propositions remplies, image présente dans le zip si référencée, rapport d'erreurs ligne à ligne avec import partiel (même mécanique que le socle).
3. **Import du référentiel pédagogique XLSX** (rapprochement par `ID_QUESTION`) : enrichissement chapitres/notions/travail/critères, flag auto-correction, statuts. Les lignes « À VÉRIFIER » du référentiel arrivent dans la file de relecture.
4. **Import CSV de notes historiques (V2, optionnel)** : reprise des sessions Moodle passées. Non bloquant.

Rapport d'import systématique (créées, mises à jour, anomalies type onglet CONTROLES).

### Durées officielles des épreuves (préremplies dans la table `epreuves_cb`, modifiables)

Relevé web d'octobre 2026 — à recaler sur le règlement de chaque session avant usage noté :

| Concours | Épreuve | Questions | Durée officielle |
|---|---|---|---|
| ACCÈS | Synthèse | — | 3 h |
| ACCÈS | Raisonnement logique et mathématiques | 15 × 4 propositions | 2 h |
| ACCÈS | Anglais | 50 | 1 h |
| SÉSAME | Enjeux contemporains | 40 | 30 min |
| SÉSAME | Compétences digitales | 20 | 20 min |
| SÉSAME | Mathématiques | 20 exercices | 40 min |
| SÉSAME | Français | 40 | 30 min |
| SÉSAME | Anglais | 40 | 30 min |
| SÉSAME | LV2 | 40 | 30 min |
| SÉSAME | Analyse documentaire | 20 | 2 h (séquence Analyser) |
| Avenir | Mathématiques | 45 | 1 h 30 |
| Avenir | Sciences | 30 | 1 h |
| Avenir | Anglais | 45 | 30 min |
| Advance | Mathématiques | 40 | 1 h 30 |
| Advance | Anglais | 30 | 30 min |
| Puissance Alpha | Mathématiques | 8 exercices × 4 V/F | 1 h 30 |
| Puissance Alpha | Sciences appliquées | 6 exercices sur 7 | 1 h |
| Puissance Alpha | Anglais | 25 | 45 min |
| GEIPI Polytech | Maths (QCM) + 2 sujets de spécialité au choix | 120 points → /20 | 3 h au total, répartition libre |

⚠ Écart relevé : le concours blanc Advance Parkours compte 60 questions là où l'épreuve officielle en compte 40 en 1 h 30 — choisir la durée à appliquer (1 h 30 par défaut, ou proratiser).

---

## 4. Parcours élève Parkours

1. **Rattachement** : l'admin importe la liste de la cohorte (nom, prénom, email élève, email parent). Si le compte existe déjà (inscription publique), il est rattaché ; sinon invitation par email avec création de mot de passe. L'élève garde un seul login pour tout le site.
2. **Onglet « Mes concours blancs »** : liste des épreuves assignées avec statut — À venir (fenêtre pas ouverte) / **À composer** (fenêtre ouverte, bouton Commencer) / Terminée (en attente du bilan) / **Bilan disponible**.
3. **Passage** : écran plein, une question à la fois avec navigation libre (retour possible, marquage « à revoir ») — c'est une épreuve, pas un drill ; **chronomètre** = durée officielle, remise automatique à expiration ; bouton « Je ne réponds pas » (abstention comptée) ; tentative unique ; sauvegarde continue (une coupure réseau ne perd pas la copie, reprise là où l'élève en était tant que la fenêtre et le chrono le permettent).
4. **Fin de passage — embargo** : message de confirmation de remise, **aucun score ni corrigé affiché**. La correction et le bilan ne deviennent visibles qu'après validation par la responsable (règle anti-triche entre élèves qui composent à des moments différents, et primeur du bilan).
5. **Consultation du bilan** : une fois validé/envoyé, l'élève (login candidat) et le parent (espace parent du socle) voient le bilan en ligne + PDF téléchargeable, ainsi que le détail corrigé de chaque copie (avec les rétroactions pédagogiques importées du XML).

---

## 5. Back-office — nouvelle section « Prépa »

S'ajoute aux sections Annales / Élèves / Pilotage du socle. Accès : admin + nouveau rôle **responsable_prepa** (tout Prépa, pas d'accès aux réglages du site public).

### 5.1 Cohortes
CRUD cohortes ; import XLSX des élèves (modèle fourni) ; vue des rattachés avec statut d'invitation.

### 5.2 Sessions et épreuves blanches
- Création d'une session (ex. Toussaint 2026) ; ajout d'épreuves par sélection d'un `EPREUVE_ID` importé ou composition manuelle (questions de la banque, ordre fixe).
- Paramètres par épreuve : durée, fenêtre de passage (début/fin), barème (lien vers la table `baremes` du socle, note ramenée sur 20 comme les exports actuels), cohorte(s) assignée(s).
- Suivi en temps réel : qui a composé, qui est en cours, qui n'a pas commencé ; relance email en un clic.

### 5.3 Correction
- **Automatique** à la remise pour toute question `auto_correction = OUI` (clé du référentiel ; « − » = abstention), **y compris l'analyse documentaire SÉSAME** : ses questions à réponses multiples sont auto-corrigées comme les autres, avec la règle officielle du concours — toutes les cases justes cochées et aucune autre = points de la question, sinon 0 (une seule mauvaise coche = 0). Les questions à trous (texte à compléter) sont auto-corrigées case par case selon la clé.
- **File de correction manuelle** réservée aux questions `auto_correction = NON` (épreuves rédigées : synthèse ACCÈS, exercices GEIPI) : la responsable voit la réponse de l'élève, attribue les points, peut annoter. Le bilan d'un élève n'est générable que lorsque toutes ses copies de la session sont 100 % corrigées.

### 5.4 Bilans (le cœur du module)
- **Génération automatique** par élève au format **Parkours V10** (modèles Ingénieurs et Commerce fournis en PDF, à reproduire fidèlement) :
  - *Page 1 — Résultats des concours* : tableau par concours × épreuve — note (barème officiel du concours, malus/bonus/options compris, ramenée /20), moyenne de la cohorte, **rang parmi les participants Parkours de la session**, détail B/F/A (bonnes/fausses/abstentions). Encadré « En quelques mots » (2 phrases max) **pré-rempli par génération, à reformuler par la responsable**.
  - *Page 2 — Analyse* : par matière, classement des chapitres en **Maîtrisé / À consolider / Insuffisant** — seuils **validés** sur le taux de réussite du chapitre : ≥ 75 % / 40–74 % / < 40 % (restent configurables en admin) — avec notions issues du référentiel ; **À travailler en priorité** : top 3 des chapitres — règle du modèle : *4 erreurs ou plus, si confirmé* — avec action ciblée pré-remplie depuis la colonne « Travail à réaliser » ; encadré « Méthode de révision Parkours » (texte fixe, éditable globalement).
- **Workflow d'états** : `généré` → `en relecture` (la responsable édite tous les textes, les chiffres restent calculés) → `validé` → `envoyé/publié`. Journal des modifications.
- **Envoi** : email aux parents + à l'élève sur le modèle du mail type fourni (objet, corps personnalisé prénom élève/parent, bilan en PDF joint + lien de consultation), envoyé par le site (Resend) avec copie à la responsable ; suivi des envois (reçu/échec). Envoi individuel ou en masse sur la session. Les adresses viennent de la base (email élève + email parent du socle).
- **Export** : PDF unitaire conforme V10 ; export XLSX des résultats de session (élève × épreuve : note, moyenne, rang, B/F/A) pour archivage et Zoho.

---

### 5.5 Épreuves orales — grilles d'évaluation des professeurs

Certains concours comportent des oraux (entretien de motivation ACCÈS/SÉSAME, oral de synthèse et motivation Advance...). Le module couvre leur évaluation lors des concours blancs :

- **Accès professeur** : les professeurs se connectent au back-office. Rôle `professeur` recommandé (accès limité à la section Oraux, sans données commerciales ni réglages, chaque évaluation signée de son auteur) ; à défaut, le compte admin partagé fonctionne mais sans traçabilité individuelle — à trancher.
- **Parcours** : section **Oraux** → choisir la session et l'épreuve orale → **rechercher l'élève** (nom, cohorte) → ouvrir sa **grille d'évaluation**.
- **Grille** : configurable par concours × épreuve orale (modèle par défaut fourni) — **critères pondérés** notés sur une échelle (ex. /5), note globale calculée, appréciation libre, recommandation de travail. Exemple (oral de motivation) : structuration du propos, connaissance de l'école et du projet, argumentation, expression et posture, anglais le cas échéant. Grille horodatée, rattachée au professeur évaluateur, modifiable jusqu'à validation de la session.
- **Restitution** : note d'oral et appréciation alimentent le **bilan V10** (ligne supplémentaire dans le tableau de résultats + paragraphe d'analyse) et l'export XLSX de session.

## 6. Modèle de données (deltas sur le socle v1.2)

```
cohortes
  id, nom, filiere (commerce|ingenieur), millesime, active

users                                  -- colonnes ajoutées
  + cohorte_id (nullable)              -- null = internaute libre
  + role : valeur supplémentaire 'responsable_prepa'

questions                              -- colonnes ajoutées (import Moodle/référentiel)
  + id_question_externe (unique, nullable)   -- ex. PA-NSI-2022-1-A
  + epreuve_id_externe (nullable)            -- ex. PA-NSI-2022
  + auto_correction (bool, défaut true)
  + retroaction_ciblee (texte), retroaction_complete (texte)
  + notions (texte), travail_a_realiser (texte), critere_maitrise (texte)
  + source_import (xml_moodle|xlsx|manuel), fichier_source

sessions_cb
  id, nom (ex. Toussaint 2026), statut (preparation|ouverte|correction|cloturee)

epreuves_cb
  id, session_cb_id, epreuve_id_externe, concours_id, matiere,
  duree_minutes, fenetre_debut, fenetre_fin, bareme_id, note_sur (défaut 20),
  statut (brouillon|publiee)

epreuve_cb_questions
  epreuve_cb_id, question_id, ordre, points

epreuve_cb_cohortes
  epreuve_cb_id, cohorte_id

passages
  id, epreuve_cb_id, user_id, started_at, remis_at, temps_passe,
  statut (en_cours|remis|corrige), note, note_sur_20,
  nb_bonnes, nb_fausses, nb_abstentions
  -- unicité (epreuve_cb_id, user_id) : tentative unique

passage_reponses
  id, passage_id, question_id, reponse (JSON), statut (correcte|incorrecte|abstention|a_corriger),
  points, correcteur_id (nullable), annotation (nullable)

epreuves_orales
  id, session_cb_id, concours_id, nom (ex. Oral de motivation), ordre

grilles_oral                   -- modèle de grille par concours x épreuve orale
  id, epreuve_orale_id, criteres (JSON : [{libelle, ponderation, echelle}]), actif

evaluations_orales
  id, epreuve_orale_id, user_id (élève), professeur_id (user rôle professeur|admin),
  notes_criteres (JSON), note_globale, appreciation, recommandation,
  statut (brouillon|validee), created_at, updated_at
  -- unicité (epreuve_orale_id, user_id)

users.role : valeur supplémentaire 'professeur' (accès limité à la section Oraux)

bilans
  id, session_cb_id, user_id,
  statut (genere|en_relecture|valide|envoye),
  en_quelques_mots (texte), analyse (JSON : par matière, chapitres classés et textes édités),
  priorites (JSON : top 3 édité), pdf_url,
  valide_par, valide_le, envoye_le, destinataires (JSON), log_envoi (JSON)
```

Règles : le rang d'une épreuve = classement des `passages.note` parmi les élèves de la ou des cohortes assignées ayant remis ; moyenne = même périmètre. RLS : un élève ne lit que ses passages et son bilan **à l'état `envoye`** (embargo) ; le parent, via l'espace parent du socle, lit le bilan envoyé de son enfant ; `responsable_prepa` lit/écrit tout le périmètre Prépa.

---

## 7. RGPD et sécurité (spécifique au module)

1. Les élèves de la prépa sont pour la plupart **mineurs** : le socle v1.2 s'applique (consentements, espace parent). Le rattachement à une cohorte par l'admin vaut inscription par l'établissement : prévoir une mention dans la politique de confidentialité (traitement au titre du contrat de scolarité Parkours).
2. **Les exports CSV Moodle et listes d'élèves contiennent des données réelles (noms, emails)** : jamais dans le repo GitHub, jamais en seed de démo ; environnement de test avec données fictives uniquement.
3. L'embargo est une règle serveur (RLS), pas un masquage d'interface.
4. Les emails de bilan transitent par Resend avec le PDF joint : pas de note dans le corps du mail au-delà de ce que le modèle type prévoit.

---

## 8. User stories

**Élève Parkours**
1. Je me connecte avec mon login habituel et je vois mes concours blancs assignés et leur statut.
2. Pendant la fenêtre, je compose en ligne : chrono officiel, navigation libre entre questions, abstention possible, remise automatique à la fin du temps ; une coupure ne me fait pas perdre ma copie.
3. À la remise, je n'ai ni score ni corrigé ; je reçois un email quand mon bilan est disponible, et je le consulte (avec le détail corrigé de mes copies) dans mon espace.

**Parent**
4. Je reçois par email le bilan de session de mon enfant (PDF + lien) et je le consulte dans l'espace parent.

**Professeur**
4 bis. Je me connecte au back-office, je cherche un élève dans la section Oraux et je remplis sa grille d'évaluation (critères notés, appréciation) ; ma note alimente son bilan.

**Responsable des prépas**
5. Je crée une session, j'y place les épreuves importées (XML Moodle + référentiel), je fixe durées, fenêtres et barèmes, et j'assigne les cohortes.
6. Je suis les passages en temps réel et je relance les retardataires.
7. Je corrige dans la file manuelle les questions non auto-corrigeables.
8. Je relis chaque bilan généré : les chiffres sont calculés, je reformule les textes (« En quelques mots », analyses, priorités), je valide.
9. J'envoie les bilans (unitaire ou en masse) aux parents et élèves, je vois les statuts d'envoi, j'exporte le PDF et le XLSX de session.

**Admin**
10. Je gère les cohortes et leurs élèves (import XLSX, invitations, rattachements).
11. J'importe les XML Moodle et le référentiel pédagogique avec rapport d'anomalies.

---

## 9. Ordre de développement (suite de la section 12 du socle)

9. **Cohortes et rôles** : table cohortes, rattachement users, rôle responsable_prepa, import XLSX élèves + invitations.
10. **Importeurs** : XML Moodle (questions, clés, rétroactions, images) + référentiel XLSX (rapprochement par ID_QUESTION) + rapport d'anomalies. Jeu de test : les fichiers fournis (XML à récupérer, référentiel 713 questions).
11. **Sessions et épreuves blanches** : création, questions fixes ordonnées, fenêtres, barèmes /20, assignation cohortes, suivi temps réel.
12. **Passage élève** : chrono, navigation libre, abstention, sauvegarde continue, remise auto, embargo.
13. **Correction** : auto-correction à la remise + file de correction manuelle.
14. **Bilans** : génération V10 (calculs + pré-remplissage), édition/relecture, validation, PDF fidèle aux modèles Ingénieurs/Commerce, envoi email avec suivi, publication espaces élève/parent, exports.
15. **Oraux** : rôle professeur, grilles configurables, écran de recherche élève + saisie, intégration au bilan.

Ajustements d'arbitrages intégrés en cours de route : import par **CSV Parkours** (format section 3) à égalité avec le XML Moodle, Moodle n'étant plus un prérequis ; **durées officielles** préremplies (tableau section 3) ; **analyse documentaire SÉSAME auto-corrigée** dès la V1 du module (règle « une mauvaise coche = 0 ») — le type `choix_multiple` est donc servi côté élève dans les concours blancs dès cette V1 (le site public d'entraînement libre peut continuer à l'activer en V1.5).

Chaque étape livrable et testable indépendamment. Test de recette de bout en bout : rejouer la session Toussaint 2026 avec 3 élèves fictifs et comparer notes/rangs aux calculs manuels.

---

## 10. Arbitrages pris (à confirmer) et questions ouvertes

1. **Passage 100 % en ligne sur le site** (à la maison ou en salle), comme aujourd'hui sur Moodle. Pas de mode papier + saisie en V1.
2. **Rang et moyenne calculés sur les participants Parkours de la session** (cohortes assignées), conformément au mail type.
3. **Embargo** : correction et bilan invisibles avant l'état `envoyé`. À confirmer : faut-il un état intermédiaire « bilan envoyé mais corrigé détaillé masqué jusqu'au RDV de restitution » ?
4. **Seuils Maîtrisé / À consolider / Insuffisant** : ✅ validés — ≥ 75 % / 40–74 % / < 40 % de réussite par chapitre (configurables en admin).

**Barèmes relevés sur les sujets de concours blancs fournis (à charger dans la table `baremes`) :**

| Épreuve blanche | Barème relevé sur le sujet |
|---|---|
| Avenir Maths (AV-MAT-TOUS26) | +3 par bonne réponse / −1 par mauvaise / 0 si non traitée |
| Advance Maths (ADV-MAT-OCT26) | +1 par réponse exacte / −0,5 par inexacte / 0 abstention ou annulation — une **ou plusieurs** bonnes réponses par question (5 propositions a–e) |
| Puissance Alpha Maths (PA-MAT-TOUS26) | +1 par réponse exacte / −0,5 par inexacte / 0 abstention ; **bonification +1** par exercice entièrement juste ; 8 exercices max dont les 4 fondamentaux, puis 4 selon profil (spécialité : ex. 5–12 ; maths complémentaires : ex. 13–16) — règle de **questions au choix** à porter par le module |
| GEIPI Polytech Maths (GE-MAT-TOUS26) | QCM : réponse fausse pénalisée, **total par exercice jamais strictement négatif** (plancher 0 par exercice), abstention 0 ; + 2 exercices de spécialité rédigés (type `redaction`, correction manuelle) |
5. **Envoi par le site (Resend)** et non par Zoho : le mail type est reproduit dans le site ; Zoho reste alimenté par l'export XLSX. Alternative possible (V2) : push direct vers Zoho.
6. Question ouverte : les **LV2 (allemand, espagnol)** et NSI apparaissent dans vos épreuves — simple ajout d'épreuves par concours dans le socle, mais à confirmer pour l'affichage public (ces matières n'apparaissent pas côté entraînement libre tant qu'aucune annale publique n'est publiée).
