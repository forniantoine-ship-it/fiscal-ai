---
id: FIELD-096
title: Action recommandée
type: field
status: draft
version: "1.0"
created: 2026-07-05
updated: 2026-07-05
owner: product-owner
tags: [field, mission, mission-engine]
belongs_to: [ENT-013]
---

# FIELD-096 — Action recommandée

---

# Objectif

Porter l'action concrète unique proposée au client, lorsque le responsable de la Mission active est le client (FIELD-094).

---

# Description

Conformément à UXP-003 Règle 2 ("chaque assistant se termine par une prochaine action") et Règle 3 ("une seule prochaine action est mise en avant"), ce champ ne contient jamais plusieurs actions.

---

# Entité

- Mission

---

# Nom métier

Action recommandée

---

# Nom technique

recommended_action

---

# Type

Texte

---

# Valeur obligatoire

Non — absente si le responsable de la Mission n'est pas le client

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

- FIELD-094 Responsable de la Mission

---

# Utilisation

Affichée comme unique bouton d'action principal sur le Dashboard et tout canal informatif.

---

# Tests

Cas nominal

Responsable = client → "Corriger les éléments signalés."

Cas limite

Responsable = système → champ absent.

Cas d'erreur

Responsable = client mais champ absent.

---

# Critères d'acceptation

✓ Toujours renseignée quand le responsable est le client.

✓ Ne contient jamais plusieurs actions.

---

# ❌ Erreurs d'implémentation interdites

- Proposer plusieurs actions dans ce champ.
- Laisser ce champ vide alors que le responsable est le client.
