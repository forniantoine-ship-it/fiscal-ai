---
id: STATE-001
title: Cycle de vie d'un dossier
type: state
status: review
version: "1.0"
created: 2026-06-28
updated: 2026-07-05
owner: product-owner
tags: [state, dossier, cycle-de-vie, workflow]
---

# STATE-001 — Cycle de vie d'un dossier

---

# Objectif

Définir les états possibles d'un dossier Fiscal AI.

Un dossier ne peut exister que dans un seul état à un instant donné.

Le Workflow Engine est le seul moteur autorisé à modifier l'état d'un dossier.

---

# Principes

Un état représente la situation actuelle d'un dossier.

Les états sont ordonnés.

Chaque changement d'état est déclenché par un événement.

Aucun moteur, à l'exception du Workflow Engine, ne peut modifier un état.

---

# États du MVP

## DOSSIER_CREE

Le dossier vient d'être créé.

Aucune information métier n'est encore disponible.

---

## INFORMATIONS_GENERALES

Collecte des informations générales.

Le dossier est initialisé.

---

## BIEN_EN_COURS

Création ou modification du bien immobilier.

---

## BIEN_COMPLETE

Le bien est entièrement renseigné.

---

## DOCUMENTS_EN_ATTENTE

Le dossier attend l'import des documents.

---

## DOCUMENTS_IMPORTES

Les documents ont été enregistrés.

---

## ANALYSE_DOCUMENTAIRE

Les documents sont en cours d'analyse.

---

## INFORMATIONS_MANQUANTES

Des informations complémentaires sont nécessaires.

Le Question Engine peut intervenir.

---

## DOSSIER_COMPLET

Toutes les informations nécessaires sont disponibles.

Le dossier est prêt à être calculé.

---

## CALCUL_EN_COURS

Le Calculation Engine est en cours d'exécution.

---

## CALCUL_TERMINE

Les calculs sont terminés.

---

## DECLARATION_GENEREE

Les formulaires fiscaux ont été générés.

---

## DOSSIER_TERMINE

Le dossier est clôturé.

Aucune action supplémentaire n'est nécessaire.

---

# Règles

Un dossier ne peut être que dans un seul état.

Un changement d'état est toujours provoqué par un événement.

Le Workflow Engine valide chaque transition.

Les autres moteurs ne connaissent pas les transitions.

Ils connaissent uniquement l'état courant.

---

# Transitions autorisées

DOSSIER_CREE

↓

INFORMATIONS_GENERALES

↓

BIEN_EN_COURS

↓

BIEN_COMPLETE

↓

DOCUMENTS_EN_ATTENTE

↓

DOCUMENTS_IMPORTES

↓

ANALYSE_DOCUMENTAIRE

↓

INFORMATIONS_MANQUANTES (si nécessaire)

↓

DOSSIER_COMPLET

↓

CALCUL_EN_COURS

↓

CALCUL_TERMINE

↓

DECLARATION_GENEREE

↓

DOSSIER_TERMINE

---

# Interdictions

Aucun moteur ne peut modifier directement l'état d'un dossier.

Aucun retour arrière n'est autorisé sans décision explicite du Workflow Engine.

Un état ne peut être ignoré sans justification métier.

---

# Critères d'acceptation

✓ Tous les dossiers possèdent un état.

✓ Une seule valeur d'état est autorisée.

✓ Toutes les transitions sont contrôlées par le Workflow Engine.

✓ Les états sont réutilisables par toutes les Features du MVP.

---

# ❌ Erreurs d'implémentation interdites

- Deux états simultanés.
    
- Changement d'état par un autre moteur que le Workflow.
    
- Calcul lancé avant l'état DOSSIER_COMPLET.
    
- Génération de déclaration avant CALCUL_TERMINE.
    
- Transition non documentée.