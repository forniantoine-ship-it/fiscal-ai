---
id: VER-003
title: Erreur – Prix d'acquisition absent
type: vérification
status: approved
version: "1.0"
created: 2026-06-29
updated: 2026-06-29
owner: product-owner
tags: [lmnp, acquisition, erreur, vérification]
cible: TRF-0001
catégorie: erreur
vérifie: [TRF-0001]
dérive_de: [TRF-0001]
données_entrée:
  prix_acquisition: null
résultat_attendu:
  prix_revient: null
verdict: "Conforme si la Transformation est bloquée et l'entrée manquante identifiée"
---

# VER-003 — Erreur – Prix d'acquisition absent

## Contexte

Le prix d'acquisition n'est pas renseigné.

## Traitement attendu

La précondition `prix_acquisition > 0` n'est pas satisfaite. La Transformation ne s'exécute pas. Le système identifie l'entrée manquante et la signale.
