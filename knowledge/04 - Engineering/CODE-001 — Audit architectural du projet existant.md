---
id: CODE-001
title: Audit architectural du projet existant
type: audit
status: approved
version: "1.0"
created: 2026-07-01
updated: 2026-07-01
owner: principal-architect
tags: [audit, architecture, code, next-js, supabase]
project_path: /Users/forniantoine/Documents/fiscal-ai.backup
last_commit: "89996b8 Fix Charges cinematic stall"
---

# CODE-001 — Audit architectural du projet existant

> Mission : comparer la réalité du code avec le modèle Obsidian.
> Approche : lecture d'architecte, pas de lecteur exhaustif.
> Aucune modification n'a été apportée au projet pendant cet audit.

---

# Préambule — État des projets

> **Résolu le 2026-07-04 :** le répertoire canonique est `/Users/forniantoine/Developer/fiscal-ai`. Corrigé dans `CLAUDE.md`. Les dossiers ci-dessous dans `Documents/` sont des copies obsolètes, non canoniques.

Le projet actif est introuvable à `/Users/forniantoine/Documents/fiscal-ai`. Trois copies existent :

| Dossier | Dernier commit | État |
|---|---|---|
| `fiscal-ai-backup` | `cb87e28` | N-1 |
| `fiscal-ai backup` | identique | Copie |
| `fiscal-ai.backup` | `89996b8` | **Le plus récent — référence de cet audit** |
| `fiscal-ai-mcp` | — | Serveur MCP séparé (non audité) |

**Action requise avant tout développement :** identifier et nommer le répertoire canonique du projet. ✅ Résolu.

---

# 1. Cartographie du projet

## Stack technique

- **Framework :** Next.js 16.2.6 (App Router, React 19, TypeScript strict)
- **Auth + BDD :** Supabase (supabase-js 2.x)
- **IA :** OpenAI (GPT-4o via API directe)
- **PDF :** pdf-parse + pdfjs-dist (parsing spatial + GPT)
- **Excel :** xlsx (relevés bancaires)
- **Persistence client :** IndexedDB (offline-first)
- **UI :** Tailwind 4 + design system custom

## Structure `src/`

```
src/
├── app/
│   ├── (dashboard)/          ← 7 pages : activite, logement, revenus,
│   │   │                        charges, amortissements, declarations, dashboard
│   │   ├── DashboardShell.tsx
│   │   └── layout.tsx
│   ├── api/lmnp/             ← Routes Next.js (extraction, OCR, classification)
│   │   ├── activite/extract/
│   │   ├── credit/extract/
│   │   ├── logement/extract/ (+ extract-vision)
│   │   ├── revenus/extract/
│   │   ├── ocr/ (+ vision-text)
│   │   ├── classification-review/
│   │   └── extract/          ← Route générique
│   ├── connexion/, login/, signup/, inscription/
│   └── page.tsx              ← Landing page
│
├── components/
│   ├── lmnp/                 ← Tous les composants métier
│   │   ├── activite/         ← 6 composants
│   │   ├── amortissement/    ← 7 composants (incl. table éditable)
│   │   ├── charges/          ← 4 composants
│   │   ├── credit/           ← 4 composants
│   │   ├── dashboard/        ← 8 composants + workflow-progression.ts
│   │   ├── design-system/    ← 10 primitives lmnp-specific
│   │   ├── documents/        ← 15 composants (tunnel documents)
│   │   ├── logement/         ← 6 composants
│   │   ├── revenus/          ← 6 composants
│   │   ├── validation/       ← 8 composants
│   │   ├── validation-workflow/ ← 8 composants
│   │   └── ai-activity/      ← 6 composants (feed narratif)
│   └── landing/              ← 4 composants landing page
│
├── design-system/
│   ├── components/           ← 8 primitives (Button, Card, Input…)
│   ├── layouts/              ← WorkflowLayout, GuidedStep
│   └── theme/                ← colors, spacing, typography, radius, motions
│
└── lib/
    ├── ai/                   ← classify-document, extract-document, extractors
    ├── documents/            ← extractors, gpt, normalizers, ocr, pipelines
    ├── lmnp/
    │   ├── engine/           ← Business Engine (Layers 0–6)
    │   ├── ocr/              ← map-to-extractions
    │   ├── parsers/          ← spatial-amortization-core.ts (3942 lignes)
    │   ├── services/         ← 50+ fichiers de services métier
    │   │   └── charges/      ← 20+ fichiers dédiés aux charges
    │   ├── store/            ← reducer.ts, db.ts, persistence.ts, provider.tsx
    │   ├── types/            ← domain.ts, field-keys.ts, values.ts…
    │   └── validation/       ← display.ts, grouping.ts
    ├── storage/              ← sanitize-storage-filename
    └── supabase*.ts          ← clients Supabase (server + browser)
```

## Architecture état (State Management)

**Source de vérité client :** IndexedDB via `PersistedWorkspace` (un objet de ~15 clés top-level).

**Synchronisation Supabase :** partielle — 4 tables migrées : `extracted_document_data`, `work_groups`, `business_assets`, `classification_versions`. Les documents sont uploadés en Storage Supabase.

**Pattern :** reducer Redux-like (1219 lignes) + Context React. Pas de Zustand, pas de Jotai.

## Business Engine — Découverte majeure

La structure la plus importante du projet :

```
Layer 0 — page-segmentation.ts       (pages pertinentes vs. bruit)
Layer 1 — ExtractedAccountingFact    (faits comptables depuis documents)
Layer 2 — work-group-engine.ts       (regroupement chantiers)
Layer 3 — business-asset-engine.ts   (actifs confirmés)
Layer 4 — fiscal-decision-engine.ts  (traitement fiscal)
Layer 5 — AmortizationSchedule       (plan d'amortissement)
Layer 6 — declaration-aggregation-engine.ts (déclaration consolidée)
```

Ce moteur est partiellement implémenté mais architecturalement cohérent. C'est l'équivalent fonctionnel du Calculation Engine décrit dans Obsidian.

---

# 2. Niveau de maturité

| Composant | Statut | Commentaire |
|---|---|---|
| **UI / Design system** | 🟢 mature | Design system custom solide, composants réutilisables |
| **Authentication (Supabase)** | 🟢 mature | Auth fonctionnelle, RLS en place |
| **Upload documents** | 🟢 mature | UploadZone, Storage Supabase, IndexedDB blobs |
| **OCR / Extraction (PDF)** | 🟢 mature | Pipelines GPT + spatial. Multi-stratégies par type de doc |
| **Revenus pipeline** | 🟢 mature | 15+ fichiers, gestion relevés/Excel/GPT, supervision |
| **Charges pipeline** | 🟢 mature | Détection assurance, copro, taxe foncière, orchestration |
| **Crédit pipeline** | 🟢 mature | GPT + spatial, gestion échéanciers, conflits |
| **Business Engine (calcul)** | 🟡 partiellement mature | Layers 0–5 présents, layer 6 (déclaration) partiel |
| **Workflow (séquençage)** | 🟡 partiellement mature | Progression codée en dur dans workflow-progression.ts |
| **Supabase schema** | 🟡 partiellement mature | 4 tables seulement — modèle incomplet |
| **Amortissement (UX)** | 🟡 partiellement mature | Table éditable existante — paradigme différent de F-014 |
| **Validation Engine** | 🟡 partiellement mature | Validation documents OK, validation Assistants absente |
| **Explanation Engine** | 🟡 partiellement mature | fiscal-knowledge-rules.ts présent, pas encore exposé en UX |
| **Runtime Kernel** | 🔴 absent | Aucun interpréteur, aucun workflow JSON, aucune ExecutionContext |
| **Registry / CapabilityRouter** | 🔴 absent | Concept Obsidian inexistant dans le code |
| **Capability Layer** | 🔴 absent | Pas d'interface Capability, pas de Provider pattern |
| **Workflow JSON** | 🔴 absent | Les workflows sont des fonctions TS, pas des graphes déclaratifs |
| **Calculation Engine (F-014)** | 🔴 absent | business-asset-engine existe mais n'expose pas PlanAmortissement |

---

# 3. Correspondance avec Obsidian

## Runtime (A-002 / A-002-R)

🔴 **Divergence**

Le Runtime Kernel — interpréteur de graphes Workflow — n'existe pas. La navigation entre les étapes est gérée par `workflow-progression.ts` (une liste ordonnée de routes codées en dur) et par l'état dans `DeclarationDraft`. Il n'y a pas d'ExecutionContext, pas de RecursiveLoop, pas de CapabilityResult.

**Nature de l'écart :** pas une erreur — le Runtime n'a pas encore été conçu dans le code.

## Capabilities

🔴 **Divergence**

Les Capabilities (ExplanationEngine, ValidationEngine, CalculationEngine) sont des concepts Obsidian. Dans le code, ce sont des fonctions TypeScript dispersées dans `lib/lmnp/engine/` et `lib/lmnp/services/`. Il n'y a pas de contrat d'interface Capability, pas de Registry qui route vers des Providers.

**Ce qui existe en approximation fonctionnelle :**
- `ExplanationEngine` ≈ `fiscal-knowledge-rules.ts` (templates d'explication par catégorie)
- `CalculationEngine` ≈ `business-asset-engine.ts` + `declaration-aggregation-engine.ts`
- `ValidationEngine` ≈ reducer actions VALIDATION_* + LedgerEntry

**Nature de l'écart :** fonctions vs. contrats — même sémantique, pas la même architecture.

## Contracts (F-009 → F-014)

🟡 **Partiellement conforme**

Le type `AmortissementComponent` dans `domain.ts` correspond à environ 70% du `ComposantAmortissement` défini dans F-014. La structure `AmortissementVentilationData` est cohérente.

**Ce qui manque :**
- `ks_artifacts[]` (traçabilité KS → code)
- `dotation_exercice` vs `annualAmortization` (le prorata temporis n'est pas calculé automatiquement)
- Pas de type `PlanAmortissement` correspondant à l'Input Contract de F-014
- Pas de type `ValidationAmortissements` correspondant à l'Output Contract

**Nature de l'écart :** les types existants sont proches mais ne respectent pas les contrats formels de F-014.

## Features (F-009 à F-014)

🟡 **Partiellement conforme — avec une divergence paradigmatique sur F-014**

Les pages existantes (activite, logement, crédit, revenus, charges, amortissements) couvrent les mêmes sujets que F-009→F-014. Le parcours utilisateur existe.

**Divergence paradigmatique :** l'amortissement existant (`AmortissementVentilationTable`) est une table éditable — l'utilisateur modifie les composants manuellement. F-014 dit que le système calcule tout et l'utilisateur valide. Ces deux approches sont structurellement opposées.

**Les autres étapes** (activite, logement, crédit, revenus, charges) ont une UX mixte upload+formulaire qui n'est pas le dialogue guidé des familles CONTEXTE / CARACTÉRISATION. Ce n'est pas faux — c'est différent.

## Architecture générale

🟡 **Partiellement conforme**

Le principe "KS → Architecture → Code" est respecté dans l'esprit (les règles métier sont dans des fichiers dédiés : fiscal-knowledge-rules, business-asset-engine). Mais la forme est celle d'un monolithe orienté document, pas d'un système d'assistants guidés par des workflows.

---

# 4. Ce qui est réutilisable

## 🟢 Réutilisable tel quel

**Design system** (`src/design-system/`)
Composants propres, themés, bien typés. Button, Card, Input, ProgressBar, UploadZone, WorkflowLayout. Réutilisable pour tous les Assistants.

**Pipelines OCR/extraction** (`src/lib/documents/`, `src/lib/lmnp/services/`)
Les pipelines revenus, charges, crédit, logement sont matures et sophistiqués. Multi-stratégies (GPT + spatial + heuristiques). Conserver absolument.

**Spatial PDF parser** (`src/lib/lmnp/parsers/spatial-amortization-core.ts`)
Parser bas-niveau spécialisé pour les tableaux d'amortissement bancaires. Rare et coûteux à reconstruire.

**Supabase auth + storage** (`src/lib/supabase*.ts`)
Auth fonctionnelle, RLS en place, Storage configuré. Réutilisable sans modification.

**IndexedDB persistence** (`src/lib/lmnp/store/db.ts`, `persistence.ts`)
Pattern offline-first solide. Réutilisable mais devra être étendu pour les nouvelles structures de données.

**fiscal-knowledge-rules.ts** (`src/lib/lmnp/engine/fiscal-knowledge-rules.ts`)
Équivalent de l'Explanation Engine pour les composants. Durées par catégorie, templates d'explication, exemples. C'est précisément ce que F-014 attend. Réutilisable directement comme base de l'Explanation Engine.

**business-asset-engine.ts** (calcul d'amortissement)
`buildAmortizationSchedule()` et `getAnnualAmortizationForYear()` sont implémentés. Durées par catégorie codées. Réutilisable comme Calculation Engine de base.

**Domain types** (`src/lib/lmnp/types/domain.ts`)
743 lignes de types TypeScript bien documentés. Couvre la majorité du domaine. Point de départ pour les Contracts F-009→F-014.

## 🟡 Réutilisable après adaptation

**Composants UI des Assistants** (activite, logement, charges, revenus)
Les pages existent. L'UX devra être réalignée sur les familles CAT-001 (plus guidée, moins formulaire). La structure des composants est un point de départ, pas une référence.

**workflow-progression.ts**
La séquence des étapes et les labels sont corrects. Le mécanisme de progression (codé en dur) devra être remplacé par le Workflow Engine, mais les données sont récupérables.

**Reducer / Actions**
La liste des actions (DECLARATION_PATCH_DRAFT, APPLY_GOVERNED_EXTRACTION…) documente ce que le système doit faire. Réutilisable comme inventaire fonctionnel, pas comme architecture cible.

---

# 5. Ce qui est probablement de la dette

## 🔴 Dette probable

**`spatial-amortization-core.ts` — 3942 lignes**
Un seul fichier de 4000 lignes contenant la logique de parsing spatial. Difficile à maintenir, trop couplé. Fonctionnel mais fragile.

**`AmortissementVentilationTable.tsx` — table éditable**
Paradigme opposé à F-014. L'utilisateur modifie les composants manuellement. Ce composant ne survivra pas à l'implémentation de F-014 sans refonte complète.

**Fichiers debug/trace/instrumentation** (~20 fichiers)
`revenus-runtime-trace.ts`, `insurance-runtime-debug.ts`, `logement-pipeline-trace.ts`, `credit-render-unblock-trace.ts`, `visual-debug.ts`, `frozen-tunnel-step.tsx`, `logement-visual-isolation.tsx`…
Ces fichiers témoignent de nombreux incidents de debugging passés. Présence dans le codebase de production = dette certaine.

**`revenus-mock.ts`**
Données mock encore présentes dans `src/lib/lmnp/services/`. Signe d'un développement non nettoyé.

**`DeclarationDraft` monolithique**
Un seul objet de ~50 champs optionnels persiste tout l'état de l'étape de conception. Difficile à faire évoluer sans risque de régression. La migration vers des structures per-assistant sera coûteuse.

## 🟡 Point de vigilance

**Double persistence : IndexedDB + Supabase**
L'état vit dans IndexedDB (client) et est partiellement synchronisé dans Supabase. Il n'y a pas de source de vérité unique. Ce n'est pas encore un problème, mais le premier incident de désynchro le rendra critique.

**`CreditDocumentStep.tsx` — 1983 lignes**
Le composant le plus long. Mélange UX, logique métier, gestion d'état. Indicateur de couplage fort.

**Multiples dossiers backup sans projet canonique**
Risque de développer dans la mauvaise copie. Action immédiate requise.

---

# 6. Ce qui manque par rapport au modèle Obsidian

| Absent | Description |
|---|---|
| **Runtime Kernel** | Interpréteur de workflow (A-002-R). ExecutionContext, CapabilityResult, RecursiveLoop. |
| **Registry / CapabilityRouter** | Service qui route les requêtes vers les Providers selon la Capability demandée. |
| **Workflow JSON** | Les workflows sont des fonctions TypeScript, pas des graphes déclaratifs consommables par un Runtime. |
| **Capability interfaces** | Pas de contrat TypeScript `type ExplanationEngineCapability`, `type ValidationEngineCapability`… |
| **PlanAmortissement (F-014 input)** | Le type n'existe pas. `AmortissementComponent[]` en est proche mais incomplet (prorata, ks_artifacts, plan pluriannuel). |
| **ValidationAmortissements (F-014 output)** | Le type n'existe pas. |
| **Prorata temporis automatique** | La logique existe dans `business-asset-engine` mais n'est pas exposée proprement. |
| **Supabase schema complet** | Tables manquantes : `lmnp_dossiers`, `fiscal_years`, `properties`, `assistants_state`. |
| **Traceability KS → code** | `ks_artifacts[]` absent de tous les types. Aucune référence au KS dans le code. |
| **F-014 UX (CONCLUSION pattern)** | Le composant existant demande à l'utilisateur de configurer. F-014 dit : le système calcule, l'utilisateur valide. |

---

# 7. Dépendances critiques

## Si le Calculation Engine ne produit pas `PlanAmortissement`

→ F-014 ne peut pas ouvrir. Son Input Contract n'est pas satisfait.

**Ce qui bloque en cascade :** F-006 (Calcul fiscal) qui consomme le résultat de F-014.

**État actuel :** `business-asset-engine.ts` calcule des `AmortizationSchedule` par asset, mais ne consolide pas un `PlanAmortissement` dans le format attendu par F-014. Adaptation nécessaire, pas réécriture.

## Si le schéma Supabase est incomplet

→ La persistence multi-session est impossible. Chaque rechargement risque de perdre l'état.

**État actuel :** 4 tables seulement. Il manque les tables structurantes (`lmnp_dossiers`, `fiscal_years`, `properties`). L'état vit principalement en IndexedDB.

## Si le projet canonique n'est pas identifié

→ Tout travail dans Cursor risque d'être fait dans la mauvaise copie.

**Action bloquante n°1 avant tout développement.**

## Si la divergence paradigmatique de l'amortissement n'est pas résolue

→ F-014 ne peut pas être implémentée par-dessus le composant existant. Le refactor du composant amortissement est une dépendance directe.

---

# 8. Ordre d'implémentation recommandé

L'ordre suit le principe : réduire le risque technique avant d'ajouter de la valeur.

## Étape 0 — Fondations (avant tout développement)

1. **Identifier le projet canonique.** Nommer le répertoire. Supprimer ou archiver les copies.
2. **Compléter le schéma Supabase.** Ajouter `lmnp_dossiers`, `fiscal_years`, `properties`. Aligner avec le modèle de données des Features.
3. **Définir la stratégie de persistence.** IndexedDB (offline-first) ou Supabase-first ? Les deux avec quelle synchronisation ? Décision technique à prendre avant d'écrire une ligne.

*Durée estimée : 3-5 jours.*

## Étape 1 — Adapter le Calculation Engine pour F-014

Le Business Engine existe. Il faut le faire produire `PlanAmortissement` dans le format attendu par F-014 :
- `dotation_exercice` (avec prorata temporis)
- `plan_pluriannuel[]`
- `ks_artifacts[]` (traçabilité)

C'est une adaptation, pas une réécriture. `buildAmortizationSchedule()` est la base.

*Pourquoi en premier :* F-014 est le plus simple à implémenter (CONCLUSION — pas de collecte) et valide immédiatement si le Calculation Engine fonctionne.

## Étape 2 — F-014 UX (CONCLUSION pattern)

Remplacer `AmortissementVentilationTable` (éditable) par la vue CONCLUSION (présentation + explication + validation). `fiscal-knowledge-rules.ts` est déjà l'Explanation Engine — il suffit de l'exposer en UX.

*Pourquoi avant les autres Assistants :* c'est le premier cas empirique de la famille CONCLUSION. Sa réussite confirme le pattern pour F-006.

## Étape 3 — Workflow Engine minimal

Pas le Runtime Kernel complet d'A-002-R. Un séquenceur suffisant pour enchaîner F-009→F-014 avec état persisté et navigation conditionnelle. Peut rester en TypeScript simple — le Runtime Kernel est une évolution, pas un prérequis.

## Étape 4 — Réalignement F-009 à F-013

Adapter les UX existantes (activite, logement, crédit, revenus, charges) aux familles CAT-001. L'ordre suit la dépendance des données : F-009 → F-010 → F-011 → F-012 → F-013.

## Étape 5 — F-006 (Calcul fiscal)

Le moteur de calcul existe déjà (`declaration-aggregation-engine.ts`). L'étape est principalement UX : présenter le résultat fiscal selon le pattern CONCLUSION.

## Étape 6 — Runtime Kernel (si nécessaire)

À ce stade, si les étapes 1-5 ont révélé des limitations du séquenceur minimal, introduire le Runtime Kernel selon A-002-R via le Strangler Kernel pattern (A-001 révisé).

---

# 9. Risques

| Risque | Niveau | Commentaire |
|---|---|---|
| **Projet développé dans la mauvaise copie** | 🟢 résolu (2026-07-04) | Répertoire canonique identifié : `/Users/forniantoine/Developer/fiscal-ai`, corrigé dans CLAUDE.md. |
| **Divergence paradigmatique amortissement** | 🔴 fort | L'UX existante est structurellement opposée à F-014. Refactor obligatoire, non optionnel. |
| **Désynchro IndexedDB / Supabase** | 🟡 moyen | Deux sources de vérité client. Le premier bug de synchro sera critique. |
| **`spatial-amortization-core.ts` (3942 lignes)** | 🟡 moyen | Fichier fragile. Toute modification est risquée. Tester avant de toucher. |
| **Absence de schéma Supabase complet** | 🟡 moyen | La persistence multi-session est incomplète. Bloque le passage en production. |
| **Couplage fort dans les gros composants** | 🟡 moyen | `CreditDocumentStep` (1983 lignes), `reducer.ts` (1219 lignes). Difficiles à modifier sans régression. |
| **Fichiers debug en production** | 🟢 faible | Bruit, pas de risque fonctionnel. À nettoyer mais non bloquant. |
| **Absence de Runtime Kernel** | 🟢 faible | Pas nécessaire pour les premières Features. Risque différé. |

---

# 10. Verdict

**Réponse : B — Oui, mais une courte étape de préparation est nécessaire.**

Le projet contient une substance technique réelle et de qualité. Les pipelines d'extraction documentaire sont matures et représentent des mois de travail qu'il ne faut pas jeter. Le Business Engine (Layers 0–6) est architecturalement cohérent avec le Calculation Engine d'Obsidian. Le design system est propre et utilisable.

**Ce qui me retient de répondre A :**

Trois blocages immédiats empêchent de commencer à coder aujourd'hui :

1. **Aucun répertoire canonique.** Je ne sais pas dans quel dossier travailler. Ce risque est critique — tout développement dans la mauvaise copie est perdu.

2. **Divergence paradigmatique sur l'amortissement.** L'UX existante est l'opposé de F-014. On ne peut pas construire F-014 par-dessus sans refactor. Ce n'est pas une correction mineure — c'est un changement de paradigme.

3. **Schéma Supabase incomplet.** Les tables structurantes (`lmnp_dossiers`, `fiscal_years`, `properties`) n'existent pas dans les migrations. La persistence multi-session est incomplète.

**Ce que la préparation doit produire :**

- Un répertoire canonique identifié et versionné
- Une décision sur la stratégie de persistence (IndexedDB / Supabase / hybride)
- Le schéma Supabase complet pour les entités F-009→F-014
- `PlanAmortissement` produit par le Business Engine (adaptation, pas réécriture)

**Durée estimée de la préparation : 3 à 5 jours.**

Après ces 5 jours, F-014 peut être implémentée directement dans Cursor en s'appuyant sur ce qui existe déjà.

---

# Annexe — Statistiques projet

| Métrique | Valeur |
|---|---|
| Fichiers TypeScript/TSX | ~280 fichiers |
| Lignes de code total | ~90 000 lignes |
| Fichiers engine/ | 14 fichiers |
| Fichiers services/ | 55+ fichiers |
| Migrations Supabase | 4 |
| Routes API | 8 |
| Composants UI métier | ~80 composants |
| Tests unitaires identifiés | ~15 fichiers .test.ts |
