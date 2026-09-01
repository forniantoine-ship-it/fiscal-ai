---
id: FIELD-092
title: Priorité de la Mission
type: field
status: draft
version: "1.0"
created: 2026-07-05
updated: 2026-07-05
owner: product-owner
tags: [field, mission, mission-engine]
belongs_to: [ENT-013]
---

# FIELD-092 — Priorité de la Mission

---

# Objectif

Exprimer le rang de la Mission active parmi les catégories de signaux concurrents, tel que défini par [[DEC-001 – Politique de priorisation des Missions]].

---

# Description

Ce champ ne sert pas à comparer des Missions de Dossiers différents — il documente uniquement pourquoi la Mission active a été retenue plutôt qu'une autre pour ce Dossier.

---

# Entité

- Mission

---

# Nom métier

Priorité de la Mission

---

# Nom technique

mission_priority_rank

---

# Type

Nombre entier

---

# Format

Rang (1 = priorité la plus haute)

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

# Dépendances

- DEC-001 Politique de priorisation des Missions

---

# Utilisation

Permet d'auditer, a posteriori, pourquoi une Mission a été retenue plutôt qu'une autre à un instant donné.

---

# Tests

Cas nominal

Un seul signal actif → priorité = rang de sa catégorie dans DEC-001.

Cas limite

Deux signaux de catégories différentes actifs simultanément → la priorité reflète le rang le plus haut (le plus prioritaire), jamais une moyenne ni une somme.

Cas d'erreur

Rang non défini dans DEC-001 pour la catégorie retenue.

---

# Critères d'acceptation

✓ Le rang correspond toujours à un ordre documenté dans DEC-001.

✓ Jamais de valeur ambiguë ou calculée par interpolation.

---

# ❌ Erreurs d'implémentation interdites

- Inventer un rang non documenté dans DEC-001.
- Faire varier l'ordre de priorité sans mise à jour de DEC-001.
