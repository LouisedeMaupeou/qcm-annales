# Spécifications — Plateforme d'entraînement aux annales de concours

**Version 1.2 — Juillet 2026 · brief de développement (utilisable directement dans Claude Code)**
**Évolutions vs v1.1 (arbitrages produit) : scoring vrai/faux « tout ou rien », barèmes officiels (points négatifs) appliqués dès la V1, sessions de 20 questions pour SÉSAME, signalement = dépublication immédiate + relecture, suppression de l'échantillonnage de contrôle, explications IA non publiées sans relecture, landing page publique, parcours mineurs (date de naissance + autorisation et accès parent), bandeau cookies et mentions légales, section KPI dans le back-office, responsive mobile obligatoire, vocabulaire unifié « session ».**

---

## 1. Vision produit

Plateforme web d'entraînement aux concours post-bac : tout élève s'inscrit librement, s'entraîne sur des annales officielles sous forme de **sessions** corrigées, et suit sa progression. La plateforme sert aussi d'outil d'acquisition de leads qualifiés (coordonnées + performance) exportables vers Zoho CRM.

**Concours couverts (6) :** commerce — ACCÈS, SÉSAME ; ingénieur — Avenir, Advance, Puissance Alpha, GEIPI Polytech. Volume d'annales par concours flexible (1 à N années).

**Vocabulaire produit unifié : « session »** = une série de questions jouée par un élève (l'ancien terme « série » disparaît de l'interface, du code et de la documentation).

---

## 2. Formats officiels des concours (référentiel produit)

⚠️ Barèmes exacts (notamment Avenir) à vérifier sur le règlement officiel de la session concernée avant affichage aux élèves.

| Concours | Types de questions | Barème | Structure | Taille de session |
|---|---|---|---|---|
| ACCÈS | Vrai/faux par proposition (1 énoncé → 4 propositions) ; synthèse rédigée (V2) | Points négatifs | Blocs liés | 10 |
| SÉSAME | Choix unique majoritaire ; analyse documentaire en choix multiple strict (V1.5) | Pas de points négatifs | Isolées + corpus (analyse doc.) | **20** |
| Avenir | Choix unique | +1 / −1 (à vérifier) | Isolées | 10 |
| Advance | Choix simple ou multiple (multiple : V1.5) | +2 / −0,5 | Isolées, mini-séries | 10 |
| Puissance Alpha | Vrai/faux par affirmation (sciences) ; choix unique (anglais) | +1 / −0,5 | Blocs (1 exercice = 4 V/F) | 10 |
| GEIPI Polytech | Choix unique (QCM maths) ; exercices rédigés (V2) | Pas de points négatifs | Très liées | 10 |

**Règles produit :**
1. Types servis en V1 : `choix_unique` et `vrai_faux`. `choix_multiple` en **V1.5** (débloque l'analyse documentaire SÉSAME et une partie d'Advance — première brique post-lancement). `redaction` en V2.
2. **Blocs de questions liées** : un bloc est tiré entier ou pas du tout, servi dans l'ordre.
3. **Scoring vrai/faux « tout ou rien »** : une question à 4 propositions est **correcte uniquement si les 4 jugements sont exacts** ; 3/4 = incorrecte. Une question laissée entièrement vide = abstention ; partiellement remplie = incorrecte.
4. **Barème officiel appliqué dès la V1** : chaque réponse rapporte les points du barème du concours (bonne / mauvaise / abstention), y compris les points négatifs. Affichage en fin de session : points bruts (ex. « 6 points sur 10 possibles ») + taux de bonnes réponses. Pour le tableau de bord, le score normalisé = points obtenus / points maximum, plancher 0, pour la comparabilité entre concours.
5. **Le bouton « Je ne réponds pas » est conservé** : avec les points négatifs, l'abstention devient un vrai geste stratégique. La correction affiche le coût évité (« une mauvaise réponse aurait coûté −1 »).
6. La **taille de session est un paramètre par concours** : 20 pour SÉSAME, 10 pour les autres (configurable en back-office).

---

## 3. Périmètre

### V1
- **Landing page publique** (cf. §5.0) avec CTA « Je me lance ! » vers l'inscription
- Inscription libre avec **date de naissance**, consentements, parcours parent pour les mineurs (cf. §5.1)
- **Mode Entraînement** : concours → épreuve → session (10 ou 20 questions) → correction, barème officiel appliqué, sans chronomètre
- Types `choix_unique` et `vrai_faux` (blocs ACCÈS / Puissance Alpha jouables dès la V1)
- Correction : bonne(s) réponse(s), explication si renseignée et relue, chapitre à retravailler (sans lien « réviser ce chapitre » — masqué, prévu V2), bouton « Signaler une erreur »
- Tableau de bord élève par matière ; **espace parent en lecture seule**
- Back-office en 3 sections : **Annales**, **Élèves**, **Pilotage (KPI)**
- Pipeline de contenu avec seuil de confiance (90 %) et file de relecture
- **Responsive mobile obligatoire** : les élèves réviseront majoritairement au téléphone ; chaque écran élève doit être fluide sur mobile (tests sur viewport 390 px)
- **Bandeau cookies** + pages légales (mentions légales, CGU, politique de confidentialité)

### V1.5 (première itération post-lancement)
- Type `choix_multiple` en front → active l'analyse documentaire SÉSAME (session de 20 sur corpus) et les questions multiples Advance
- Extraction automatique des questions depuis les PDF sources (option B validée par POC)

### V2
- **Mode Conditions réelles** : chronomètre, volumes réels, questions au choix (Avenir 45/60), corpus complets
- Type `redaction` (synthèse ACCÈS, exercices GEIPI) avec correction
- Générateur de variantes (variables + scénario) — cf. §6.1
- Sessions ciblées par chapitre (réactivation du lien « réviser ce chapitre »)
- Durcissement opérationnel : captcha inscription, environnement de staging, sauvegardes, SPF/DKIM avancé
- Statistiques par classe, paiement, application native

### Hors périmètre
Rien d'autre à ce stade.

---

## 4. Utilisateurs et rôles

| Rôle | Accès |
|---|---|
| **Élève** (auto-inscription ; public souvent mineur) | Front : entraînement + tableau de bord |
| **Parent** (accès créé automatiquement pour les mineurs) | Espace en lecture seule : progression de son enfant |
| **Admin** | Back-office complet |
| **Contributeur** *(optionnel)* | Back-office contenu uniquement |

---

## 5. Parcours

### 5.0 Landing page publique
Une page unique présentant la valeur du site : s'entraîner gratuitement sur les annales officielles des 6 concours commerce et ingénieur post-bac, avec correction expliquée et suivi de progression. Gros CTA **« Je me lance ! »** menant au formulaire d'inscription (répété en haut et en bas de page). Contenu : proposition de valeur, les 6 concours couverts, le fonctionnement en 3 étapes (je choisis mon concours → je joue une session → je progresse), un bloc de réassurance parents (gratuit, données protégées, annales officielles), footer légal. Pas de logos officiels des concours (droits) : noms en toutes lettres. Un prototype HTML de référence est fourni (`landing-page.html`).

### 5.1 Inscription
Champs obligatoires : email élève (identifiant), mot de passe (8 caractères min.), nom, prénom, **date de naissance**, ville, établissement scolaire, email du parent, concours visé(s) (multi-sélection). Deux cases distinctes : consentement marketing **décoché par défaut** ; acceptation CGU/politique de confidentialité (obligatoire). Double opt-in email élève.

**Parcours mineur (calculé depuis la date de naissance) :**
- **Élève de moins de 15 ans** : le compte reste inactif tant que le parent n'a pas cliqué le lien d'autorisation reçu par email (consentement parental requis par le RGPD français sous 15 ans). L'email explique le site, demande l'autorisation, et fournit au parent son accès à l'espace parent.
- **Élève mineur de 15 à 17 ans** : le compte s'active au double opt-in élève ; le parent reçoit un email d'information avec son accès à l'espace parent (pas de blocage).
- **Espace parent** : accès par lien magique (pas de mot de passe à gérer), en lecture seule — progression de l'enfant (scores par matière, régularité), avec un message d'encouragement type « aidez-le à garder le rythme ». Aucune action possible sur le compte de l'élève.
- Emails transactionnels nécessaires dès la V1 (double opt-in, autorisation parentale, reset) : service type Resend ou SMTP Supabase, configuration de délivrabilité minimale.

### 5.2 Connexion
Email + mot de passe, mot de passe oublié.

### 5.3 Mode Entraînement
1. Choix du concours (cartes grisées si vide ; badge sur les concours visés).
2. Choix de l'épreuve, avec questions disponibles et dernier score.
3. **Session** (10 questions, 20 pour SÉSAME) tirée aléatoirement dans le pool publié du couple concours × épreuve :
   - tirage au niveau bloc (bloc entier ou rien) ; tirage pondéré anti-répétition ; session réduite avec message si pool insuffisant ;
   - une question à la fois, indicateur de progression, pas de retour arrière, pas de chronomètre ;
   - rendu selon le type : radio (choix unique) ou toggle Vrai/Faux par proposition ;
   - bouton **« Je ne réponds pas »**.
4. **Correction de fin de session** : points bruts selon le barème officiel + taux de bonnes réponses ; abstentions affichées avec le coût évité ; questions ratées/passées dépliées (bonne réponse, explication si disponible, chapitre à retravailler) ; questions réussies repliées ; **« Signaler une erreur »** sur chaque question ; boutons « Refaire une session », « Changer d'épreuve », « Mon tableau de bord ».
5. Sessions refaisables sans limite ; chacune est enregistrée.

### 5.4 Tableau de bord élève
Évolution du score normalisé par matière (multi-courbes, filtre concours) ; tableau sessions/progression par matière (nombre de sessions, score moyen, dernier, tendance) ; compteurs globaux ; chapitres à retravailler ; historique avec lien vers chaque correction.

---

## 6. Back-office (3 sections)

### 6.1 Section Annales
- Vue par concours : une ligne par annale (année, épreuves, questions, format source 1 ou 2 documents, statut).
- **Importer une annale** : concours + année + format (2 documents questions/corrections ou 1 document complet) ; PDF archivés et rattachés.
- Contenu : épreuves → blocs (énoncé commun, images, corpus) → questions (`choix_unique` | `vrai_faux` | `choix_multiple` | `redaction`, propositions avec vrai/faux par proposition, **explication facultative**, **chapitre obligatoire**, statut). Filtre « sans explication ». Champs V2 masqués : `variables`, `scenario`.
- Import en masse XLSX/CSV (1 ligne = 1 proposition, groupe_id pour les blocs) : rapport de validation, import partiel.
- **File de relecture** : file filtrable par motif de doute, vue côte à côte PDF source / question éditable, actions Valider · Corriger puis valider · Rejeter. Règles :
  - indice de **confiance d'extraction (0–100)** par question ingérée ; **≥ 90 % (configurable) → auto-publication** avec marquage `auto_publiee` ; **< 90 % → file de relecture**, publication impossible sans validation humaine ;
  - **les explications générées par IA ne sont jamais affichées aux élèves sans relecture** : une question auto-publiée l'est sans son explication générée tant que celle-ci n'a pas été validée (l'explication étant facultative, la question reste jouable) ;
  - **signalement élève : dépublication immédiate** de la question + entrée en file de relecture avec le motif du signalement ; l'admin la corrige/valide (republication) ou la rejette ;
  - pas d'échantillonnage de contrôle automatique.
- **Générateur de variantes (V2)** : depuis une question validée, génération de variantes (variables changées, consignes reformulées, réponse et explication recalculées) ; `origine = generee`, lien vers la source, seuil de confiance recommandé plus strict (95 %). Point juridique : des questions originales générées « dans l'esprit du format » posent moins de questions de droits que la reproduction des sujets — à confirmer avec un conseil juridique (ceci n'est pas un avis d'avocat).
- **Barèmes** par concours × épreuve : points bonne / mauvaise / abstention, règle spéciale, source officielle, date de vérification, **taille de session**.

### 6.2 Section Élèves
Compteurs (inscrits, consentants, actifs 30 j, répartition par concours visé) ; liste filtrable ; fiche élève (coordonnées, consentements horodatés, statut d'autorisation parentale, historique) ; actions désactiver / reset / **suppression RGPD** ; **export XLSX Zoho** respectant les filtres (colonnes : identité, contacts, ville, établissement, concours visés, consentement + date, inscription, nb de sessions, scores moyens, dernière activité).

### 6.3 Section Pilotage (KPI)
Tableau de bord admin avec :
- **Utilisateurs par usage** : classement des élèves par nombre de sessions (période filtrable), avec leur **progression** (delta de score normalisé entre leurs premières et dernières sessions) ;
- **Taux d'annales réalisées par concours** : questions publiées vues au moins une fois / questions publiées, par concours (mesure la profondeur d'usage du stock) ;
- **Score moyen** par concours et par épreuve ;
- compteurs transverses : sessions jouées (7 j / 30 j), taux inscription → première session, taux de consentement marketing.
Export CSV de chaque tableau.

---

## 7. Modèle de données

```
users
  id, email (unique), password_hash, role (eleve|admin|contributeur),
  nom, prenom, date_naissance, ville, etablissement, email_parent,
  consent_marketing (bool), consent_marketing_date,
  cgu_acceptees_date, email_verifie (bool),
  autorisation_parentale (non_requise|en_attente|accordee),
  actif (bool), created_at

parent_access                  -- espace parent en lecture seule
  id, user_id (élève), token_magique, dernier_acces

user_concours_vises
  user_id, concours_id

concours
  id, nom, filiere (commerce|ingenieur), taille_session (défaut 10), actif

epreuves
  id, concours_id, nom, ordre_affichage

baremes
  id, concours_id, epreuve_id,
  points_bonne, points_mauvaise, points_abstention,
  regle_speciale, source_officielle, verifie_le

annales
  id, concours_id, annee, statut, format_source (un_document|deux_documents)

annale_documents
  id, annale_id, type (questions|corrections|complet), fichier_url

blocs
  id, annale_id, epreuve_id, enonce_commun, image_url, ordre, statut

bloc_documents
  id, bloc_id, fichier_url, titre

questions
  id, bloc_id, type (choix_unique|vrai_faux|choix_multiple|redaction),
  enonce, image_url, explication (nullable),
  explication_origine (humaine|generee), explication_relue (bool),
  chapitre, statut (brouillon|a_verifier|publie|depubliee),
  statut_extraction (manuel|ok|a_verifier), commentaire_extraction,
  confiance_extraction (0-100, nullable), auto_publiee (bool),
  origine (extraite|manuelle|generee), question_source_id (nullable),
  variables (JSON, V2), scenario (V2), ordre_dans_bloc

reponses_possibles
  id, question_id, texte, est_correcte (bool), ordre

sessions
  id, user_id, concours_id, epreuve_id, mode (entrainement|conditions_reelles),
  points, points_max, score_normalise (0-1, plancher 0),
  nb_questions, nb_correctes, nb_abstentions, started_at, completed_at

session_questions
  id, session_id, question_id,
  reponse (JSON), statut (correcte|incorrecte|abstention), points

signalements
  id, question_id, user_id, motif, created_at, traite (bool)
```

Règles : vrai/faux correcte = 4/4 exact ; vide = abstention ; partiel = incorrecte. `points` calculés depuis le barème du couple concours × épreuve. Suppression de compte = cascade complète (sessions, signalements, parent_access...).

---

## 8. RGPD, légal et conformité

1. Consentement marketing décoché par défaut, distinct des CGU, horodaté.
2. **Mineurs** : date de naissance collectée ; < 15 ans → consentement parental bloquant ; 15-17 ans → information parent ; espace parent en lecture seule. Finalité de l'email parent explicitée dans la politique de confidentialité.
3. Double opt-in email élève.
4. Droit à l'effacement : back-office + « Supprimer mon compte » côté élève.
5. Pages légales dans le footer : **mentions légales**, CGU, politique de confidentialité.
6. **Bandeau cookies** : consentement préalable à tout cookie non essentiel (analytics) ; accepter / refuser d'égale visibilité ; le refus n'empêche pas l'usage du site.
7. Mots de passe hashés (Supabase Auth) ; accès parent par lien magique sans mot de passe.
8. Lien de désinscription dans tout email marketing (côté Zoho).
9. ⚠️ Droits de reproduction des annales à sécuriser concours par concours avant import massif.

---

## 9. Stack technique

Next.js 14+ (App Router, front + back-office + landing), Supabase (PostgreSQL, Auth, Storage, RLS), Tailwind + shadcn/ui, Recharts, SheetJS, emails via Resend (ou SMTP Supabase), Vercel. Sécurité : RLS par rôle (élève / parent lecture seule / admin), validation serveur, rate limiting inscription/connexion. **Responsive mobile-first sur tout le front élève.**

---

## 10. Enseignements du POC d'extraction (annale ACCÈS 2025)

1. ACCÈS = vrai/faux par proposition → type `vrai_faux` V1.
2. Le corrigé officiel ne contient aucune explication → l'explication est produite (IA + relecture), jamais publiée sans validation.
3. Problèmes chaînés (maths Q11–Q15) → entité `bloc`, énoncés rendus auto-porteurs à la relecture.
4. Taux d'extraction propre ~68 % (scientifique) / ~100 % (textuel) ; causes : notation mathématique dégradée, figures à rattacher, blocs à réécrire → file de relecture dimensionnée pour ~30 % du volume scientifique.
5. Le sujet source peut contenir ses propres erreurs → statut « à vérifier » + commentaire.

Pipeline : **import PDF → extraction (manuelle V1, IA V1.5) avec indice de confiance → auto-publication ≥ 90 % (sans explication générée non relue) / relecture < 90 % → publication, avec signalement élève (dépublication immédiate + relecture).**

---

## 11. User stories

**Visiteur**
0. J'arrive sur la landing page, je comprends la proposition de valeur et je clique « Je me lance ! » vers l'inscription.

**Élève**
1. Je crée un compte (avec ma date de naissance) ; si j'ai moins de 15 ans, mon compte s'active après l'autorisation de mon parent.
2. Je me connecte, je réinitialise mon mot de passe, je peux supprimer mon compte.
3. Je joue une session (10 ou 20 questions selon le concours) mêlant choix unique et vrai/faux, blocs servis entiers, avec possibilité de ne pas répondre.
4. En fin de session, je vois mes points selon le barème officiel du concours, mes abstentions et leur coût évité, et pour chaque erreur la bonne réponse, l'explication si elle existe et le chapitre à retravailler ; je peux signaler une erreur.
5. Je consulte mon tableau de bord par matière, mes chapitres à retravailler et mon historique.

**Parent**
6. Je reçois l'email (autorisation si < 15 ans, information sinon) et j'accède en lecture seule à la progression de mon enfant via un lien magique.

**Admin**
7. J'importe une annale (1 ou 2 PDF), je crée blocs et questions (chapitre obligatoire, explication facultative), à l'unité ou en masse.
8. Je relis en file de relecture les questions sous 90 % de confiance et les questions signalées (dépubliées automatiquement) ; le reste est auto-publié avec traçabilité.
9. Je gère les barèmes et tailles de session par concours × épreuve avec leur source officielle.
10. Je pilote via la section KPI : usage et progression des élèves, taux d'annales réalisées par concours, scores moyens ; j'exporte.
11. Je gère les élèves (filtres, fiche, RGPD) et j'exporte les contacts + performances vers Zoho.

---

## 12. Ordre de développement (pour Claude Code)

1. **Socle** : Next.js + Supabase, schéma complet (blocs, barèmes, parent_access, signalements), RLS.
2. **Landing page** (à partir du prototype `landing-page.html`) + pages légales + bandeau cookies.
3. **Auth** : inscription (date de naissance, parcours mineur), double opt-in, emails transactionnels, espace parent.
4. **Contenu** : back-office Annales (annales, PDF sources, blocs, questions, barèmes) + seed reprenant le fichier POC ACCÈS 2025.
5. **Import XLSX + file de relecture** (seuil de confiance, signalements).
6. **Entraînement** : tirage par blocs, choix_unique + vrai_faux, abstention, scoring barème, correction.
7. **Tableau de bord élève** + espace parent.
8. **Sections Élèves et Pilotage (KPI)** + exports.
9. **Finitions responsive, déploiement Vercel.**

Chaque étape est livrable et testable indépendamment.
