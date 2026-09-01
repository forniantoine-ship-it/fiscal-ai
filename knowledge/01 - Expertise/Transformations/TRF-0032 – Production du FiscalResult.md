---
id: TRF-0032
title: "Production du FiscalResult"
type: transformation
status: approved
version: "1.0"
created: 2026-06-29
updated: 2026-06-29
owner: product-owner
tags: [résultat-fiscal, fiscal-result, liasse]
catégorie: mapping
---

# TRF-0032 — Production du FiscalResult

## Entrées

Toutes les sorties de TRF-0029, TRF-0030, TRF-0031.

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
