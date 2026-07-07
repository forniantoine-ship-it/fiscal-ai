---
id: TRF-0028
title: "Création d'un composant travaux"
type: transformation
status: approved
version: "1.0"
created: 2026-06-29
updated: 2026-06-29
owner: product-owner
tags: [travaux, composant, création, immobilisation]
catégorie: calcul
fonde: [AX-004]
paramètre: [JUG-013]
requiert: [SAV-024]
décision_source: DEC-TR-005
---

# TRF-0028 — Création d'un composant travaux

## Entrées

- montant_travaux : montant
- nature : enum (amélioration, construction, renouvellement)
- durée_amortissement : nombre d'années
- date_début : date (fin des travaux ou mise en service)

## Sorties

- nouveau_composant : { label, montant, durée, dotation_annuelle, date_début }
