---
id: RAI-014
title: "Calcul du résultat fiscal LMNP"
type: raisonnement
status: approved
version: "1.0"
created: 2026-06-29
updated: 2026-10-05
owner: product-owner
tags: [résultat-fiscal, raisonnement, orchestration]
objectif: "Produire le résultat fiscal à partir des sorties de tous les domaines"
prémisses: [AX-015, AX-016, AX-017, SAV-030, SAV-028]
conclusion: "Un objet FiscalResult unique contenant le résultat, les stocks mis à jour et la trace"
condition_de_sortie: "Résultat fiscal calculé, stocks mis à jour, cohérence vérifiée"
justifie: [TRF-0029, TRF-0030, TRF-0031, TRF-0032]
---

# RAI-014 — Calcul du résultat fiscal LMNP

## Nature

Ce Raisonnement est un orchestrateur, pas un simple calcul. Il consomme les sorties validées de tous les domaines et produit un résultat unique.

## Séquence

1. Collecter les recettes (TRF-0029 — **CURRENT PRODUCTION / LEGACY V1** ; contrat cible : TRF-0036, non branché — voir la note ci-dessous)
2. Calculer le résultat global avant amortissement (TRF-0030) — distinct de la capacité 39 C `C = max(0, L − B)`
3. Appliquer l'amortissement dans la limite de `C`, puis imputer les déficits antérieurs (TRF-0031, SAV-030)
4. Produire le FiscalResult (TRF-0032)

> **Note 2026-10-05 — recettes.** TRF-0029 et SAV-028 sont `deprecated` (`LEGACY V1 ONLY`) : la production actuelle (F013 v1) applique encore la logique « encaissements ». Le contrat cible des recettes locatives ordinaires est [[TRF-0036 – Rattachement des loyers ordinaires à l'exercice (F013 v2)]] (règle : [[SAV-034 – Rattachement des loyers à l'exercice (créances et avances)]], `approved`). F013 v2 est implémenté mais désactivé et **non branché à F006** : le présent raisonnement n'est pas modifié tant que cette bascule n'est pas décidée et réalisée. Le plafond 39 C reste une correction fiscale distincte, hors F013.

## Entrées consommées

| Entrée | Source |
|---|---|
| total_charges_déductibles | TRF-0020 (Charges) |
| charges_pré_exploitation | TRF-0025 (Pré-exploitation) |
| total_annuel_exercice (amortissement) | TRF-0012 (Amortissements) |
| plan_validé | TRF-0014 (Amortissements) |
| perte_exceptionnelle | TRF-0027 (Travaux, si applicable) |
| recettes | TRF-0029 (ce domaine — LEGACY V1, production actuelle ; cible TRF-0036) |

## Sortie

Un objet FiscalResult unique.
