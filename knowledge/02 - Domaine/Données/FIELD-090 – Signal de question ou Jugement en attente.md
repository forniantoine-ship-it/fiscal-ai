---
id: FIELD-090
title: Signal de question ou Jugement en attente
type: field
status: draft
version: "1.0"
created: 2026-07-05
updated: 2026-07-05
owner: product-owner
tags: [field, dossier, mission-engine, question-engine]
belongs_to: [ENT-002]
---

# FIELD-090 — Signal de question ou Jugement en attente

---

# Objectif

Indiquer si le Question Engine (ENG-006) a une question (Mode Collection) ou un Jugement (Mode Guidance) en attente de réponse pour ce Dossier.

Ce champ ne contient jamais la question elle-même — uniquement le signal de son existence et une référence.

---

# Description

Ce signal permet à un composant tiers (notamment le futur Mission Engine) de savoir qu'une interaction avec l'utilisateur est en attente, sans avoir à connaître le contenu ni la mécanique du Question Engine.

---

# Entité

- Dossier

---

# Nom métier

Question ou Jugement en attente

---

# Nom technique

pending_question_ref

---

# Type

Référence (nullable)

---

# Format

Identifiant de la question/du Jugement en attente, ou absent si aucune

---

# Unité

Aucune

---

# Valeur obligatoire

Non — absent si aucune question n'est en attente

---

# Valeur par défaut

Absent

---

# Source prioritaire

Question Engine (ENG-006)

---

# Sources autorisées

- Question Engine (ENG-006)

---

# Moteurs concernés

- Question Engine
- Mission Engine (ENG-009, en lecture seule)

---

# Dépendances

- Aucune

---

# Utilisation

Ce champ est utilisé pour :

- signaler qu'une interaction utilisateur est en attente, sans exposer son contenu ;
- servir d'entrée à la Transformation de priorisation de la Mission active (TRF-0033).

---

# Validation

Le champ doit :

- être renseigné exclusivement par le Question Engine ;
- être effacé dès que la question ou le Jugement associé est répondu (`QUESTION_REPONDUE` ou `JUGEMENT_CONFIRME`).

---

# Tests

Cas nominal

Une question en Mode Collection est en attente — le champ contient sa référence.

Cas limite

Aucune question ni Jugement en attente — le champ est absent.

Cas d'erreur

Un composant autre que le Question Engine tente de modifier ce champ.

---

# Critères d'acceptation

✓ Ce champ ne contient jamais le texte de la question elle-même.

✓ Il est systématiquement effacé après réponse.

✓ Il n'est jamais modifié par un autre composant que le Question Engine.

---

# ❌ Erreurs d'implémentation interdites

- Stocker le contenu de la question dans ce champ.
- Laisser une référence obsolète après réponse.
- Permettre au Mission Engine de le modifier.
