---
id: TRF-0032
title: "Production du FiscalResult"
type: transformation
status: approved
version: "1.0"
created: 2026-06-29
updated: 2026-10-05
owner: product-owner
tags: [résultat-fiscal, fiscal-result, liasse]
catégorie: mapping
---

# TRF-0032 — Production du FiscalResult

## Entrées

Toutes les sorties de TRF-0029, TRF-0030, TRF-0031.

> **Note 2026-10-05.** TRF-0029 est `deprecated` (`LEGACY V1 ONLY`) : c'est la **production actuelle**. Le contrat cible des recettes locatives ordinaires est [[TRF-0036 – Rattachement des loyers ordinaires à l'exercice (F013 v2)]] (implémenté mais désactivé, non branché à F006). Aucune bascule n'est documentée ici tant qu'elle n'existe pas ; ONE F006 reste l'invariant (une seule production du FiscalResult par activité).

## Sorties

Un objet FiscalResult unique contenant :

- exercice
- recettes
- charges_déductibles
- résultat_avant_amort
- amort_calculé
- amort_déduit
- amort_reporté
- résultat_fiscal
- stocks (déficits par millésime, amortissements reportés)
- trace complète
