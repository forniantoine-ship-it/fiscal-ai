---
id: KS-VAL
title: Validation Standards
type: standard
status: approved
version: "1.1"
created: 2026-06-28
updated: 2026-06-28
owner: product-owner
source: Baseline v1.0
tags: [knowledge-system, validation, standard, testing]
depends_on:
  hard: [KS-001, KS-002, KS-003, KS-004, KS-TRF]
  soft: []
grounded_in: [BASELINE-V1]
---

# VERIFICATION_STANDARDS

---

# 1. Objectif

Ce document définit la structure officielle de tous les objets Validation du Knowledge System.

Pour le socle commun (identifiants, front matter, relations, statuts), se référer à la Baseline v1.0 (KS-001 à KS-004).

Ce document ne définit que les règles spécifiques aux Validations.

---

# 2. Définition

Une Validation est un cas de test métier formalisé.

Elle vérifie qu'une Rule, un Engine, une Feature ou un Contract produit le résultat attendu.

Une Validation décrit un scénario métier compréhensible par un fiscaliste.

Une Validation ne contient jamais de code.

---

# 3. Relation avec les Rules

Chaque Rule doit posséder au minimum :
- 1 Validation nominale
- 1 Validation limite
- 1 Validation d'erreur

Une Validation est liée à son objet cible par la relation `validates` (KS-003).

---

# 4. Types de Validation

## 4.1 Cas nominal

Scénario standard où toutes les données sont présentes et correctes. Le traitement produit le résultat attendu.

## 4.2 Cas limite

Scénario où les données sont valides mais à la frontière des conditions d'application.

## 4.3 Cas d'erreur

Scénario où une donnée est absente, incohérente ou invalide. Le système doit détecter l'erreur et réagir de manière prévisible.

## 4.4 Cas d'exclusion

Scénario hors périmètre du MVP. Le système doit identifier le cas et empêcher un traitement inadapté.

---

# 5. Champs spécifiques Validation

Socle commun du front matter : voir KS-002.

Champs spécifiques ajoutés par ce standard :

| Champ | Type | Obligatoire | Description |
|---|---|---|---|
| `validation_type` | string (enum) | Oui | `nominal`, `limite`, `erreur`, `exclusion` |
| `input_data` | objet YAML | Oui | Données d'entrée du scénario |
| `expected_output` | objet YAML | Oui | Résultat attendu |
| `expected_behavior` | string | Oui | Description du comportement attendu |

Exemple des champs spécifiques uniquement :

```yaml
validation_type: nominal
input_data:
  FIELD-001: 2025-03-15
  FIELD-002: 180000
expected_output:
  FIELD-032: 180000
expected_behavior: "La fiche d'acquisition est créée avec toutes les données validées."
```

---

# 6. Relations pertinentes

Vocabulaire défini par KS-003. Seules les relations suivantes sont pertinentes pour une Validation :

| Relation | Usage |
|---|---|
| `validates` | Objets vérifiés par cette Validation |
| `derived_from` | Objet dont cette Validation est issue |
| `depends_on` | Objets nécessaires à l'exécution du test |

Une Validation ne peut pas utiliser `implements`, `governs` ou `grounded_in`.

---

# 7. Sections obligatoires du document

## 7.1 Objectif

Ce que cette Validation vérifie. En une phrase.

## 7.2 Contexte

Description du scénario métier.

## 7.3 Données d'entrée

Tableau exhaustif des données fournies.

## 7.4 Traitement attendu

Description étape par étape de ce que le système doit faire.

## 7.5 Résultat attendu

Valeurs de sortie précises et vérifiables.

## 7.6 Verdict

Critères de succès.

---

# 8. Organisation à l'échelle

Quand le nombre de Validations augmente, les organiser en sous-dossiers par Rule :

```
01 - Business/Validations/
    TRF-0001/
        VAL-001 – Acquisition nominale.md
        VAL-006 – Erreur – Date absente.md
    TRF-0006/
        VAL-020 – Amortissement nominal.md
```

Les identifiants restent uniques globalement (KS-001).

---

# 9. Règles spécifiques

- Une Validation = un scénario unique.
- Les données d'entrée doivent être réalistes et représentatives.
- Les résultats attendus doivent être calculables manuellement.
- Chaque Validation doit être reproductible indépendamment.
- Ne jamais créer une Validation sans objet cible (`validates` vide).
- Ne jamais décrire le test en termes techniques.
