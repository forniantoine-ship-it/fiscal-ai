---
id: TRF-0009
title: Décomposition du bâti en composants
type: transformation
status: approved
version: "1.0"
created: 2026-06-29
updated: 2026-06-29
owner: product-owner
source: PCG art. 311-2
tags: [amortissement, composants, bâti, décomposition]
catégorie: calcul
fonde: [AX-004, AX-005]
paramètre: [JUG-004, JUG-005]
requiert: [SAV-007]
précède: [TRF-0012]
justifie: []
conditions:
  formelle: "base_amortissable_bâti > 0 AND grille_composants non vide AND somme_pourcentages == 100"
  naturelle: "S'applique quand la base amortissable du bâti et la grille de décomposition sont disponibles"
décision_source: DEC-AM-002, DEC-AM-003
entrées:
  - nom: base_amortissable_bâti
    type: montant
    produit_par: TRF-0002
    obligatoire: true
  - nom: grille_composants
    type: "liste de {composant, pourcentage, durée_années}"
    produit_par: JUG-004, JUG-005
    obligatoire: true
sorties:
  - nom: composants_bâti
    type: "liste de {composant, montant, durée, dotation_annuelle}"
    confiance: héritée
gardes:
  - "somme des pourcentages == 100"
  - "chaque montant > 0"
  - "chaque durée > 0"
  - "somme des montants == base_amortissable_bâti"
---

# TRF-0009 — Décomposition du bâti en composants

## Logique

```
Pour chaque composant de la grille :
    montant = base_amortissable_bâti × pourcentage / 100
    dotation_annuelle = montant / durée_années
```
