---
id: TRF-0012
title: Assemblage du plan d'amortissement
type: transformation
status: approved
version: "1.0"
created: 2026-06-29
updated: 2026-06-29
owner: product-owner
source: Pratique comptable
tags: [amortissement, plan, assemblage]
catégorie: calcul
fonde: [AX-004]
précède: [TRF-0014]
conditions:
  formelle: "composants_bâti non vide AND dotations_année_1 non vide"
  naturelle: "S'applique quand tous les composants et les dotations proratisées sont calculés"
décision_source: Global
entrées:
  - nom: composants_bâti
    type: "liste de {composant, montant, durée, dotation_annuelle}"
    produit_par: TRF-0009
    obligatoire: true
  - nom: composants_mobilier
    type: "liste de {label, montant, durée, dotation_annuelle}"
    produit_par: TRF-0010
    obligatoire: true
  - nom: dotations_année_1
    type: "liste de {composant, dotation_proratisée}"
    produit_par: TRF-0011
    obligatoire: true
  - nom: exercice_fiscal
    type: "année (YYYY)"
    obligatoire: true
sorties:
  - nom: plan_amortissement
    type: "tableau {lignes[], total_annuel_exercice, total_brut}"
    confiance: héritée
---

# TRF-0012 — Assemblage du plan d'amortissement

## Responsabilité

Assembler toutes les lignes d'amortissement en un plan unique. Calculer le total annuel pour l'exercice demandé.

Cette Transformation ne vérifie pas la cohérence — c'est la responsabilité de TRF-0014.

## Logique

```
lignes = composants_bâti + composants_mobilier

Pour chaque ligne :
    SI exercice == première année :
        dotation_exercice = dotation_proratisée (depuis dotations_année_1)
    SINON SI exercice > première année + durée :
        dotation_exercice = 0 (composant terminé)
    SINON SI exercice == dernière année :
        dotation_exercice = complément du prorata initial
    SINON :
        dotation_exercice = dotation_annuelle

    amortissements_cumulés = somme des dotations des exercices précédents + dotation_exercice
    vnc = montant - amortissements_cumulés

total_annuel_exercice = somme des dotation_exercice de toutes les lignes
total_brut = somme des montants de toutes les lignes
```
