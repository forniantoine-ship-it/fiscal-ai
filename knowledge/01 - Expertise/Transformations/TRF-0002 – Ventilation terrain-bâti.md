---
id: TRF-0002
title: Ventilation terrain-bâti
type: transformation
status: approved
version: "1.0"
created: 2026-06-29
updated: 2026-06-29
owner: product-owner
source: Doctrine fiscale
tags: [lmnp, terrain, bâti, ventilation, amortissement]
catégorie: calcul
fonde: [AX-001]
éclaire: []
paramètre: [JUG-002]
requiert: [SAV-003]
précède: [TRF-0006]
justifie: []
vérifie: []
contredit: []
dérive_de: []
remplace: []
conditions:
  formelle: "prix_revient > 0 AND montant_mobilier_isolé >= 0 AND ratio_terrain > 0 AND ratio_terrain < 1"
  naturelle: "S'applique après TRF-0001, quand le prix de revient et le mobilier sont déterminés"
entrées:
  - nom: prix_revient
    type: montant
    rôle: null
    produit_par: TRF-0001
    obligatoire: true
  - nom: montant_mobilier_isolé
    type: montant
    rôle: null
    produit_par: TRF-0001
    obligatoire: true
  - nom: ratio_terrain
    type: décimal (0-1)
    rôle: null
    produit_par: JUG-002
    obligatoire: true
sorties:
  - nom: valeur_terrain
    type: montant
    confiance: héritée
  - nom: valeur_bâti
    type: montant
    confiance: héritée
  - nom: base_amortissable_bâti
    type: montant
    confiance: héritée
gardes:
  - "valeur_terrain > 0"
  - "valeur_bâti > 0"
  - "ratio_terrain >= 0.05"
  - "ratio_terrain <= 0.45"
  - "valeur_terrain + valeur_bâti + montant_mobilier_isolé == prix_revient"
---

# TRF-0002 — Ventilation terrain-bâti

## Objectif

Séparer le prix de revient (hors mobilier) en part terrain (non amortissable) et part bâti (amortissable).

## Logique

```
prix_hors_mobilier = prix_revient - montant_mobilier_isolé

valeur_terrain = prix_hors_mobilier × ratio_terrain

valeur_bâti = prix_hors_mobilier × (1 - ratio_terrain)

base_amortissable_bâti = valeur_bâti
```

## Garde-fou de cohérence

```
valeur_terrain + valeur_bâti + montant_mobilier_isolé == prix_revient
```

Si cette égalité n'est pas vérifiée, la Transformation est en erreur.
