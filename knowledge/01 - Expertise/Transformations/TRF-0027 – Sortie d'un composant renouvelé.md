---
id: TRF-0027
title: "Sortie d'un composant renouvelé"
type: transformation
status: approved
version: "1.0"
created: 2026-06-29
updated: 2026-06-29
owner: product-owner
tags: [travaux, composant, sortie, renouvellement]
catégorie: calcul
fonde: []
requiert: [SAV-023]
décision_source: DEC-TR-004
---

# TRF-0027 — Sortie d'un composant renouvelé

## Entrées

- composant_id : string
- valeur_brute : montant
- amortissements_cumulés : montant

## Sorties

- vnc_sortie : montant (valeur_brute - amortissements_cumulés)
- perte_exceptionnelle : montant (= vnc_sortie)
