---
id: BACKLOG-KS
title: Backlog du Knowledge System
type: backlog
status: living-document
version: "1.1"
created: 2026-07-02
updated: 2026-07-02
owner: product-owner
tags: [backlog, gouvernance, knowledge-system, maintenance]
---

# BACKLOG-KS — Backlog du Knowledge System

---

# Principe

Le code révèle. Le Backlog enregistre. Le Knowledge System évolue uniquement lorsque nous décidons de traiter une entrée du Backlog.

Ce document répond à une seule question :

> **Quelles observations révélées par les Feature Cycles n'ont pas été intégrées immédiatement dans le Knowledge System ?**

Ce document n'est pas un registre de dette historique. Il n'hérite pas des questions ouvertes des ADR, des Roadmaps, ou des phases de conception. Ces observations restent dans leurs documents d'origine.

Une entrée n'est traitée que lorsqu'une Feature future en dépend réellement.

---

# Convention

## Priorités

| Niveau | Signification |
|---|---|
| **P1** | Bloquant — sans mise à jour du KS, un prochain Feature Cycle risque une erreur métier ou une décision incorrecte |
| **P2** | Dégradant — sans mise à jour du KS, un prochain Feature Cycle produit une approximation ou une divergence silencieuse |
| **P3** | Enrichissant — sans impact immédiat ; améliore la cohérence à long terme |

## États

| État | Signification |
|---|---|
| **À traiter** | Identifiée, non affectée à un cycle de traitement |
| **En cours** | Traitement en session KS en cours |
| **Résolu** | Document KS mis à jour et validé |
| **Abandonné** | Décision de ne pas traiter, avec justification |

## Origines

| Code | Feature Cycle |
|---|---|
| FC-009 | Feature Cycle F-009 — Assistant Activité |
| FC-010 | Feature Cycle F-010 — Assistant Logement |
| FC-011 | Feature Cycle F-011 — Assistant Financement |
| FC-012 | Feature Cycle F-012 — Assistant Charges |

## Moments de traitement

| Valeur | Signification |
|---|---|
| **Avant FC-XXX** | Doit être traité avant ce Feature Cycle pour ne pas bloquer son implémentation |
| **Session KS** | À traiter lors d'une session de maintenance dédiée |
| **À la demande** | Traité uniquement si le sujet revient activement |

---

# Tableau de pilotage

| ID | Titre | Document | Origine | Priorité | État | Traitement |
|---|---|---|---|---|---|---|
| — | — | — | — | — | — | — |

*Aucune entrée à ce jour. Les premières entrées seront ajoutées à partir des rapports d'implémentation FC-011 et FC-012.*

---

# Entrées actives

*Aucune.*

---

# Entrées résolues

*Aucune.*

---

# Entrées abandonnées

*Aucune.*

---

# Règles de gestion

**Création :** une entrée ne peut être créée que lorsqu'un Feature Cycle ou une implémentation révèle une information absente, ambiguë ou contradictoire dans le Knowledge System. Aucune autre origine n'est valide.

**Suppression :** une entrée n'est supprimée que lorsque la mise à jour correspondante du Knowledge System est terminée. Passer une entrée à "Résolu" sans avoir mis à jour le document KS concerné est interdit.

**Ajout :** toute observation éligible est ajoutée au Backlog avant la clôture du Feature Cycle. Une observation non enregistrée est une observation perdue.

**Périmètre :** seules les observations issues de l'implémentation ont leur place ici. Les questions ouvertes de conception, les ADR en attente de décision, et les points de vigilance identifiés avant l'implémentation restent dans leurs documents d'origine.

**Traitement :** une entrée est traitée lors d'une session KS dédiée, après validation du Product Owner, et uniquement lorsqu'une Feature future en dépend réellement.

**Résolution :** une entrée passe à "Résolu" uniquement après que le document KS concerné a été mis à jour et validé. La modification du code seule ne résout pas une entrée.

**Abandon :** une entrée peut être abandonnée si le besoin disparaît. La justification est obligatoire.

**Priorisation :** révisée avant chaque Feature Cycle. Une entrée P3 peut devenir P1 si un nouvel Assistant la rend critique.
