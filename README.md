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
```

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

- [ ] **Barèmes** — tous enregistrés sans source ni date de vérification. Le §2
      impose de les relever sur le règlement officiel de chaque session avant
      qu'un élève voie une note. Écran : back-office → Barèmes et seuils.
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

## Périmètre livré

Les neuf étapes du §12 sont faites : socle et RLS, landing et pages légales,
authentification avec parcours mineur et espace parent, back-office Annales,
import en masse et file de relecture, mode entraînement, tableau de bord,
sections Élèves et Pilotage avec exports, finitions et déploiement.

Hors périmètre V1, conformément au §3 : type `choix_multiple` (V1.5),
extraction automatique depuis les PDF (V1.5), mode Conditions réelles, type
`redaction`, générateur de variantes et sessions ciblées par chapitre (V2).
