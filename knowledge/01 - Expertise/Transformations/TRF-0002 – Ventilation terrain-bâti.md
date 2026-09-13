---
id: TRF-0002
title: Ventilation terrain-bâti
type: transformation
status: approved
version: "1.1"
created: 2026-06-29
updated: 2026-09-13
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
  naturelle: "S'applique après TRF-0001, sur le prix de revient immobilier déjà hors mobilier (TRF-0001 isole le mobilier une seule fois — AX-003)"
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
  - "valeur_terrain + valeur_bâti == prix_revient"
---

# TRF-0002 — Ventilation terrain-bâti

## Objectif

Séparer le prix de revient immobilier — déjà hors mobilier en sortie de TRF-0001 — en part terrain (non amortissable) et part bâti (amortissable).

## Logique

```
valeur_terrain = prix_revient × ratio_terrain

valeur_bâti = prix_revient × (1 - ratio_terrain)

base_amortissable_bâti = valeur_bâti
```

Le mobilier (`montant_mobilier_isolé`) a déjà été isolé une seule fois par TRF-0001 (AX-003). TRF-0002 ne le retranche pas une seconde fois : il ventile directement le prix de revient reçu.

## Garde-fou de cohérence

```
valeur_terrain + valeur_bâti == prix_revient
```

Si cette égalité n'est pas vérifiée, la Transformation est en erreur.

## Invariant de conservation (acquisition avec mobilier inclus)

Quand le mobilier était inclus dans le prix d'acquisition (TRF-0001), la valeur totale se conserve sur l'ensemble de la chaîne :

```
valeur_terrain + valeur_bâti + montant_mobilier_isolé
== prix_acquisition + frais_acquisition_incorporés
```

Cet invariant relie TRF-0001 et TRF-0002 ; il ne remplace pas le garde-fou local de TRF-0002 ci-dessus, qui porte uniquement sur `prix_revient`.
