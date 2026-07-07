---
id: FIELD-093
title: Justification de la Mission
type: field
status: draft
version: "1.0"
created: 2026-07-05
updated: 2026-07-05
owner: product-owner
tags: [field, mission, mission-engine]
belongs_to: [ENT-013]
---

# FIELD-093 — Justification de la Mission

---

# Objectif

Porter l'explication en langage naturel de pourquoi la Mission active a été retenue, conformément à UXP-003 (Règle 1 — "qu'est-ce qui vient d'être fait ?" / "pourquoi cette étape compte").

---

# Description

Ce champ est un texte, jamais un code. Il doit être compréhensible par le client sans connaissance du fonctionnement interne de Fiscal AI.

---

# Entité

- Mission

---

# Nom métier

Justification de la Mission

---

# Nom technique

mission_justification

---

# Type

Texte

---

# Valeur obligatoire

Oui

---

# Source prioritaire

Mission Engine (ENG-009)

---

# Sources autorisées

- Mission Engine (ENG-009)

---

# Moteurs concernés

- Mission Engine

---

# Utilisation

Affichée par tout composant informatif, jamais transmise sous forme de code interne (nom de catégorie brut, identifiant technique).

---

# Tests

Cas nominal

"Une anomalie a été détectée dans votre dossier et doit être corrigée avant de poursuivre."

Cas limite

Mission par défaut liée à l'état du Dossier (ex. "Votre dossier est en cours d'analyse, aucune action n'est requise de votre part.")

Cas d'erreur

Justification absente ou vide alors qu'une Mission active existe.

---

# Critères d'acceptation

✓ Toujours renseignée dès qu'une Mission active existe.

✓ Rédigée en langage naturel, sans jargon technique.

---

# ❌ Erreurs d'implémentation interdites

- Afficher un identifiant technique de catégorie à la place d'une justification.
- Laisser ce champ vide.
