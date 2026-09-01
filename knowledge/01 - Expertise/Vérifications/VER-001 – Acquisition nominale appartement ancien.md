---
id: VER-001
title: Acquisition nominale – Appartement ancien
type: vérification
status: approved
version: "1.0"
created: 2026-06-29
updated: 2026-06-29
owner: product-owner
tags: [lmnp, acquisition, nominal, vérification]
cible: TRF-0001
catégorie: nominal
vérifie: [TRF-0001]
dérive_de: [TRF-0001]
données_entrée:
  prix_acquisition: 180000
  mobilier_inclus: false
  frais_notaire: 14400
  frais_agence: 5000
  frais_agence_charge: acquéreur
  choix_traitement_frais: intégration
résultat_attendu:
  prix_revient: 199400
  montant_mobilier_isolé: 0
  frais_en_charges: 0
verdict: "Conforme si prix_revient == 199400"
---

# VER-001 — Acquisition nominale – Appartement ancien

## Contexte

Appartement ancien acquis 180 000 €. Frais de notaire 14 400 €. Frais d'agence 5 000 € à charge acquéreur. Pas de mobilier dans le prix. Frais intégrés au prix de revient.

## Traitement attendu

1. Pas de mobilier → prix_hors_mobilier = 180 000 €
2. Frais agence à charge acquéreur → inclus
3. frais_acquisition_totaux = 14 400 + 5 000 = 19 400 €
4. Intégration → prix_revient = 180 000 + 19 400 = 199 400 €
