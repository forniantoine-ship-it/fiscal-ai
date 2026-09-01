---
id: VER-005
title: Ventilation avec mobilier isolé
type: vérification
status: approved
version: "1.0"
created: 2026-06-29
updated: 2026-06-29
owner: product-owner
tags: [lmnp, ventilation, mobilier, limite, vérification]
cible: TRF-0002
catégorie: limite
vérifie: [TRF-0002]
dérive_de: [TRF-0002]
données_entrée:
  prix_revient: 186400
  montant_mobilier_isolé: 8000
  ratio_terrain: 0.20
résultat_attendu:
  valeur_terrain: 35680
  valeur_bâti: 142720
  base_amortissable_bâti: 142720
verdict: "Conforme si terrain + bâti + mobilier == prix_revient (35680 + 142720 + 8000 == 186400)"
---

# VER-005 — Ventilation avec mobilier isolé

## Contexte

Prix de revient 186 400 € (frais intégrés, mobilier de 8 000 € déjà isolé). Ratio terrain 20%.

## Traitement attendu

1. prix_hors_mobilier = 186 400 - 8 000 = 178 400 €
2. valeur_terrain = 178 400 × 0,20 = 35 680 €
3. valeur_bâti = 178 400 × 0,80 = 142 720 €
4. Cohérence : 35 680 + 142 720 + 8 000 = 186 400 ✓
