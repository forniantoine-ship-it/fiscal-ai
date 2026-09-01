---
id: TRF-0026
title: "Qualification d'un travail"
type: transformation
status: approved
version: "1.0"
created: 2026-06-29
updated: 2026-06-29
owner: product-owner
tags: [travaux, qualification, transformation]
catégorie: classification
fonde: [AX-013, AX-014]
paramètre: [JUG-008]
requiert: [SAV-022, SAV-025]
décision_source: DEC-TR-001, DEC-TR-002, DEC-TR-003
---

# TRF-0026 — Qualification d'un travail

## Entrées

- description : string
- montant : montant
- nature_intervention : enum (entretien, amélioration, construction, renouvellement)

## Sorties

- qualification : enum (charge, immobilisation)
- destination_flux : enum (charges, amortissements)
- nature_travail : string
