---
id: MIG-001
title: Stratégie de migration vers la nouvelle architecture
type: strategy
status: approved
version: "1.0"
created: 2026-07-01
updated: 2026-07-01
owner: principal-architect
tags: [migration, architecture, stratégie, next-js]
depends_on: [CODE-001]
---

# MIG-001 — Stratégie de migration vers la nouvelle architecture

> Principe directeur : ne jamais casser ce qui fonctionne.
> Chaque phase produit un logiciel qui tourne.
> On migre composant par composant, pas feature par feature.

---

# Tableau de migration

## 🟢 CONSERVER — Compatible sans modification majeure

| Composant | Raison |
|---|---|
| **App Router (Next.js 16)** | Structurellement correct. Aucun conflit avec l'architecture cible. |
| **Authentification (Supabase Auth)** | Fonctionne. RLS en place. Aucune raison de changer. |
| **Upload (UploadZone + Supabase Storage)** | Mature, performant. Aucun conflit architectural. |
| **OCR / Extraction documentaire** | Pipeline multi-stratégies de qualité rare. Coût de reconstruction prohibitif. |
| **Spatial PDF parser** | Spécialisé, testé, 3942 lignes. Le remplacer prendrait des mois. Conserver tel quel. |
| **Design system** (`src/design-system/`) | Primitives propres, bien typées, sans dette architecturale. |
| **`fiscal-knowledge-rules.ts`** | C'est déjà l'Explanation Engine. Durées, templates, exemples — alignés avec les scripts EXP-F014-01 à 05. À promouvoir en Capability, pas à réécrire. |
| **IndexedDB (`db.ts`, offline-first pattern)** | Le mécanisme est solide. La structure des données devra évoluer (voir ADAPTER), pas l'infrastructure. |
| **Tests unitaires existants** (~15 fichiers .test.ts) | Couverture sur les parsers et les calculs. Précieuse. Conserver et étendre. |

---

## 🟡 ADAPTER — Valeur réelle, évolution nécessaire

| Composant | Ce qui doit changer |
|---|---|
| **Structure Next.js** | Réorganiser `(dashboard)/` : une route par Assistant (pas par thème). F-009 → `/assistants/activite`, etc. Garder App Router. |
| **Business Engine (Layers 0–6)** | Architecturalement juste, mais les outputs ne respectent pas encore les Contracts F-009→F-014. Adapter les types de retour pour produire `PlanAmortissement`, `ValidationAmortissements`… sans toucher à la logique de calcul. |
| **Calculation Engine** (`business-asset-engine.ts`) | `buildAmortizationSchedule()` est la bonne base. Ajouter : prorata temporis automatique, `ks_artifacts[]`, export vers `PlanAmortissement`. |
| **Explanation Engine** (`fiscal-decision-engine.ts` + `fiscal-knowledge-rules.ts`) | La logique existe. Wrapper en une Capability avec interface formelle : `explain(composant, context) → ExplanationBlock`. |
| **Validation Engine** | La validation documentaire existe (ValidationItem, LedgerEntry). Étendre pour couvrir la validation des Assistants (le "Je valide" de F-014). Même infrastructure, surface étendue. |
| **Supabase (schéma)** | 4 tables existantes sont correctes. Ajouter : `lmnp_dossiers`, `fiscal_years`, `properties`. Aligner le schéma avec les entités F-009→F-014. |
| **Types** (`domain.ts`) | 70% du chemin. Aligner `AmortissementComponent` avec `ComposantAmortissement` (ajouter `ks_artifacts`, `dotation_exercice`). Créer les types manquants par Contract. |
| **Services** (charges, revenus, crédit) | Pipelines fonctionnels. Les faire converger vers une interface Capability formelle progressivement — pas en une fois. |
| **API routes** | 8 routes existantes sont correctes fonctionnellement. Les faire exposer des contrats cohérents avec les Capabilities au fil des Assistants. Pas de refonte globale. |
| **IndexedDB** (`persistence.ts`, `PersistedWorkspace`) | Faire évoluer de "un blob monolithique" à "un blob par Assistant validé". Pas de changement d'infrastructure — changement de structure des données. |
| **Pages LMNP** (activite, logement, charges, revenus) | Les sujets sont bons. L'UX (formulaire + upload en parallèle) doit évoluer vers les patterns CAT-001 (dialogue guidé). Migration UX page par page. |
| **Formulaires existants** | Les champs et types sont corrects. La logique de présentation (linéaire / upload-first) doit évoluer vers le dialogue guidé. |
| **Hooks** (`useLmnpStore`, `useWorkspace`) | Réutilisables. Devront être étendus quand le modèle de données évolue. Pas de refonte à court terme. |
| **`AiActivityFeed`** | Concept valide (narration des actions AI). Déprioritiser l'UX, conserver la structure de données. Réexposer quand le Runtime Kernel existe. |

---

## 🔴 REMPLACER — Incompatible ou inexistant

| Composant | Pourquoi remplacer |
|---|---|
| **Runtime Kernel** | N'existe pas. Le construire selon A-002-R. Pas de base existante réutilisable — le pattern "interpréteur de graphe récursif" est absent du projet. |
| **Workflow Engine** | `workflow-progression.ts` est une liste de routes codées en dur. Remplacer par un séquenceur qui lit des définitions JSON et gère l'état de progression par dossier. |
| **Registry / CapabilityRouter** | N'existe pas. À construire. Le Registry est le hub central — aucune approximation existante ne peut servir de base. |
| **Contracts (TypeScript formels)** | Les types `domain.ts` existent mais ne sont pas organisés en Contracts par Feature. Créer un fichier `contracts/` par Assistant avec les Input/Output types formels. |
| **Providers** | Pattern absent. Les services existent mais ne sont pas encapsulés derrière une interface Provider. Construire au fil des Assistants. |
| **`AmortissementVentilationTable`** | Paradigme opposé à F-014. L'utilisateur édite les composants — F-014 dit que le système les calcule. Non récupérable. Remplacer par la vue CONCLUSION. |
| **`DeclarationDraft` (monolithe)** | 50 champs optionnels dans un seul objet. Remplacer progressivement par des structures typées par Assistant. Chaque Assistant valide produit son propre état. Pas de big-bang — remplacer champ par champ au fil des migrations. |
| **Fichiers debug/trace/instrumentation** (35 fichiers) | Aucune valeur utilisateur. Aucune valeur architecturale. Supprimer immédiatement. |
| **`revenus-mock.ts`** | Données de test dans le code de production. Supprimer. |
| **`logement-visual-isolation.tsx`, `logement-visual-tree.diff.ts`** | Artefacts de debugging visuel. Supprimer. |

---

# Roadmap technique

## Phase 0 — Hygiène (2 jours)

**Objectif :** rendre le projet travaillable. Aucune nouvelle feature. Aucune régression.

- Identifier et nommer le répertoire canonique (`fiscal-ai/`)
- Supprimer les 35 fichiers debug/trace/mock/instrumentation
- Supprimer `logement-visual-isolation.tsx`, `logement-visual-tree.diff.ts`
- Vérifier que le build passe après suppression
- Créer `src/lib/contracts/` (dossier vide — structure pour la suite)

**Livrable :** un projet propre qui tourne et se build sans warnings.

---

## Phase 1 — Fondations de données (3-5 jours)

**Objectif :** établir la source de vérité Supabase et les Contracts TypeScript.

- Ajouter les migrations Supabase manquantes : `lmnp_dossiers`, `fiscal_years`, `properties`
- Décider la stratégie de persistence : IndexedDB pour l'état courant, Supabase pour la persistence long terme
- Créer les Contracts TypeScript pour F-014 : `PlanAmortissement`, `ComposantAmortissement`, `LignePlan`, `ValidationAmortissements`
- Créer le barrel `src/lib/contracts/index.ts`

Aucune UI touchée. Aucune logique modifiée. Uniquement types + schéma.

**Livrable :** le projet compile avec les nouveaux types. Les Contracts de F-014 sont formellement définis.

---

## Phase 2 — Calculation Engine → F-014 (1 semaine)

**Objectif :** faire fonctionner F-014 de bout en bout.

- Adapter `business-asset-engine.ts` : ajouter `buildPlanAmortissement()` qui produit le `PlanAmortissement` du Contract
- Intégrer le prorata temporis dans le calcul
- Wrapper `fiscal-knowledge-rules.ts` en `ExplanationEngine` Capability (interface formelle)
- Remplacer `AmortissementVentilationTable` par la vue CONCLUSION (présentation + explication + validation)
- Brancher `ValidationEngine` sur la validation F-014

Toutes les autres pages restent intactes.

**Livrable :** F-014 fonctionne selon sa Definition of Done. Premier Assistant implémenté selon la nouvelle architecture.

---

## Phase 3 — Workflow Engine minimal (1 semaine)

**Objectif :** remplacer le séquenceur de routes codé en dur.

- Définir le format JSON de Workflow (simple : `{ steps: [{id, route, required, completedWhen}] }`)
- Écrire le Workflow pour F-009→F-014
- Implémenter un `WorkflowEngine` TypeScript qui lit ces JSONs et produit l'état de progression
- Remplacer `workflow-progression.ts` par ce moteur
- Le Dashboard reflète la progression réelle via le Workflow Engine

Pas encore le Runtime Kernel d'A-002-R. Un séquenceur pragmatique qui prépare le terrain.

**Livrable :** la progression des Assistants est pilotée par des JSONs déclaratifs, pas du code impératif.

---

## Phase 4 — Réalignement F-009 à F-013 (2-3 semaines)

**Objectif :** aligner chaque Assistant existant sur sa famille CAT-001.

Ordre imposé par les dépendances de données :

1. **F-009 (CONTEXTE)** — Transformer le formulaire Activité en dialogue guidé. Les champs existent, seule l'UX change.
2. **F-010 (CARACTÉRISATION — Construction)** — Transformer Logement en dialogue de description guidée avec Explanation Engine.
3. **F-011 (CARACTÉRISATION — Extraction)** — Crédit : conserver le pipeline OCR, transformer l'UX en extraction guidée.
4. **F-012 (COLLECTION OUVERTE)** — Charges : le scaffold existe (catégories). Formaliser le parcours par micro-flux.
5. **F-013 (RÉCONCILIATION)** — Revenus : introduire l'ancrage système avant la déclaration utilisateur.

Chaque Assistant est migré séparément. Les autres restent fonctionnels pendant la migration.

**Livrable :** F-009→F-013 conformes aux familles CAT-001. Le parcours complet fonctionne de bout en bout.

---

## Phase 5 — F-006 et calcul fiscal (1 semaine)

**Objectif :** implémenter le résultat fiscal selon le pattern CONCLUSION.

- `declaration-aggregation-engine.ts` produit `FiscalDeclaration` avec les données de F-009→F-014
- UX CONCLUSION pour le résultat fiscal (même pattern que F-014)
- Explanation Engine exposé sur chaque composante du résultat

**Livrable :** le dossier fiscal complet, calculable et validable.

---

## Phase 6 — Runtime Kernel (si justifié)

**Condition de déclenchement :** les phases 2-5 ont révélé des limitations du Workflow Engine minimal (gestion des suspensions, multi-dossiers, backtracking complexe).

Si la condition est remplie : introduire le Runtime Kernel selon A-002-R via le Strangler Kernel pattern. Les nouveaux Assistants passent par le Runtime. Les anciens restent sur le Workflow Engine jusqu'à migration.

Si la condition n'est pas remplie : le Workflow Engine minimal est suffisant pour le MVP. Reporter.

---

# Premier commit

**Le premier commit ne contient pas de nouvelle fonctionnalité.**

Il pose une déclaration d'intention.

```
chore: establish canonical project and define F-014 contracts

- Remove 35 debug/trace/mock/instrumentation files
- Create src/lib/contracts/ directory
- Add PlanAmortissement, ComposantAmortissement, LignePlan types
- Add ValidationAmortissements output type
- Update README with canonical architecture reference

These types formalize the contract between the Business Engine
and F-014. Nothing is implemented yet — but the interface is agreed.
```

**Pourquoi ce commit et pas un autre :**

Ce commit dit deux choses simultanément.

D'abord, il dit ce qu'on ne construira plus : les fichiers debug disparaissent, le projet s'allège, la dette visible est éliminée.

Ensuite, il dit ce qu'on va construire : les Contracts de F-014 sont formellement définis avant tout code. Toute l'équipe sait ce que le Business Engine doit produire et ce que la vue CONCLUSION doit consommer.

C'est un commit de 50 lignes de types TypeScript et une opération de suppression. Mais il crée l'alignement nécessaire à tout ce qui suit. Aucune régression possible — les types n'exécutent rien.

---

# Conclusion

Le projet existant n'est pas un fardeau — c'est un avantage.

Les pipelines d'extraction documentaire représentent des mois de travail précieux et directement réutilisables. Le Business Engine est architecturalement cohérent avec le Calculation Engine d'Obsidian. `fiscal-knowledge-rules.ts` est l'Explanation Engine — il existe déjà.

La migration n'est pas une réécriture. C'est une progression en six phases, dont chacune laisse le logiciel fonctionnel.

Le vrai travail de migration est dans la Phase 4 : réaligner l'UX des Assistants existants sur les familles CAT-001. C'est là que la valeur de la conception (F-009→F-014, CAT-001) se transforme en code.

La Phase 0 et la Phase 1 ne sont pas optionnelles. Un projet sans répertoire canonique et sans Contracts formels ne peut pas accueillir une équipe cohérente.

La Phase 6 (Runtime Kernel) est optionnelle pour le MVP. Elle sera nécessaire si le volume de dossiers, la complexité des workflows, ou le multi-bien exigent une orchestration que le Workflow Engine minimal ne peut pas assurer.
