---
id: RAI-012
title: "Qualification des travaux"
type: raisonnement
status: approved
version: "1.0"
created: 2026-06-29
updated: 2026-06-29
owner: product-owner
tags: [travaux, qualification, raisonnement]
objectif: "Déterminer le traitement comptable et fiscal d'une dépense de travaux"
prémisses: [AX-013, AX-014, SAV-022, SAV-023, SAV-025]
conclusion: "Chaque travail est classé : charge, immobilisation, ou renouvellement de composant"
condition_de_sortie: "Tous les travaux sont qualifiés avec destination et durée"
justifie: [TRF-0026, TRF-0027, TRF-0028]
décision_source: DEC-TR-001 à DEC-TR-005
---

# RAI-012 — Qualification des travaux

## Étapes

1. Vérifier que la dépense est un travail (DEC-TR-001).
2. Déterminer la nature : entretien, amélioration, construction, renouvellement (DEC-TR-002).
3. Qualifier : charge ou immobilisation (DEC-TR-003 via JUG-008 v2).
4. Si renouvellement → identifier le composant à sortir (DEC-TR-004).
5. Si immobilisation → déterminer la durée (DEC-TR-005 via JUG-013).
6. Produire les sorties pour les flux Charges et Amortissements.

## Frontière

Le flux Travaux ne calcule jamais l'amortissement. Il produit les composants avec leur montant et durée. Le flux Amortissements les intègre au plan.

Le flux Travaux ne totalise jamais les charges. Il produit les charges de travaux avec leur montant. Le flux Charges les intègre à la totalisation.
