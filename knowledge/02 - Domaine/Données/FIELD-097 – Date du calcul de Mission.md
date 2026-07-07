---
id: FIELD-097
title: Date du calcul de Mission
type: field
status: draft
version: "1.0"
created: 2026-07-05
updated: 2026-07-05
owner: product-owner
tags: [field, mission, mission-engine, traçabilité]
belongs_to: [ENT-013]
---

# FIELD-097 — Date du calcul de Mission

---

# Objectif

Horodater chaque calcul de Mission active, pour satisfaire l'obligation de trace C12 de l'Ontologie.

---

# Description

Permet de reconstituer, a posteriori, l'historique des Missions successivement retenues pour un Dossier.

---

# Entité

- Mission

---

# Nom métier

Date du calcul de Mission

---

# Nom technique

mission_computed_at

---

# Type

Date et heure

---

# Format

ISO 8601

---

# Valeur obligatoire

Oui

---

# Source prioritaire

Système

---

# Sources autorisées

- Mission Engine (ENG-009)
- Système

---

# Moteurs concernés

- Mission Engine

---

# Utilisation

Traçabilité et audit. Permet de vérifier qu'une Mission affichée à l'utilisateur correspond bien au dernier calcul effectué.

---

# Tests

Cas nominal

Horodatage au moment du calcul.

Cas limite

Deux calculs à quelques secondes d'intervalle (relance rapide) — chacun historisé distinctement.

Cas d'erreur

Absence d'horodatage alors qu'une Mission active existe.

---

# Critères d'acceptation

✓ Toujours renseignée.

✓ Permet de reconstituer l'historique des Missions d'un Dossier.

---

# ❌ Erreurs d'implémentation interdites

- Produire une Mission active sans horodatage.
- Écraser l'historique des calculs précédents.
