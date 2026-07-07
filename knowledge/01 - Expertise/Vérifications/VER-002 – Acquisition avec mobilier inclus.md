---
id: VER-002
title: Acquisition avec mobilier inclus
type: vérification
status: approved
version: "1.0"
created: 2026-06-29
updated: 2026-06-29
owner: product-owner
tags: [lmnp, acquisition, mobilier, limite, vérification]
cible: TRF-0001
catégorie: limite
vérifie: [TRF-0001]
dérive_de: [TRF-0001]
données_entrée:
  prix_acquisition: 180000
  mobilier_inclus: true
  montant_mobilier: 8000
  frais_notaire: 14400
  frais_agence: 0
  choix_traitement_frais: intégration
résultat_attendu:
  prix_revient: 186400
  montant_mobilier_isolé: 8000
  frais_en_charges: 0
verdict: "Conforme si prix_revient == 186400 et montant_mobilier_isolé == 8000"
---

# VER-002 — Acquisition avec mobilier inclus

## Contexte

Appartement ancien acquis 180 000 € mobilier inclus. Mobilier estimé à 8 000 €. Frais de notaire 14 400 €. Pas de frais d'agence. Frais intégrés.

## Traitement attendu

1. Mobilier inclus → prix_hors_mobilier = 180 000 - 8 000 = 172 000 €
2. frais_acquisition_totaux = 14 400 €
3. prix_revient = 172 000 + 14 400 = 186 400 €
