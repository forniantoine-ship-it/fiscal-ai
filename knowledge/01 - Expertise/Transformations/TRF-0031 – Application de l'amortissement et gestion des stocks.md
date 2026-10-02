---
id: TRF-0031
title: "Application de l'amortissement et gestion des stocks"
type: transformation
status: approved
version: "1.0"
created: 2026-06-29
updated: 2026-10-02
owner: product-owner
tags: [résultat-fiscal, amortissement, stocks, déficits, report]
catégorie: calcul
fonde: [AX-015, AX-016, AX-017]
requiert: [SAV-030]
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

SAV-030. Le plafond 39 C est le résultat avant amortissement. Il ne dépend pas des déficits antérieurs. La dotation de l'exercice, puis le stock d'amortissements réputés différés, sont traités dans ce plafond. Les déficits antérieurs sont imputés ensuite sur le bénéfice restant.

Voir RAI-014 pour la séquence d'orchestration.
