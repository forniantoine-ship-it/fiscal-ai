---
id: TRF-0030
title: "Résultat avant amortissement"
type: transformation
status: approved
version: "1.1"
created: 2026-06-29
updated: 2026-10-05
owner: product-owner
tags: [résultat-fiscal, résultat-avant-amort]
catégorie: calcul
---

# TRF-0030 — Résultat avant amortissement

## Entrées

- total_recettes
- total_charges_déductibles
- charges_pré_exploitation (si applicable)
- perte_exceptionnelle (si composant sorti)

## Sorties

- résultat_avant_amort : montant (peut être négatif)

## Logique

résultat_avant_amort = total_recettes - total_charges_déductibles - charges_pré_exploitation - perte_exceptionnelle

Cette grandeur est le **résultat global** avant amortissement. Ce n'est **pas** la capacité 39 C `C = max(0, L − B)` (SAV-030, SAV-031) : elle intègre les charges de pure activité et les autres produits, que `C` ignore.
