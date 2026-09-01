---
id: ENT-013
title: Mission
type: entity
status: draft
version: "1.0"
created: 2026-07-05
updated: 2026-07-05
owner: product-owner
tags: [entity, mission, mission-engine]
belongs_to: [ENT-002]
contains: [FIELD-091, FIELD-092, FIELD-093, FIELD-094, FIELD-095, FIELD-096, FIELD-097]
---

# ENT-013 — Mission

---

# Objectif

Définir l'entité Mission de Fiscal AI.

Une Mission représente l'unique priorité active d'un Dossier à un instant donné — ce qu'il est le plus utile de faire maintenant, pourquoi, et qui doit agir.

---

# Description

Une Mission est une donnée produite par le système, jamais saisie par l'utilisateur.

Elle est entièrement reproductible : à signaux égaux, la même Mission doit toujours être produite.

Un Dossier ne possède qu'une seule Mission active à la fois.

---

# Cycle de vie

Calculée

↓

Affichée

↓

Remplacée (dès que les signaux d'entrée changent et qu'un nouveau calcul est déclenché)

---

# Relations

Appartient à :

- Dossier

Utilise :

- Statut du Dossier (STATE-001)
- Anomalies (Validation Engine)
- Questions et Jugements en attente (Question Engine)

Est produite par :

- Mission Engine (ENG-009)

Est consommée par :

- Dashboard et tout composant informatif (ENGINE_INTERACTION_STANDARDS §3.7)

---

# Attributs

## Identification

- Dossier concerné
- Date du calcul

## Contenu

- Mission active (catégorie)
- Priorité
- Justification
- Responsable
- Éléments bloquants
- Action recommandée

---

# Provenance

Une Mission est produite exclusivement par le Mission Engine, en exécutant TRF-0033.

---

# Data Dictionary

- FIELD-091 Mission active
- FIELD-092 Priorité de la Mission
- FIELD-093 Justification de la Mission
- FIELD-094 Responsable de la Mission
- FIELD-095 Éléments bloquants de la Mission
- FIELD-096 Action recommandée
- FIELD-097 Date du calcul de Mission

---

# Utilisation

Cette entité est utilisée par :

- Mission Engine (production)
- Dashboard et canaux informatifs (lecture seule)

---

# Interdictions

Ne jamais :

- produire deux Missions actives simultanément pour un même Dossier ;
- laisser une Mission sans justification ni date de calcul ;
- permettre à un composant informatif de modifier une Mission ;
- requalifier un élément bloquant au lieu de le référencer.

---

# Critères d'acceptation

✓ Un Dossier ne possède jamais plus d'une Mission active.

✓ Chaque Mission est traçable jusqu'aux signaux qui l'ont produite.

✓ Chaque Mission est reproductible à signaux égaux.

---

# ❌ Erreurs d'implémentation interdites

- Modifier une Mission en dehors du Mission Engine.
- Produire une Mission sans Dossier associé.
- Supprimer l'historique des Missions passées.
