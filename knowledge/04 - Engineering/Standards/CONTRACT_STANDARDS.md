---
id: KS-CTR
title: Contract Standards
type: standard
status: approved
version: "1.1"
created: 2026-06-28
updated: 2026-06-28
owner: product-owner
source: Baseline v1.0
tags: [knowledge-system, contract, standard]
depends_on:
  hard: [KS-001, KS-002, KS-003, KS-004]
  soft: [KS-TRF]
grounded_in: [BASELINE-V1]
---

# CONTRACT_STANDARDS

---

# 1. Objectif

Ce document définit la structure officielle de tous les objets Contract du Knowledge System.

Pour le socle commun (identifiants, front matter, relations, statuts), se référer à la Baseline v1.0 (KS-001 à KS-004).

Ce document ne définit que les règles spécifiques aux Contracts.

---

# 2. Définition

Un Contract est un accord bilatéral entre deux composants.

Il définit :
- ce que le composant appelant fournit (entrées) ;
- ce que le composant appelé produit (sorties) ;
- les préconditions ;
- les postconditions ;
- les invariants ;
- les événements émis ;
- les erreurs possibles.

Un Contract est toujours bilatéral. Une obligation unilatérale est une Constraint, pas un Contract.

---

# 3. Quand créer un Contract

Nécessaire lorsque :
- deux Engines interagissent ;
- un Engine exécute une Rule ;
- un Workflow déclenche un Engine ;
- un composant émet un événement consommé par un autre.

Pas nécessaire entre :
- deux objets du même type ;
- un objet et lui-même.

---

# 4. Champs spécifiques Contract

Socle commun du front matter : voir KS-002.

Champs spécifiques ajoutés par ce standard :

| Champ | Type | Obligatoire | Description |
|---|---|---|---|
| `parties` | liste d'IDs | Oui | Les deux composants liés |
| `caller` | ID | Oui | Le composant qui initie l'interaction |
| `callee` | ID | Oui | Le composant qui reçoit l'appel |

Exemple des champs spécifiques uniquement :

```yaml
parties: [ENG-001, ENG-007]
caller: ENG-001
callee: ENG-007
```

---

# 5. Relations pertinentes

Vocabulaire défini par KS-003. Relations pertinentes pour un Contract :

| Relation | Usage |
|---|---|
| `depends_on` | Composants impliqués |
| `governs` | Composants auxquels le Contract impose des garanties |
| `grounded_in` | Decision ou Standard qui justifie ce Contract |
| `supersedes` | Contract remplacé |
| `derived_from` | Contract source |

---

# 6. Sections obligatoires du document

## 6.1 Objectif

Pourquoi ce Contract existe. Quels composants il relie. En 2-3 phrases.

## 6.2 Parties

Identification des deux composants et de leurs rôles (caller / callee).

## 6.3 Préconditions

Conditions qui doivent être vraies avant que l'interaction commence.

## 6.4 Entrées

Données fournies par le caller au callee.

## 6.5 Sorties

Données retournées par le callee au caller.

## 6.6 Postconditions

Conditions qui doivent être vraies après l'exécution.

## 6.7 Invariants

Conditions qui ne changent jamais, avant, pendant et après l'exécution.

## 6.8 Événements

Événements émis lors de l'interaction.

## 6.9 Erreurs

Erreurs possibles et comportement attendu.

---

# 7. Règles spécifiques

- Un Contract par paire de composants.
- Toujours définir les préconditions et postconditions.
- Les invariants expriment les garanties les plus fortes — ne jamais les omettre.
- Un Contract ne décrit jamais le fonctionnement interne d'un composant.
- Ne jamais créer un Contract unilatéral (c'est une Constraint).
- Ne jamais confondre un Contract avec une spécification technique.
