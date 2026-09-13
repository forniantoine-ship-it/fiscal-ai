---
id: VER-005
title: Ventilation avec mobilier isolé
type: vérification
status: approved
version: "1.1"
created: 2026-06-29
updated: 2026-09-13
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
  valeur_terrain: 37280
  valeur_bâti: 149120
  base_amortissable_bâti: 149120
verdict: "Conforme si terrain + bâti == prix_revient (37280 + 149120 == 186400)"
---

# VER-005 — Ventilation avec mobilier isolé

## Contexte

Prix de revient 186 400 € (frais intégrés, mobilier de 8 000 € déjà isolé par TRF-0001 — cf. VER-002). Ratio terrain 20%.

## Traitement attendu

1. valeur_terrain = 186 400 × 0,20 = 37 280 €
2. valeur_bâti = 186 400 × 0,80 = 149 120 €
3. Cohérence locale (garde-fou TRF-0002) : 37 280 + 149 120 = 186 400 ✓
4. Invariant de conservation global : 37 280 + 149 120 + 8 000 = 194 400 € = prix_acquisition (180 000) + frais_notaire (14 400) ✓
