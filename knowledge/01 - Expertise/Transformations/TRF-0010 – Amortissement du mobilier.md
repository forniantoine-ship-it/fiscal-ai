---
id: TRF-0010
title: Amortissement du mobilier
type: transformation
status: approved
version: "1.1"
created: 2026-06-29
updated: 2026-06-29
owner: product-owner
source: Pratique comptable
tags: [amortissement, mobilier]
catégorie: calcul
fonde: [AX-003, AX-004]
paramètre: [JUG-006]
requiert: [SAV-006]
précède: [TRF-0012]
conditions:
  formelle: "montant_mobilier_total >= 0"
  naturelle: "S'applique quand le montant du mobilier est déterminé. Si 0, produit une liste vide."
décision_source: DEC-AM-004
entrées:
  - nom: montant_mobilier_total
    type: montant
    produit_par: "TRF-0001 (si mobilier inclus dans le prix) ou Observations (si mobilier acheté séparément)"
    obligatoire: true
    note: "Deux sources possibles selon le cas. Si le mobilier était inclus dans le prix d'acquisition, TRF-0001 l'a isolé et produit montant_mobilier_total. Si le mobilier a été acheté séparément, le montant provient directement des Observations (factures)."
  - nom: lignes_mobilier
    type: "liste de {label, montant, durée_années} ou {montant_total, durée_moyenne}"
    produit_par: JUG-006
    obligatoire: true
sorties:
  - nom: composants_mobilier
    type: "liste de {label, montant, durée, dotation_annuelle}"
    confiance: héritée
gardes:
  - "somme des montants == montant_mobilier_total"
  - "chaque durée entre 3 et 15 ans"
---

# TRF-0010 — Amortissement du mobilier

## Logique

```
SI mode lot :
    dotation_annuelle = montant_mobilier_total / durée_moyenne
    composants_mobilier = [{ label: "Mobilier (lot)", montant, durée, dotation_annuelle }]

SI mode détaillé :
    Pour chaque ligne :
        dotation_annuelle = montant / durée_années
    composants_mobilier = liste des lignes avec dotation calculée
```
