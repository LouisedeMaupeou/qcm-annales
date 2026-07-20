# Admissible — plateforme d'entraînement aux annales de concours

Entraînement gratuit aux concours post-bac (commerce et ingénieur) sur annales
officielles, avec correction, barème officiel appliqué et suivi de progression.

La source de vérité fonctionnelle est
[`docs/specifications-plateforme-qcm-annales-v1.2.md`](docs/specifications-plateforme-qcm-annales-v1.2.md).
Les références `§x.y` de ce dépôt et des commentaires du code renvoient à ses
sections.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · Supabase
(PostgreSQL, Auth, Storage, RLS) · Recharts · SheetJS · Resend · Vercel.

## Démarrer en local

```bash
npm install
cp .env.example .env.local   # puis renseigner les valeurs
npm run dev
```

`npm run build` fonctionne sans clé Resend : les emails sont alors écrits dans
la console du serveur au lieu d'être envoyés, ce qui permet de dérouler tout le
parcours d'inscription en local. Un avertissement le rappelle au build.

### Scripts

| Commande | Effet |
|---|---|
| `npm run dev` | serveur de développement |
| `npm run build` | build de production (vérifie la configuration) |
| `npm test` | tests unitaires du cœur métier (scoring, tirage, progression, KPI) |
| `npm run lint` | ESLint |

```bash
# Créer un compte de back-office (seul chemin : l'inscription force le rôle élève)
node --env-file=.env.local scripts/creer-admin.mjs <email> <motdepasse> [admin|contributeur]

# Importer l'annale ACCÈS 2025 du POC
node --env-file=.env.local scripts/seed-acces-2025.mjs

# Importer l'annale Advance 2026 (anglais ; les PDF de maths sont archivés
# mais leurs pages sont des images, cf. commentaire en tête du script)
node --env-file=.env.local scripts/importer-advance-2026.mjs <dossier-des-pdf>

# Importer les annales Avenir 2025 et 2026 (anglais ; maths, sciences et
# physique archivés seulement, leur notation ne survit pas à l'extraction)
node --env-file=.env.local scripts/importer-avenir.mjs <dossier-des-pdf>
```

### Ce qui s'extrait d'un PDF, et ce qui ne s'extrait pas

Trois concours importés, une même leçon : **les épreuves de langue passent, les
épreuves scientifiques non.**

| Cas | Exemple | Verdict |
|---|---|---|
| Texte véritable, prose | anglais Advance et Avenir | extractible |
| Pages en images | maths Advance, affirmations Puissance Alpha | OCR nécessaire |
| Texte véritable, notation 2D | maths et sciences Avenir, QCM GEIPI | **illisible une fois linéarisé** |

Le troisième cas est le plus trompeur : le PDF *contient* du texte, le diagnostic
le déclare exploitable, mais `u_n = (n³+1)/(2n³+5)` ressort en fragments empilés
et `5,97×10²⁴ kg` devient « 5,97.10kg ». Le QCM GEIPI y ajoute un doublement de
caractères (`𝑥𝑥` pour `x`). **Vérifier le rendu d'une question avant d'importer
une épreuve scientifique** — le diagnostic automatique ne suffit pas.

### Concours examinés mais non importés

| Concours | Motif |
|---|---|
| GEIPI Polytech | Seul le QCM maths relève de la V1 (le reste est rédactionnel, type `redaction` en V2), et sa notation ne survit pas à la linéarisation. |
| Puissance Alpha | Les affirmations sont des images ; le texte extrait ne contient que titres et pied de page. Mention de droits explicite (article L111-1 du CPI). |

## Base de données

Migrations dans `supabase/migrations`, appliquées avec :

```bash
npx supabase link --project-ref <ref>
npx supabase db push
```

### Deux règles d'architecture à connaître avant de toucher au code

**1. Les élèves n'ont aucun accès direct à `questions` ni à
`reponses_possibles`.** La colonne `reponses_possibles.est_correcte` contient le
corrigé : exposée via PostgREST, n'importe quel élève lirait la réponse avant de
répondre en interrogeant l'API avec son propre jeton. Le contenu jouable est
servi exclusivement par `src/lib/session-entrainement.ts`, qui retire
`est_correcte` et les explications non relues. La notation se fait côté serveur.

**2. Le statut d'un bloc est dérivé, pas écrit à la main.** Un bloc est tiré
entier ou pas du tout (§2.2), donc il n'est jouable que si toutes ses questions
le sont. Un trigger maintient cette invariante quel que soit le chemin
d'écriture (seed, import, relecture, signalement).

## Déploiement

### Variables d'environnement

| Variable | Rôle |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | projet Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | clé publiable (rôle `anon`) |
| `SUPABASE_SERVICE_ROLE_KEY` | **secret** — contourne la RLS, usage serveur uniquement |
| `RESEND_API_KEY` | **secret** — envoi des emails transactionnels |
| `EMAIL_EXPEDITEUR` | ex. `Admissible <noreply@exemple.fr>` |
| `NEXT_PUBLIC_SITE_URL` | URL publique, base des liens envoyés par email |

Le build échoue si l'une manque sur un déploiement de production
(`VERCEL_ENV=production`), ou si `NEXT_PUBLIC_SITE_URL` pointe encore vers
`localhost`. Sans clé Resend, un élève de moins de 15 ans resterait bloqué sans
que personne ne s'en aperçoive : c'est pourquoi le contrôle est bloquant.

### Particularité de dépendance

`xlsx` est installé depuis le CDN de SheetJS et non depuis npm, où le paquet est
figé à une version vulnérable (pollution de prototype à l'ouverture d'un
fichier — soit exactement le chemin de l'import en masse). **Le CI et la
plateforme de déploiement doivent pouvoir joindre `cdn.sheetjs.com`.**

## À faire avant une mise en production réelle

Ces points sont connus et documentés, aucun n'est un oubli :

- [ ] **Barèmes** — Avenir et Puissance Alpha sont sourcés et datés d'après
      leurs sujets officiels. Restent à vérifier : ACCÈS, SÉSAME, Advance, et
      le cas GEIPI ci-dessous. Écran : back-office → Barèmes et seuils.
- [ ] **GEIPI Polytech : le §2 des specs est faux sur deux points.** Le sujet
      officiel 2026 décrit un QCM **vrai/faux par affirmation** (et non un choix
      unique) **avec points négatifs** (et non « pas de points négatifs »),
      plafonnés par la règle « pour chaque exercice, le total ne peut être
      strictement négatif ». Ce plancher **par exercice** n'est pas exprimable
      dans le modèle actuel, qui ne plafonne qu'au niveau de la session.
      Appliquer les points négatifs sans ce plancher surpénaliserait les élèves,
      donc le barème reste sans point négatif et non vérifié. À trancher :
      implémenter un plancher par bloc, ou assumer l'écart.
- [ ] **Pages légales** — mentions légales, CGU et politique de confidentialité
      sont des trames. Les passages surlignés (raison sociale, SIRET, directeur
      de publication, hébergeur, durées de conservation, clause de
      responsabilité) doivent être complétés et l'ensemble relu par un conseil.
- [ ] **Droits de reproduction des annales** — à sécuriser concours par concours
      (§8.9). La section propriété intellectuelle en dépend.
- [ ] **Délivrabilité** — domaine vérifié chez Resend avec SPF/DKIM, sans quoi
      les emails d'autorisation parentale partiront en indésirables.
- [ ] **Comptes et données de test** — supprimer `admin.test@`, `eleve.test@`,
      `contributeur.test@` et les sessions de démonstration.
- [ ] **Figures manquantes** — 3 questions de l'annale ACCÈS 2025 exigent une
      illustration absente ; elles sont en file de relecture et non jouables.
- [ ] **Advance : deux questions « 22 » par test** — le sujet source numérote
      deux fois la question 22 et n'a pas de 23, dans les trois tests d'anglais.
      Six questions sont en file de relecture : il faut décider laquelle prend
      quelle entrée du corrigé. L'une d'elles n'a par ailleurs que trois
      propositions et un corrigé désignant une quatrième inexistante.
- [ ] **Advance : mathématiques non transcrites** — les deux PDF (spécialité et
      complémentaires, ~180 pages) ont des pages en images. Leur transcription
      demande un OCR de notation mathématique, hors périmètre V1 (§3), ou une
      saisie manuelle via l'import XLSX du back-office.
- [ ] **Avenir : droits de reproduction** — les corrigés de la session 2025
      portent « Propriété exclusive du Concours Avenir. Reproduction
      interdite. ». L'import a été autorisé explicitement par le responsable du
      projet, qui a déclaré disposer des droits. À documenter par écrit avant
      mise en ligne publique.
- [ ] **Avenir : barème variable selon la session** — +3 / −1 en 2025, +1 / −1 en 2026,
      les deux énoncés dans les sujets officiels. Le schéma ne portant qu'un
      barème par concours × épreuve, c'est celui de 2026 qui s'applique à tout.
      Si l'écart devient gênant, il faudra une dimension année sur `baremes`.
- [ ] **Avenir : mathématiques, sciences et physique non transcrites** — leur
      notation scientifique ne survit pas à la linéarisation du texte et les
      figures sont absentes. PDF archivés, saisie manuelle à prévoir.

## Périmètre livré

Les neuf étapes du §12 sont faites : socle et RLS, landing et pages légales,
authentification avec parcours mineur et espace parent, back-office Annales,
import en masse et file de relecture, mode entraînement, tableau de bord,
sections Élèves et Pilotage avec exports, finitions et déploiement.

Hors périmètre V1, conformément au §3 : type `choix_multiple` (V1.5),
extraction automatique depuis les PDF (V1.5), mode Conditions réelles, type
`redaction`, générateur de variantes et sessions ciblées par chapitre (V2).
