---
id: FIELD-095
title: Éléments bloquants de la Mission
type: field
status: draft
version: "1.0"
created: 2026-07-05
updated: 2026-07-05
owner: product-owner
tags: [field, mission, mission-engine]
belongs_to: [ENT-013]
---

# FIELD-095 — Éléments bloquants de la Mission

---

# Objectif

Référencer, sans les requalifier, les éléments qui justifient la Mission active lorsqu'elle provient d'une anomalie ou d'une question en attente.

---

# Description

Ce champ ne contient jamais une nouvelle description de l'anomalie ou de la question — uniquement une référence vers sa source (Validation Engine ou Question Engine). Le Mission Engine ne requalifie jamais un signal qu'il reçoit.

---

# Entité

- Mission

---

# Nom métier

Éléments bloquants

---

# Nom technique

mission_blockers

---

# Type

Liste de références

---

# Valeur obligatoire

Non — absente si la Mission active ne provient pas d'un blocage

---

# Valeur par défaut

Liste vide

---

# Source prioritaire

Mission Engine (ENG-009), par recopie de références produites par Validation Engine ou Question Engine

---

# Sources autorisées

- Mission Engine (ENG-009)

---

# Moteurs concernés

- Mission Engine
- Validation Engine (source des références)
- Question Engine (source des références)

---

# Dépendances

- FIELD-046 Nombre d'anomalies
- FIELD-090 Signal de question ou Jugement en attente

---

# Utilisation

Permet à un composant informatif de proposer un lien direct vers l'élément à corriger, sans dupliquer sa description.

---

# Tests

Cas nominal

Une anomalie référencée par le Validation Engine.

Cas limite

Liste vide (Mission par défaut liée à l'état du Dossier, aucun blocage).

Cas d'erreur

Référence vers un élément qui n'existe plus (anomalie déjà corrigée).

---

# Critères d'acceptation

✓ Ne contient jamais de texte requalifié — uniquement des références.

✓ Toujours cohérente avec l'état réel des anomalies et questions au moment du calcul.

---

# ❌ Erreurs d'implémentation interdites

- Dupliquer ou reformuler le contenu d'une anomalie.
- Référencer un élément déjà résolu.
