---
id: VER-055
title: "Mission erreur, statut de dossier invalide"
type: vérification
status: draft
version: "1.0"
created: 2026-07-05
updated: 2026-07-05
owner: product-owner
tags: [mission-engine, priorisation, vérification, erreur]
cible: TRF-0033
catégorie: erreur
vérifie: [TRF-0033]
---

# VER-055 — Mission erreur, statut de dossier invalide

## Scénario

`statut_dossier` absent, ou renseigné avec une valeur hors de l'énumération de STATE-001.

Résultat attendu : aucune `mission_active` n'est produite. La Transformation signale une anomalie de cohérence amont (violation de la garantie STATE-001 : *"un dossier ne peut être que dans un seul état"* reconnu) plutôt que de produire une Mission par défaut arbitraire.
