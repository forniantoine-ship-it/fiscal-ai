---
id: FIELD-091
title: Mission active
type: field
status: draft
version: "1.0"
created: 2026-07-05
updated: 2026-07-05
owner: product-owner
tags: [field, mission, mission-engine]
belongs_to: [ENT-013]
---

# FIELD-091 — Mission active

---

# Objectif

Identifier, parmi un ensemble fini de catégories, la Mission actuellement retenue pour un Dossier.

---

# Description

La Mission active est la catégorie unique produite par la Transformation de priorisation des Missions (TRF-0033). Elle représente ce qui est le plus utile pour le Dossier maintenant.

---

# Entité

- Mission

---

# Nom métier

Mission active

---

# Nom technique

active_mission

---

# Type

Énumération

---

# Format

Liste de valeurs

---

# Valeur obligatoire

Oui, dès qu'une Mission a été calculée

---

# Valeur par défaut

Aucune (absente tant qu'aucun calcul n'a eu lieu)

---

# Source prioritaire

Mission Engine (ENG-009)

---

# Sources autorisées

- Mission Engine (ENG-009)

---

# Valeurs autorisées

- corriger_anomalie
- repondre_question
- decrire_le_bien
- importer_documents
- attendre_analyse
- relancer_client
- attendre_calcul
- consulter_resultat
- consulter_declaration
- cloturer_dossier

---

# Moteurs concernés

- Mission Engine

---

# Dépendances

- FIELD-037 Statut du dossier
- FIELD-046 Nombre d'anomalies
- FIELD-090 Signal de question ou Jugement en attente

---

# Utilisation

Affichée par tout composant informatif (Dashboard, notification…) conformément à ENGINE_INTERACTION_STANDARDS §3.7.

---

# Validation

Une seule valeur à la fois. Toujours accompagnée d'une justification (FIELD-093) et d'une date de calcul (FIELD-097).

---

# Tests

Cas nominal

Statut du dossier = CALCUL_TERMINE, aucune anomalie, aucune question en attente → `consulter_resultat`.

Cas limite

Anomalie et question en attente simultanément → seule `corriger_anomalie` est retenue.

Cas d'erreur

Statut du dossier absent ou hors énumération STATE-001 → aucune Mission n'est produite.

---

# Critères d'acceptation

✓ Une seule Mission active à la fois.

✓ Toujours accompagnée d'une justification.

✓ Jamais calculée à partir d'un statut de dossier invalide.

---

# ❌ Erreurs d'implémentation interdites

- Produire deux Missions actives simultanément.
- Calculer une Mission sans statut de dossier valide.
- Modifier ce champ en dehors du Mission Engine.
