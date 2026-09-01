---
id: TRF-0001
title: Calcul du prix de revient
type: transformation
status: approved
version: "2.0"
created: 2026-06-28
updated: 2026-06-29
owner: product-owner
source: CGI art. 38 quinquies
tags: [lmnp, acquisition, prix-de-revient]
catégorie: calcul
fonde: [AX-002, AX-003]
éclaire: []
paramètre: [JUG-001, JUG-003]
requiert: [SAV-001, SAV-004]
précède: [TRF-0002]
justifie: []
vérifie: []
contredit: []
dérive_de: []
remplace: []
conditions:
  formelle: "regime == 'lmnp-reel' AND prix_acquisition > 0"
  naturelle: "S'applique à tout dossier LMNP au régime réel disposant d'un prix d'acquisition"
entrées:
  - nom: prix_acquisition
    type: montant
    rôle: null
    produit_par: null
    obligatoire: true
  - nom: mobilier_inclus
    type: booléen
    rôle: null
    produit_par: null
    obligatoire: true
  - nom: montant_mobilier
    type: montant
    rôle: null
    produit_par: null
    obligatoire: "si mobilier_inclus == vrai"
  - nom: frais_notaire
    type: montant
    rôle: frais_acquisition
    produit_par: null
    obligatoire: true
  - nom: frais_agence
    type: montant
    rôle: frais_acquisition
    produit_par: null
    obligatoire: false
  - nom: frais_agence_charge
    type: enum (acquéreur, vendeur)
    rôle: null
    produit_par: null
    obligatoire: "si frais_agence renseigné"
  - nom: choix_traitement_frais
    type: enum (intégration, déduction)
    rôle: null
    produit_par: JUG-001
    obligatoire: true
sorties:
  - nom: prix_revient
    type: montant
    confiance: héritée
  - nom: montant_mobilier_isolé
    type: montant
    confiance: héritée
  - nom: frais_en_charges
    type: montant
    confiance: héritée
gardes:
  - "prix_revient > 0"
  - "montant_mobilier_isolé >= 0"
  - "montant_mobilier_isolé < prix_acquisition * 0.30"
  - "frais_acquisition_totaux < prix_acquisition * 0.15"
---

# TRF-0001 — Calcul du prix de revient

## Objectif

Déterminer le coût total d'acquisition du bien tel qu'il sera utilisé comme base de tous les calculs fiscaux ultérieurs.

## Logique

```
SI mobilier_inclus == vrai :
    prix_hors_mobilier = prix_acquisition - montant_mobilier
    montant_mobilier_isolé = montant_mobilier
SINON :
    prix_hors_mobilier = prix_acquisition
    montant_mobilier_isolé = 0

SI frais_agence_charge == "vendeur" OU frais_agence absent :
    frais_acquisition_totaux = frais_notaire
SINON :
    frais_acquisition_totaux = frais_notaire + frais_agence

SI choix_traitement_frais == "intégration" :
    prix_revient = prix_hors_mobilier + frais_acquisition_totaux
    frais_en_charges = 0
SINON :
    prix_revient = prix_hors_mobilier
    frais_en_charges = frais_acquisition_totaux
```

## Exceptions

- Acquisition par donation → TRF-0001 ne s'applique pas (hors MVP)
- Acquisition en indivision → TRF-0001 ne s'applique pas (hors MVP)
- Acquisition en démembrement → TRF-0001 ne s'applique pas (hors MVP)
- Acquisition via SCI → TRF-0001 ne s'applique pas (hors MVP)

Ces cas doivent être détectés et signalés avant l'exécution de cette Transformation.

## Cas particuliers

- VEFA : le prix d'acquisition est le prix de l'acte VEFA, pas le prix de livraison
- Mobilier inclus dans le prix : isolé via JUG-003
- Travaux intégrés au prix : traités séparément dans TRF-0003
