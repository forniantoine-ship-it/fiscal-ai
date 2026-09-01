---
id: RAI-014
title: "Calcul du résultat fiscal LMNP"
type: raisonnement
status: approved
version: "1.0"
created: 2026-06-29
updated: 2026-06-29
owner: product-owner
tags: [résultat-fiscal, raisonnement, orchestration]
objectif: "Produire le résultat fiscal à partir des sorties de tous les domaines"
prémisses: [AX-015, AX-016, AX-017, SAV-027, SAV-028]
conclusion: "Un objet FiscalResult unique contenant le résultat, les stocks mis à jour et la trace"
condition_de_sortie: "Résultat fiscal calculé, stocks mis à jour, cohérence vérifiée"
justifie: [TRF-0029, TRF-0030, TRF-0031, TRF-0032]
---

# RAI-014 — Calcul du résultat fiscal LMNP

## Nature

Ce Raisonnement est un orchestrateur, pas un simple calcul. Il consomme les sorties validées de tous les domaines et produit un résultat unique.

## Séquence

1. Collecter les recettes (TRF-0029)
2. Calculer le résultat avant amortissement (TRF-0030)
3. Appliquer l'amortissement avec plafonnement et gestion des stocks (TRF-0031)
4. Produire le FiscalResult (TRF-0032)

## Entrées consommées

| Entrée | Source |
|---|---|
| total_charges_déductibles | TRF-0020 (Charges) |
| charges_pré_exploitation | TRF-0025 (Pré-exploitation) |
| total_annuel_exercice (amortissement) | TRF-0012 (Amortissements) |
| plan_validé | TRF-0014 (Amortissements) |
| perte_exceptionnelle | TRF-0027 (Travaux, si applicable) |
| recettes | TRF-0029 (ce domaine) |

## Sortie

Un objet FiscalResult unique.
