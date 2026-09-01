---
id: ADR-003
title: Suppression du registre générique de Capabilities
type: adr
status: approved
version: "1.1"
created: 2026-07-01
updated: 2026-07-02
owner: product-owner
tags: [adr, capabilities, registry, architecture, workflow-engine]
triggers: [Sprint-2, F-010]
engines_concernés: [ENG-001, ENG-007]
related: [ARCH-001, MIG-001, CODE-001, DIR-002]
---

# ADR-003 — Suppression du registre générique de Capabilities

---

# Statut

✅ **Approuvé** — Décision effective à partir de la Phase 2 de MIG-001.

---

# Contexte

Lors de l'audit CODE-001 et de la stratégie MIG-001, l'absence d'un Registry de Capabilities avait été identifiée comme un manque. MIG-001 plaçait "Registry / CapabilityRouter" dans la colonne REMPLACER avec la note : "à construire — le Registry est le hub central, aucune approximation existante ne peut servir de base."

Cette décision reposait sur l'hypothèse que les Assistants futurs auraient besoin d'un mécanisme de sélection dynamique des Capabilities à l'exécution.

Le Sprint 2 (implémentation de F-010 — Assistant Logement) a fourni le premier test empirique de cette hypothèse.

---

# Hypothèse invalidée

**Hypothèse initiale :** Les Capabilities doivent être enregistrées dans un registre central (`Map<string, Capability>`) et invoquées via une interface générique (`execute(input: unknown): unknown`) identifiée par un string ID. Ce pattern permettrait au Workflow Engine de router dynamiquement vers la Capability appropriée sans connaître son implémentation.

**Ce que le Sprint 2 a observé :**

1. Les IDs string n'ont à aucun moment été utilisés pour sélectionner une Capability à l'exécution. L'ID était créé à l'enregistrement mais jamais consommé au runtime.

2. Le `execute(input: unknown): unknown` a imposé des casts `unknown/as O` dans toutes les Capabilities implémentées. Ces casts ne sont pas des erreurs d'implémentation — ils sont la conséquence inévitable d'un contrat générique appliqué à des fonctions qui ont des types précis.

3. Les Transformations du KS (TRF-0001, TRF-0002, TRF-0009…) sont des règles métier avec des inputs et des outputs formellement typés dans le KS. Les encapsuler dans un `execute(): unknown` générique détruisait exactement le bénéfice que les Contracts formels devaient apporter.

4. Le seul noyau identifié comme réutilisable après le Sprint sont les contrats eux-mêmes (`Anomaly`, `FieldSource`) — pas le mécanisme de Registry.

**Pourquoi ce résultat n'était pas prévisible avant l'implémentation :**

MIG-001 a été rédigé avant qu'un seul Assistant soit implémenté. L'hypothèse du Registry était raisonnable sur le papier — elle s'inspirait du pattern Provider classique (plusieurs implémentations d'une même interface, sélection à l'exécution). En l'absence de preuve empirique, elle ne pouvait pas être invalidée par le raisonnement seul.

La Sprint Review de F-010 est la preuve empirique que DIR-002 autorise et encourage.

---

# Ce que la revue adversariale a testé

Avant de valider cette décision, les cas les plus complexes ont été testés :

**Test 1 — F-012 (COLLECTION OUVERTE, cardinalité variable) :** la qualification de chaque transaction (charge déductible / composant / non déductible) selon son type nécessite-t-elle un routing dynamique ? Non — c'est un branchement prédicatif sur un type énuméré (`switch(lineType)`), pas un lookup dans un Map. ADR-001 confirme cette analyse : la classification transactionnelle produit un `line_type` ; la Transformation applicable à ce type est sélectionnée par la logique du Workflow, pas par un Registry.

**Test 2 — F-006 (CONCLUSION fiscale, agrégation de F-009→F-014) :** l'agrégation de résultats hétérogènes requiert-elle un dispatch dynamique ? Non — la structure des inputs est toujours la même (`PlanAmortissement + Revenus + Charges + Intérêts`). La fonction `computeFiscalResult(inputs: FiscalInputs)` est appelée directement. Pas de Registry.

**Test 3 — Futur : plusieurs implémentations d'un même Engine (exemple : deux providers OCR) :** ce cas réel nécessiterait un Registry. Il n'a été rencontré dans aucun Assistant conçu à ce jour. Conformément à DIR-001, une abstraction non requise par un besoin réel n'est pas introduite. Si ce cas se présente, le Registry sera introduit à ce moment, sur un périmètre précis.

**Verdict :** aucun des Assistants conçus (F-009 à F-014) ni des futurs anticipés (F-006) ne justifie un routing dynamique par ID à l'exécution.

---

# Décision

Le registre générique de Capabilities (`Map<string, Capability>` + `execute(input: unknown): unknown` + string IDs) est **supprimé**.

Il n'est remplacé par aucun mécanisme d'infrastructure de même nature.

---

# Architecture de remplacement

## Ce qui est conservé

**Les contrats TypeScript formels par Engine.**

Chaque Engine expose une interface précisément typée. Ce sont ces interfaces — pas le Registry — qui constituent la valeur architecturale. Elles documentent ce que le Workflow Engine peut appeler et ce qu'il recevra en retour.

```typescript
// Format cible — un fichier par Engine dans src/lib/contracts/engines/

// Calculation Engine
type CalculationInput<T> = { data: T; context: WorkflowContext }
type CalculationOutput<R> = { result: R; ksArtifacts: string[]; computedAt: string }
type CalculationFn<I, O> = (input: CalculationInput<I>) => Promise<CalculationOutput<O>>

// Explanation Engine
type ExplanationInput = { composant: ComposantAmortissement; context: ExerciceContext }
type ExplanationOutput = { texte: string; source: string }
type ExplanationFn = (input: ExplanationInput) => ExplanationOutput

// Validation Engine
type ValidationInput<T> = { data: T; rules: ValidationRule[] }
type ValidationOutput = { valid: boolean; anomalies: Anomaly[] }
type ValidationFn<T> = (input: ValidationInput<T>) => ValidationOutput
```

**Les types de domaine partagés (`Anomaly`, `FieldSource`, `WorkflowContext`).**

Ces types ne dépendent d'aucun Registry. Ils circulent entre les fonctions. Ils sont le vocabulaire commun.

## Ce qui change

**Le Workflow Engine n'appelle pas `registry.execute(id, input)`.**

Il appelle les fonctions directement, avec des types explicites :

```typescript
// Avant (pattern invalidé)
const result = await registry.execute('calculation:prix-revient', input)

// Après (pattern cible)
const prixRevient = await computePrixRevient(input) // TRF-0001
const ventilation = await computeVentilationTerrainBati(prixRevient, context) // TRF-0002
const plan = await buildPlanAmortissement(ventilation, durees) // TRF-0009→TRF-0014
```

**Les Transformations sont des fonctions pures exportées depuis `src/lib/transformations/`.**

Chaque Transformation correspond à une TRF-xxxx du KS. Elle prend des inputs typés et retourne un output typé. Elle n'est pas enregistrée — elle est importée directement.

```typescript
// src/lib/transformations/trf-0001-prix-revient.ts
export function computePrixRevient(inputs: PrixRevientInputs): PrixRevientResult {
  // implémentation de TRF-0001
}
```

**La composition est explicite dans chaque Workflow.**

Le Workflow F-010 importe et compose `computePrixRevient`, `computeVentilation`, `buildPlanAmortissement`. Il est lisible, traçable, et typé sans cast.

---

# Ce qui ne change pas

Ces éléments restent inchangés par cette décision :

**1. La séparation des Engines (ARCH-001).**
Les 8 Engines conservent leurs responsabilités distinctes. La décision concerne le mécanisme d'invocation, pas la séparation des responsabilités.

**2. Le rôle du Workflow Engine.**
Il orchestre toujours la progression du dossier. Il déclenche toujours les Engines dans le bon ordre. Il ne fait toujours aucun traitement métier. Ce qui change : il appelle les fonctions directement au lieu de passer par un Registry.

**3. Les contrats formels entre Engines.**
Les interfaces TypeScript par Engine sont maintenues et étendues. La décision supprime le mécanisme générique de Registry — pas les types formels qui définissent ce que chaque Engine produit et consomme.

**4. Les Contracts de Features (F-009→F-014).**
`PlanAmortissement`, `ValidationAmortissements`, `ComposantAmortissement` restent inchangés. Ces types sont définis dans `src/lib/contracts/` et ne dépendaient pas du Registry.

**5. La règle de MIG-001 sur les Providers.**
Si dans le futur plusieurs implémentations d'un même Engine coexistent (deux OCR providers, deux Explanation providers selon le contexte), un mécanisme de sélection sera introduit à ce moment. Ce mécanisme sera ciblé, typé, et justifié par un besoin réel — pas anticipé pour un besoin hypothétique.

---

# Règles effectives pour les prochains Assistants

Ces règles s'appliquent immédiatement à partir de F-011 et à tous les Assistants suivants.

**Règle 1 — Chaque Transformation du KS est une fonction pure.**

Une Transformation (TRF-xxxx) s'implémente comme `function trf_xxxx(inputs: TInputs): TOutput`. Elle est placée dans `src/lib/transformations/`. Elle est importée directement par le Workflow qui en a besoin.

**Règle 2 — Le Workflow Engine compose explicitement.**

Le fichier de Workflow d'un Assistant importe les Transformations et Engines qu'il utilise. La lecture du fichier doit permettre de reconstituer la séquence exacte de TRF-xxxx exécutées, sans indirection.

**Règle 3 — Les Engines ont des interfaces TypeScript formelles.**

Chaque Engine expose son interface dans `src/lib/contracts/engines/`. Ces interfaces sont la documentation vivante de ce que le Workflow peut appeler. Elles ne sont pas génériques — elles sont précisément typées par domaine.

**Règle 4 — Aucun cast `unknown` dans les Engines.**

Un cast `unknown` dans un Engine est un signal d'alarme. Il indique soit une interface mal conçue, soit une composition incorrecte. Il doit être résolu par un meilleur typage, jamais accepté.

**Règle 5 — La sélection dynamique requiert une justification.**

Si un futur Assistant nécessite de sélectionner une implémentation à l'exécution (et pas seulement un branchement prédicatif), ce besoin est documenté dans une observation, challengé selon le filtre DIR-001, et introduit uniquement si le développement est réellement bloqué sans lui.

---

# Impact sur MIG-001

La phrase suivante de MIG-001 est **modifiée** par cette décision :

> *"Registry / CapabilityRouter — N'existe pas. À construire. Le Registry est le hub central — aucune approximation existante ne peut servir de base."*

**Nouvelle position :** supprimé de la colonne REMPLACER. Le Registry n'est plus à construire. Les contrats formels par Engine (colonne ADAPTER) subsistent et remplacent fonctionnellement le besoin que le Registry devait adresser.

---

# Validation empirique

ADR-003 a été prise après un seul Sprint (F-010). Elle reposait sur une analyse adversariale des Assistants futurs, mais n'avait pas encore de confirmation multi-cycle.

Les trois Feature Cycles suivants ont depuis été implémentés sans modifier l'architecture définie par cette ADR :

| Feature | Famille | Complexité structurelle | Évolution architecturale |
|---|---|---|---|
| F-010 — Assistant Logement | CARACTÉRISATION (Construction) | Workflow linéaire, inputs finis | Aucune |
| F-011 — Assistant Financement | CARACTÉRISATION (Extraction) | Extraction documentaire, inputs finis | Aucune |
| F-012 — Assistant Charges | COLLECTION OUVERTE | Cardinalité variable, qualification transactionnelle | Aucune |

## Pourquoi F-012 est le cas décisif

F-012 était le contre-exemple le plus probable à ADR-003. La COLLECTION OUVERTE est la famille structurellement la plus complexe implémentée à ce jour : cardinalité inconnue, qualification individuelle de chaque transaction, scaffold par catégories, micro-flux hétérogènes.

C'est précisément le type de cas pour lequel le routing dynamique aurait pu sembler justifié : la qualification d'une ligne "fonds de travaux ALUR" vs "provision courante" vs "régularisation annuelle" pourrait appeler une Transformation différente.

En pratique, F-012 a résolu cette sélection par un branchement prédicatif typé — sans Registry, sans `execute(unknown)`, sans string ID. La Transformation applicable à chaque type de ligne est sélectionnée par la logique du Workflow, qui connaît statiquement les types possibles. TypeScript garantit l'exhaustivité du branchement.

## Conclusion de la validation

La série F-010 / F-011 / F-012 couvre les trois familles d'Assistants les plus représentatives pour l'enjeu du routing de Capabilities :

- F-010 : workflow déterministe, séquence fixe → aucun routing dynamique nécessaire
- F-011 : extraction documentaire, branchement selon type de prêt → branchement prédicatif suffisant
- F-012 : qualification transactionnelle, cardinalité variable → branchement prédicatif typé suffisant

**ADR-003 est désormais une décision confirmée par l'expérience, pas seulement par le raisonnement.** Elle s'applique sans réserve à F-013, F-014, et F-006.

La condition de réouverture reste inchangée : si un Assistant futur requiert de sélectionner une implémentation à l'exécution parmi plusieurs implémentations d'une même interface — ce cas n'a pas encore été rencontré — la question sera réévaluée à ce moment.

---

# Principe directeur

> Le meilleur contrat est celui qui exprime exactement ce qu'il garantit — ni plus, ni moins. Un contrat générique qui efface les types pour acheter de la flexibilité ne garantit rien. Les Transformations du Knowledge System ont des inputs et des outputs précis. Le code doit refléter cette précision, pas l'effacer.
