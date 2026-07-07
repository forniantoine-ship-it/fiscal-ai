---
id: ARCH-001
title: Architecture d'interaction MVP
type: data-model
status: review
version: "1.1"
created: 2026-06-28
updated: 2026-07-05
owner: product-owner
tags: [architecture, mvp, engines, interaction]
depends_on:
  hard: [KS-ENG, KS-CTR]
  soft: []
grounded_in: [BASELINE-V1]
---

# ARCH-001 — Architecture d'interaction MVP

---

# 1. Objectif

Ce document décrit l'architecture concrète d'interaction entre les composants du MVP de Fiscal AI.

Les principes universels d'interaction sont définis dans KS-ENG (Engine Interaction Standards).

Ce document décrit leur application au MVP et évoluera avec le produit.

---

# 2. Rôles des composants

## 2.1 Workflow Engine (ENG-001)

**Responsabilité unique** : orchestrer la progression du dossier.

- Décide du prochain état du dossier.
- Déclenche les Engines nécessaires.
- Consomme les événements émis par les Engines.
- Ne réalise aucun traitement métier.
- Ne modifie aucune donnée.

## 2.2 Document Engine (ENG-002)

**Responsabilité unique** : gérer le cycle de vie des documents.

- Reçoit les documents importés.
- Déclenche l'OCR si nécessaire.
- Transmet les documents analysés à la classification.

## 2.3 OCR Engine (ENG-003)

**Responsabilité unique** : extraire le texte des documents.

- Reçoit un document brut.
- Produit un document textuel exploitable.
- Émet OCR_TERMINE.

## 2.4 Classification Engine (ENG-004)

**Responsabilité unique** : identifier le type de document.

- Reçoit un document textuel.
- Détermine sa catégorie (acte notarié, facture, etc.).
- Émet CLASSIFICATION_TERMINE.

## 2.5 Validation Engine (ENG-005)

**Responsabilité unique** : vérifier la cohérence des données.

- Reçoit un ensemble de données.
- Applique les règles de validation.
- Signale les anomalies.
- Émet VALIDATION_TERMINE.

## 2.6 Question Engine (ENG-006)

**Responsabilité unique** : collecter les données manquantes.

- Reçoit la liste des données manquantes.
- Génère les questions à poser à l'utilisateur.
- Transmet les réponses validées.
- Émet QUESTION_REPONDUE.

## 2.7 Calculation Engine (ENG-007)

**Responsabilité unique** : exécuter les calculs fiscaux.

- Reçoit des données validées et des Rules.
- Exécute les calculs dans l'ordre défini par les Rules.
- Produit des résultats traçables.
- Émet CALCUL_TERMINE.

## 2.8 Explanation Engine (ENG-008)

**Responsabilité unique** : expliquer les résultats.

- Reçoit les résultats des calculs.
- Produit des explications compréhensibles.
- N'effectue aucun calcul.

---

# 3. Matrice d'interaction

| Caller | Callee | Déclencheur | Événement produit |
|---|---|---|---|
| Workflow | Document Engine | DOCUMENT_IMPORTE | — |
| Document Engine | OCR Engine | Document reçu | OCR_TERMINE |
| Document Engine | Classification Engine | OCR terminé | CLASSIFICATION_TERMINE |
| Workflow | Validation Engine | Données collectées | VALIDATION_TERMINE |
| Workflow | Question Engine | Données manquantes | QUESTION_REPONDUE |
| Workflow | Calculation Engine | DOSSIER_COMPLET | CALCUL_TERMINE |
| Workflow | Explanation Engine | CALCUL_TERMINE | EXPLICATION_GENEREE |

---

# 4. Flux du dossier MVP

Les états ci-dessous sont définis par [[STATE-001 – Cycle de vie d'un dossier]], qui en est la source de vérité. Ce schéma décrit uniquement leur application séquentielle au flux MVP et aux Engines qui interviennent à chaque étape — il ne redéfinit aucun état.

```
DOSSIER_CREE
    ↓ Workflow
INFORMATIONS_GENERALES
    ↓ Question Engine (collecte des informations générales du dossier)
BIEN_EN_COURS
    ↓ Question Engine (collecte des informations du bien)
    ↓ Validation Engine (vérifie la cohérence)
BIEN_COMPLETE
    ↓ Workflow
DOCUMENTS_EN_ATTENTE
    ↓ Document Engine (import)
DOCUMENTS_IMPORTES
    ↓ Document Engine → OCR Engine → Classification Engine
ANALYSE_DOCUMENTAIRE
    ↓ Extraction des données + Validation Engine
INFORMATIONS_MANQUANTES (si nécessaire)
    ↓ Question Engine (questions ciblées)
DOSSIER_COMPLET
    ↓ Calculation Engine (exécute les Rules)
CALCUL_EN_COURS
    ↓ Calculation Engine
CALCUL_TERMINE
    ↓ Explanation Engine
DECLARATION_GENEREE
    ↓ Workflow
DOSSIER_TERMINE
```

---

# 5. Contracts nécessaires (MVP)

| Contract | Parties | Priorité |
|---|---|---|
| CTR-001 | Workflow Engine ↔ Calculation Engine | Critique |
| CTR-002 | Workflow Engine ↔ Question Engine | Critique |
| CTR-003 | Workflow Engine ↔ Validation Engine | Critique |
| CTR-004 | Document Engine ↔ OCR Engine | Haute |
| CTR-005 | Document Engine ↔ Classification Engine | Haute |
| CTR-006 | Workflow Engine ↔ Explanation Engine | Moyenne |
