---
id: KS-ENG
title: Engine Interaction Standards
type: standard
status: review
version: "1.2"
created: 2026-06-28
updated: 2026-07-05
owner: product-owner
source: Baseline v1.0
tags: [knowledge-system, engine, interaction, standard, audience-informative]
depends_on:
  hard: [KS-001, KS-002, KS-003, KS-004, KS-CTR]
  soft: [KS-TRF, ARCH-001]
grounded_in: [BASELINE-V1]
version_history:
  - version: "1.1" — version approuvée précédente
  - version: "1.2" — ajout de la règle 3.7 (audience informative distincte de l'autorité de décision), révélée par l'analyse du Mission Engine (2026-07-05)
---

# ENGINE_INTERACTION_STANDARDS

---

# 1. Objectif

Ce document définit les règles universelles d'interaction entre les composants métier de Fiscal AI.

Pour le socle commun (identifiants, front matter, relations, statuts), se référer à la Baseline v1.0 (KS-001 à KS-004).

Pour l'architecture concrète du MVP (rôles des Engines, flux, matrice d'interaction), se référer à ARCH-001.

Ce document ne définit que les principes d'interaction stables et indépendants de la version du produit.

---

# 2. Modèle d'interaction

```
Workflow (orchestre le parcours global du dossier)
    ↓ déclenche
Engine (exécute un type de traitement)
    ↓ applique
Rule (connaissance métier atomique)
    ↓ vérifié par
Validation (cas de test métier)

Feature (capacité métier livrée à l'utilisateur)
    ↓ implémentée par
Engine + Rule (ensemble)

Contract (garanties entre composants)
    ↓ gouverne
Engine ↔ Engine
```

La Feature est une vue transversale. Elle ne contient pas le Workflow — le Workflow la traverse.

Ce modèle décrit l'autorité de décision sur le Dossier. Il ne décrit pas la diffusion informative d'un événement vers un utilisateur ou un système tiers — voir 3.7.

---

# 3. Principes d'interaction

## 3.1 Direction unique

Le Workflow Engine est le seul composant qui déclenche les autres Engines.

Aucun Engine ne déclenche directement un autre Engine, sauf au sein d'une chaîne formalisée par un Contract.

## 3.2 Communication par événements

Toute interaction produit un événement.

Un Engine ne retourne jamais un résultat directement au Workflow. Il émet un événement que le Workflow consomme.

Cette consommation porte sur l'autorité de décision. Elle n'exclut pas qu'un même événement soit également exposé, en parallèle et sans hiérarchie, à un composant informatif (voir 3.7).

## 3.3 Séparation des connaissances

Un Engine ne connaît jamais un autre Engine.

Il connaît uniquement :
- ses entrées (définies par le Contract) ;
- ses sorties (définies par le Contract) ;
- les Rules qu'il doit appliquer.

## 3.4 Non-modification par le Workflow

Le Workflow Engine ne modifie jamais les données métier.

Seuls les Engines spécialisés modifient les données, dans le cadre défini par leurs Contracts.

## 3.5 Responsabilité unique

Chaque Engine a une responsabilité unique. Si un Engine fait deux choses, le scinder.

## 3.6 Contract obligatoire

Toute interaction entre deux composants doit être formalisée par un Contract (voir KS-CTR).

## 3.7 Audience informative distincte de l'autorité de décision

Un événement émis par un Engine peut avoir deux audiences distinctes, simultanées et non hiérarchisées :

- le Workflow Engine, qui le consomme pour décider, seul, de l'évolution du Dossier (règles 3.1 et 3.2) ;
- un ou plusieurs composants informatifs (Dashboard, notification, e-mail, assistant conversationnel, agent vocal, API…), qui le reçoivent uniquement pour le présenter à un utilisateur ou à un système tiers.

Un composant informatif :
- ne déclenche jamais un Engine ;
- ne modifie jamais une donnée métier ;
- ne prend aucune décision sur l'évolution du Dossier ;
- n'est jamais consulté par le Workflow Engine avant une décision.

L'Engine qui émet l'événement ne connaît pas la liste de ses composants informatifs, au même titre qu'il ne connaît aucun autre Engine (règle 3.3). Il expose son événement ; il ne le distribue pas.

La relation entre un Engine et un composant informatif est unilatérale : le composant informatif ne fournit aucune garantie en retour à l'Engine. Elle relève d'une Constraint au sens de KS-CTR, jamais d'un Contract — seule une interaction bilatérale, où chaque partie s'engage envers l'autre, requiert un Contract.

Cette règle ne modifie ni le rôle du Workflow Engine (ENG-001), ni celui d'aucun Engine spécialisé. Elle rend explicite une distinction déjà pratiquée implicitement : un événement comme `EXPLICATION_GENEREE` (ARCH-001) informe déjà l'utilisateur sans que cela n'ait jamais été confondu avec une autorité de décision.

---

# 4. Règles spécifiques

- Les événements sont le seul mécanisme de communication entre le Workflow et les Engines.
- Les Rules sont la seule source de logique métier. Les Engines les exécutent, ils ne les définissent pas.
- Ne jamais faire communiquer deux Engines directement sans Contract.
- Ne jamais ajouter de logique métier dans le Workflow Engine.
- Ne jamais ajouter de logique d'orchestration dans un Engine spécialisé.
- Ne jamais oublier d'émettre un événement à la fin d'un traitement.
- Ne jamais donner à un composant informatif une autorité de décision, même indirecte, sur le Workflow Engine.
- Ne jamais exiger un Contract (KS-CTR) pour une consommation strictement informative et unilatérale d'un événement.
