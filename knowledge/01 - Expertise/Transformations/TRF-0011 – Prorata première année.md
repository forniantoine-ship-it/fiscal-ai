---
id: TRF-0011
title: Prorata première année
type: transformation
status: approved
version: "1.0"
created: 2026-06-29
updated: 2026-06-29
owner: product-owner
source: Pratique comptable
tags: [amortissement, prorata, première-année]
catégorie: calcul
fonde: [AX-006]
requiert: [SAV-009]
précède: [TRF-0012]
conditions:
  formelle: "date_debut_amortissement est renseignée AND composants non vides"
  naturelle: "S'applique quand la date de début et les composants sont déterminés"
décision_source: DEC-AM-005, DEC-AM-007
entrées:
  - nom: date_debut_amortissement
    type: date
    produit_par: RAI-003
    obligatoire: true
  - nom: méthode_prorata
    type: "enum (jours, mois)"
    produit_par: RAI-004
    obligatoire: true
  - nom: composants_bâti
    type: "liste de {composant, montant, durée, dotation_annuelle}"
    produit_par: TRF-0009
    obligatoire: true
  - nom: composants_mobilier
    type: "liste de {label, montant, durée, dotation_annuelle}"
    produit_par: TRF-0010
    obligatoire: true
  - nom: exercice_fiscal
    type: "année (YYYY)"
    obligatoire: true
sorties:
  - nom: dotations_année_1
    type: "liste de {composant, dotation_proratisée}"
    confiance: héritée
gardes:
  - "chaque dotation_proratisée >= 0"
  - "chaque dotation_proratisée <= dotation_annuelle correspondante"
---

# TRF-0011 — Prorata première année

## Logique

```
fin_exercice = 31 décembre de l'exercice fiscal

SI méthode_prorata == "jours" :
    nombre_jours = fin_exercice - date_debut_amortissement + 1
    jours_exercice = 365 (ou 366 si bissextile)
    ratio = nombre_jours / jours_exercice

SI méthode_prorata == "mois" :
    nombre_mois = 12 - mois(date_debut_amortissement) + 1
    ratio = nombre_mois / 12

Pour chaque composant (bâti + mobilier) :
    dotation_proratisée = dotation_annuelle × ratio
```
