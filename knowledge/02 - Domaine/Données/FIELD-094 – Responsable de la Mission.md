---
id: FIELD-094
title: Responsable de la Mission
type: field
status: draft
version: "1.0"
created: 2026-07-05
updated: 2026-07-05
owner: product-owner
tags: [field, mission, mission-engine, responsable]
belongs_to: [ENT-013]
---

# FIELD-094 — Responsable de la Mission

---

# Objectif

Identifier qui doit agir pour faire progresser la Mission active.

---

# Description

Ce champ dérive directement de la catégorie de Mission retenue (FIELD-091) — il n'introduit aucune décision supplémentaire, seulement une lecture de la table de correspondance documentée dans TRF-0033.

**Note de proximité conceptuelle** — l'Ontologie définit déjà une propriété `propriétaire` sur le Jugement (valeurs : expert, utilisateur, système), qui répond à une question voisine ("qui a autorité sur ce choix ?") mais pas identique à celle posée ici ("qui doit agir maintenant ?"). Les deux notions ne sont pas fusionnées : leurs énumérations diffèrent (ce champ ajoute `collaborateur`, absent du Jugement ; le Jugement distingue `expert` d'`IA`, une distinction que ce champ ne fait pas). Si un troisième objet du Knowledge System devait un jour exprimer un besoin équivalent, cette proximité justifierait de formaliser un concept partagé — pas avant, conformément au principe de ne pas faire évoluer le Knowledge System par anticipation.

---

# Entité

- Mission

---

# Nom métier

Responsable de la Mission

---

# Nom technique

mission_owner

---

# Type

Énumération

---

# Valeurs autorisées

- client
- ia
- système
- collaborateur

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

- FIELD-091 Mission active

---

# Utilisation

Permet au Dashboard de savoir s'il doit afficher une action au client ("responsable = client") ou un message d'attente ("responsable = système/ia").

---

# Tests

Cas nominal

Mission = `corriger_anomalie` → responsable = `client`.

Cas limite

Mission = `attendre_calcul` → responsable = `système`.

Cas d'erreur

Mission active sans responsable dérivable (table de correspondance incomplète).

---

# Critères d'acceptation

✓ Toujours dérivé de la Mission active, jamais choisi indépendamment.

---

# ❌ Erreurs d'implémentation interdites

- Attribuer un responsable non dérivé de la table de correspondance de TRF-0033.
