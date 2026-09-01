---
id: KS-DEC
title: Decision Standards
type: standard
status: approved
version: "1.1"
created: 2026-06-28
updated: 2026-06-28
owner: product-owner
source: Baseline v1.0
tags: [knowledge-system, decision, standard, adr]
depends_on:
  hard: [KS-001, KS-002, KS-003, KS-004]
  soft: []
grounded_in: [BASELINE-V1]
---

# JUDGEMENT_STANDARDS

---

# 1. Objectif

Ce document définit la structure officielle de tous les objets Decision du Knowledge System.

Pour le socle commun (identifiants, front matter, relations, statuts), se référer à la Baseline v1.0 (KS-001 à KS-004).

Ce document ne définit que les règles spécifiques aux Decisions.

---

# 2. Définition

Une Decision capture un arbitrage effectué parmi plusieurs alternatives.

Elle peut porter sur :
- une règle fiscale (interprétation d'un texte ambigu) ;
- une architecture métier (structuration du domaine) ;
- un comportement produit (réaction du système) ;
- un périmètre (inclusions/exclusions du MVP).

Une Decision n'est pas une opinion. C'est un arbitrage formalisé et traçable.

---

# 3. Quand créer une Decision

Créer une Decision lorsque :
- un texte légal est ambigu ;
- plusieurs approches sont possibles ;
- un périmètre est explicitement réduit ;
- une convention métier est établie ;
- un comportement n'est pas évident.

Ne pas créer une Decision pour :
- un choix technique (relève de l'Engineering) ;
- un comportement évident découlant directement d'une loi.

---

# 4. Champs spécifiques Decision

Socle commun du front matter : voir KS-002.

Champs spécifiques ajoutés par ce standard :

| Champ | Type | Obligatoire | Description |
|---|---|---|---|
| `decision_type` | string (enum) | Oui | `fiscal`, `produit`, `architecture`, `perimetre` |
| `alternatives` | liste de strings | Oui | Alternatives considérées |
| `consequences` | liste de strings | Oui | Conséquences du choix retenu |
| `reversible` | boolean | Oui | La Decision peut-elle être remise en question ? |

Exemple des champs spécifiques uniquement :

```yaml
decision_type: fiscal
alternatives:
  - "Ventilation 80/20 par défaut"
  - "Ventilation basée sur l'estimation notariale"
  - "Demander systématiquement à l'utilisateur"
consequences:
  - "TRF-0001 et TRF-0006 appliquent cette ventilation"
  - "L'utilisateur peut corriger manuellement"
reversible: true
```

---

# 5. Relations pertinentes

Vocabulaire défini par KS-003. Relations pertinentes pour une Decision :

| Relation | Usage |
|---|---|
| `governs` | Objets impactés par cette Decision |
| `grounded_in` | Source légale ou doctrine |
| `supersedes` | Decision remplacée |
| `derived_from` | Decision ou contexte source |
| `depends_on` | Objets nécessaires à la compréhension |

Une Decision ne peut pas utiliser `implements` ou `validates`.

---

# 6. Sections obligatoires du document

## 6.1 Contexte

Pourquoi cette Decision est nécessaire.

## 6.2 Question

La question précise à laquelle elle répond. En une phrase.

## 6.3 Alternatives

Liste des options considérées avec avantages et inconvénients.

## 6.4 Décision retenue

L'option choisie. Clairement identifiée.

## 6.5 Justification

Pourquoi cette option a été retenue.

## 6.6 Conséquences

Impact sur le Knowledge System : Rules, Engines, Features, Contracts impactés.

## 6.7 Réversibilité

Peut-elle être remise en question ? Dans quelles conditions ?

## 6.8 Références

Sources légales, doctrine, jurisprudence.

---

# 7. Règles spécifiques

- Une Decision = un arbitrage unique.
- Toujours documenter les alternatives.
- Toujours renseigner `governs` pour rendre visible l'impact.
- Les Decisions fiscales doivent toujours référencer la source légale.
- Préférer des Decisions réversibles quand l'incertitude est forte.
- Ne jamais prendre une Decision sans la formaliser.
- Ne jamais confondre une Decision avec une Constraint.
