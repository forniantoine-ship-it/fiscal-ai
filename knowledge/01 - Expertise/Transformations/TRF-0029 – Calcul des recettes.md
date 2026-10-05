---
id: TRF-0029
title: "Calcul des recettes"
type: transformation
status: deprecated
version: "1.1"
created: 2026-06-29
updated: 2026-10-05
owner: product-owner
tags: [résultat-fiscal, recettes, legacy-v1]
catégorie: calcul
requiert: [SAV-028]
superseded_by: TRF-0036
---

# TRF-0029 — Calcul des recettes

🔴 **LEGACY V1 ONLY. Ne constitue plus le calcul canonique des recettes locatives du produit cible. Remplacée par [[TRF-0036 – Rattachement des loyers ordinaires à l'exercice (F013 v2)]].**

Cette transformation décrit des recettes comme une collecte de montants (loyers mensuels et autres recettes), c'est-à-dire la logique « encaissements » de [[SAV-028 – Les recettes sont les loyers encaissés]] (elle-même `LEGACY V1 ONLY`). Elle est insuffisante : les loyers ordinaires se rattachent à l'exercice par `Loyers acquis N = E + CC − CO + AO − AC`.

**CURRENT PRODUCTION :** F013 v1 reste productif et correspond encore, en pratique, à cette description (avec ses ajustements janvier/décembre historiques). Le moteur cible (TRF-0036) est implémenté mais désactivé et non branché à F006. Ce document est conservé pour la traçabilité (KS-004) ; ne pas l'utiliser pour de nouveaux développements.

*Note de dépendance (KS-004) :* [[TRF-0030 – Résultat avant amortissement]] consomme un `total_recettes` générique et reste valide quel que soit le mode de calcul des recettes ; [[TRF-0032 – Production du FiscalResult]] et [[RAI-014 – Calcul du résultat fiscal LMNP]] référencent encore TRF-0029 / SAV-028 : leur réalignement relève de la tranche qui branchera F013 v2 à F006 (décision du Product Owner).

---

# Description historique (archivée)

## Entrées

- loyers_mensuels : liste de { mois, montant }
- autres_recettes : montant (indemnités, dépôts conservés)

## Sorties

- total_recettes : montant

*(L'entrée « dépôts conservés » est reprise telle qu'historiquement approuvée. Le dépôt de garantie n'est jamais un loyer ordinaire : voir TRF-0036.)*
