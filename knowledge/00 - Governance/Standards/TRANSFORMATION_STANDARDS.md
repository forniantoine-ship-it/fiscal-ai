---
id: KS-TRF
title: Rule Standards
type: standard
status: approved
version: "1.1"
created: 2026-06-28
updated: 2026-06-28
owner: product-owner
source: Baseline v1.0
tags: [knowledge-system, rule, standard]
depends_on:
  hard: [KS-001, KS-002, KS-003, KS-004]
  soft: []
grounded_in: [BASELINE-V1]
---

# TRANSFORMATION_STANDARDS

---

# 1. Objectif

Ce document définit la structure officielle de tous les objets Rule du Knowledge System.

Aucune Rule ne peut être créée, modifiée ou validée sans respecter ce standard.

Pour le socle commun (identifiants, front matter, relations, statuts), se référer à la Baseline v1.0 (KS-001 à KS-004).

Ce document ne définit que les règles spécifiques aux Rules.

---

# 2. Définition

Une Rule est une connaissance métier formalisée.

Elle décrit une transformation : des données d'entrée produisent un résultat selon une logique métier documentée.

Une Rule ne contient jamais de code.

Une Rule ne décrit jamais une interface utilisateur.

Une Rule ne dépend jamais d'une technologie.

Une Rule doit pouvoir être comprise par un fiscaliste, un Product Manager et un développeur.

---

# 3. Place dans l'architecture

```
Feature (spécifie le besoin)
    ↓
Workflow (orchestre la progression)
    ↓
Engine (exécute)
    ↓
Rule (définit la logique métier)
    ↓
Validation (vérifie le résultat)
```

La Rule est la source de connaissance métier. Les Engines l'exécutent mais ne la définissent pas.

Une Rule est toujours :
- référencée par au moins une Feature (implements)
- exécutée par au moins un Engine
- vérifiée par au moins une Validation (validates)
- fondée sur au moins une source légale ou une Decision (grounded_in)

---

# 4. Cycle de vie

Conforme à KS-004, avec les contraintes supplémentaires suivantes :

- Une Rule ne peut pas passer en `approved` sans au moins une Validation associée.
- Une Rule ne peut pas passer en `approved` sans au moins un `grounded_in` renseigné.
- Quand une loi change, la Rule impactée passe en `deprecated` et une nouvelle Rule la `supersedes`.

---

# 5. Champs spécifiques Rule

Socle commun du front matter : voir KS-002.

Champs spécifiques ajoutés par ce standard :

| Champ | Type | Obligatoire | Description |
|---|---|---|---|
| `input_fields` | liste d'IDs | Oui | Fields consommés par la Rule |
| `output_fields` | liste d'IDs | Oui | Fields produits ou modifiés par la Rule |
| `fiscal_regime` | string | Oui | Régime fiscal applicable |
| `decisions` | liste d'IDs | Non | Decisions référencées par cette Rule |

Exemple des champs spécifiques uniquement :

```yaml
input_fields: [FIELD-001, FIELD-002, FIELD-007, FIELD-012, FIELD-024]
output_fields: [FIELD-032]
fiscal_regime: lmnp-reel
decisions: [DEC-001]
```

---

# 6. Relations pertinentes

Vocabulaire défini par KS-003. Seules les relations suivantes sont pertinentes pour une Rule :

| Relation | Usage |
|---|---|
| `depends_on` | Fields et Entities nécessaires |
| `grounded_in` | Sources légales ou Decisions |
| `derived_from` | Rule source (cas de scission) |
| `supersedes` | Rule remplacée |
| `implements` | Features réalisées |
| `governs` | Objets contraints |

Une Rule ne peut pas utiliser `validates`, `contains` ou `belongs_to`.

---

# 7. Sections obligatoires du document

Chaque Rule doit contenir les sections suivantes, dans cet ordre :

## 7.1 Objectif

Pourquoi cette Rule existe. Quel problème métier elle résout. En 2-3 phrases maximum.

## 7.2 Description

Explication générale de la logique métier. Sans code, sans technologie. Compréhensible par un fiscaliste.

## 7.3 Conditions d'application

- Quand la Rule doit être appliquée.
- Quand elle ne doit pas être appliquée.
- Fréquence d'exécution (une fois, à chaque exercice, etc.).

## 7.4 Données d'entrée

Liste exhaustive des Fields consommés :

| Field | Obligatoire | Source | Description |
|---|---|---|---|

## 7.5 Traitement

Description précise du raisonnement métier, étape par étape. Sans code. Si le traitement contient un calcul, fournir la formule en notation mathématique.

## 7.6 Données de sortie

Liste exhaustive des Fields produits ou modifiés.

## 7.7 Exceptions

Cas où la Rule ne s'applique pas normalement. Chaque exception doit indiquer le comportement attendu.

## 7.8 Cas particuliers

Situations rares mais prévues. Un cas particulier est traité, une exception est rejetée.

## 7.9 Cas d'erreur

Comportement attendu quand une donnée est absente, incohérente ou invalide.

## 7.10 Sources légales

Références complètes : articles du CGI, BOFiP, doctrine, jurisprudence. Chaque source doit être vérifiable.

## 7.11 Tests métier

Référence aux objets Validation associés (VAL-xxx). Minimum requis : 1 nominal, 1 limite, 1 erreur.

---

# 8. Conventions de rédaction

- Rédiger en français.
- Utiliser le présent de l'indicatif.
- Une phrase = une idée.
- Pas de jargon technique ni de référence à une technologie.
- Les formules mathématiques utilisent la notation standard.
- Les montants sont exprimés en euros.

---

# 9. Règles spécifiques

- Une Rule = une responsabilité unique.
- Si une Rule devient trop longue, la scinder.
- Toujours renseigner `grounded_in` avec la source légale exacte.
- Toujours lister tous les `input_fields` et `output_fields`.
- Si un comportement n'est pas documenté, il n'existe pas.
- Ne jamais coder une logique métier dans un Engine sans créer de Rule.
- Ne jamais créer une Rule sans Validation ni sans source légale.
