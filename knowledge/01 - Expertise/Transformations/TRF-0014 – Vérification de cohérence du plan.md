---
id: TRF-0014
title: Vérification de cohérence du plan d'amortissement
type: transformation
status: approved
version: "1.1"
created: 2026-06-29
updated: 2026-06-29
owner: product-owner
source: Comptabilité générale
tags: [amortissement, cohérence, vérification, plan]
catégorie: filtre
fonde: [AX-007]
conditions:
  formelle: "plan_amortissement non vide"
  naturelle: "S'applique après l'assemblage du plan (TRF-0012)"
décision_source: Global (garde-fou)
entrées:
  - nom: plan_amortissement
    type: "tableau {lignes[], total_annuel_exercice, total_brut}"
    produit_par: TRF-0012
    obligatoire: true
  - nom: base_amortissable_bâti
    type: montant
    produit_par: TRF-0002
    obligatoire: true
  - nom: montant_mobilier_total
    type: montant
    produit_par: "TRF-0001 ou Observations"
    obligatoire: true
sorties:
  - nom: plan_validé
    type: booléen
  - nom: anomalies
    type: "liste de {type, message, composant}"
    confiance: certaine
gardes:
  - "total_brut == base_amortissable_bâti + montant_mobilier_total"
  - "chaque VNC >= 0"
  - "chaque dotation_exercice >= 0"
  - "amortissements_cumulés <= valeur_brute pour chaque ligne"
---

# TRF-0014 — Vérification de cohérence du plan d'amortissement

## Responsabilité

Vérifier que le plan assemblé par TRF-0012 est mathématiquement et comptablement cohérent. Cette Transformation ne produit pas de données fiscales — elle constate si le plan est valide ou non.

## Logique

```
anomalies = []

SI total_brut != base_amortissable_bâti + montant_mobilier_total :
    anomalies.ajouter({type: "fatal", message: "Total brut ≠ base amortissable + mobilier"})

Pour chaque ligne :
    SI vnc < 0 :
        anomalies.ajouter({type: "fatal", message: "VNC négative", composant})
    SI amortissements_cumulés > valeur_brute :
        anomalies.ajouter({type: "fatal", message: "Amortissements > valeur brute", composant})
    SI dotation_exercice < 0 :
        anomalies.ajouter({type: "erreur", message: "Dotation négative", composant})

plan_validé = anomalies est vide
```
