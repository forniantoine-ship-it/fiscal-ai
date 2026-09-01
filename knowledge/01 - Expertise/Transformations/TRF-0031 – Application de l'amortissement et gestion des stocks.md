---
id: TRF-0031
title: "Application de l'amortissement et gestion des stocks"
type: transformation
status: approved
version: "1.0"
created: 2026-06-29
updated: 2026-06-29
owner: product-owner
tags: [résultat-fiscal, amortissement, stocks, déficits, report]
catégorie: calcul
fonde: [AX-015, AX-016, AX-017]
requiert: [SAV-027]
---

# TRF-0031 — Application de l'amortissement et gestion des stocks

## Entrées

- résultat_avant_amort
- amortissement_calculé (total_annuel_exercice de TRF-0012)
- stock_déficits_antérieurs : liste de { millésime, montant }
- stock_amort_reportés : montant
- exercice : année

## Sorties

- résultat_fiscal : montant
- amort_déduit : montant
- amort_reporté_nouveau : montant
- déficit_nouveau : montant (si résultat avant amort < 0)
- déficits_imputés : montant
- amort_reportés_utilisés : montant
- stock_déficits_mis_à_jour : liste de { millésime, montant }
- stock_amort_reportés_mis_à_jour : montant
- déficits_expirés : liste de { millésime, montant }

## Logique

Voir RAI-014 pour la séquence complète.
