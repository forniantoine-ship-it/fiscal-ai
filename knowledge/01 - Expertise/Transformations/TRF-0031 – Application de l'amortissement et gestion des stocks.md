---
id: TRF-0031
title: "Application de l'amortissement et gestion des stocks"
type: transformation
status: approved
version: "1.1"
created: 2026-06-29
updated: 2026-10-05
owner: product-owner
tags: [résultat-fiscal, amortissement, stocks, déficits, report]
catégorie: calcul
fonde: [AX-015, AX-016, AX-017]
requiert: [SAV-030, SAV-031]
---

# TRF-0031 — Application de l'amortissement et gestion des stocks

## Entrées

- résultat_avant_amort (résultat global avant amortissement, TRF-0030)
- loyers_acquis_39C (L), charges_B, charges_ACTIVITY, autres_produits_hors_L, montants_non_qualifiés (classification : SAV-031)
- amortissement_calculé (total_annuel_exercice de TRF-0012)
- stock_déficits_antérieurs : liste de { millésime, montant }
- stock_amort_reportés : montant
- exercice : année

## Sorties

- résultat_fiscal : montant
- amort_déduit : montant
- amort_reporté_nouveau : montant
- déficit_nouveau : montant (si le résultat courant après amortissements déduits est négatif, SAV-030)
- déficits_imputés : montant
- amort_reportés_utilisés : montant
- stock_déficits_mis_à_jour : liste de { millésime, montant }
- stock_amort_reportés_mis_à_jour : montant
- déficits_expirés : liste de { millésime, montant }

## Logique

SAV-030. La capacité 39 C est `C = max(0, L − B)`, et non le résultat avant amortissement. Elle ne dépend ni des charges `ACTIVITY`, ni des autres produits, ni des déficits antérieurs. Ordre : calcul de `C` ; dotation courante dans la limite de `C` ; ARD historique dans la capacité restante ; résultat courant après amortissements ; déficits antérieurs sur le seul bénéfice restant. Une qualification non résolue relève de la règle fail-closed de SAV-030 (`NEEDS_QUALIFICATION`, pas de résultat définitif si la divergence entre branches est matérielle). Pour plusieurs biens, `C` est calculée globalement (SAV-031).

Voir RAI-014 pour la séquence d'orchestration.
