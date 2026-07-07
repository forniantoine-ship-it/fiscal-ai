---
id: VER-004
title: Ventilation nominale – Ville moyenne
type: vérification
status: approved
version: "1.0"
created: 2026-06-29
updated: 2026-06-29
owner: product-owner
tags: [lmnp, ventilation, terrain, bâti, nominal, vérification]
cible: TRF-0002
catégorie: nominal
vérifie: [TRF-0002]
dérive_de: [TRF-0002]
données_entrée:
  prix_revient: 199400
  montant_mobilier_isolé: 0
  ratio_terrain: 0.20
résultat_attendu:
  valeur_terrain: 39880
  valeur_bâti: 159520
  base_amortissable_bâti: 159520
verdict: "Conforme si valeur_terrain == 39880 et valeur_bâti == 159520 et terrain + bâti == prix_revient"
---

# VER-004 — Ventilation nominale – Ville moyenne

## Contexte

Prix de revient 199 400 €. Pas de mobilier. Ratio terrain 20% (ville moyenne).

## Traitement attendu

1. prix_hors_mobilier = 199 400 - 0 = 199 400 €
2. valeur_terrain = 199 400 × 0,20 = 39 880 €
3. valeur_bâti = 199 400 × 0,80 = 159 520 €
4. Cohérence : 39 880 + 159 520 = 199 400 ✓
