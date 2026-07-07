---
id: TRF-0013
title: Reconstitution du plan d'amortissement antérieur
type: transformation
status: approved
version: "1.0"
created: 2026-06-29
updated: 2026-06-29
owner: product-owner
source: Pratique comptable
tags: [amortissement, reconstitution, continuation, reprise]
catégorie: calcul
requiert: [SAV-010]
conditions:
  formelle: "mode_amortissement == 'reconstitution'"
  naturelle: "S'applique uniquement quand le plan antérieur est absent et doit être reconstitué"
décision_source: DEC-AM-008
entrées:
  - nom: liasse_2033_C
    type: "objet structuré ou null"
    obligatoire: false
  - nom: déclarations_passées
    type: "données historiques"
    obligatoire: false
  - nom: acte_notarié_origine
    type: document
    obligatoire: true
sorties:
  - nom: plan_reconstitué
    type: "liste de {composant, valeur_brute, amortissements_cumulés, vnc, durée_restante}"
    confiance: modérée
---

# TRF-0013 — Reconstitution du plan d'amortissement antérieur

## Responsabilité

Reconstruire un plan d'amortissement quand le client arrive sans liasse exploitable. La confiance de la sortie est `modérée` car la reconstitution implique des estimations.

## Logique

```
SI liasse_2033_C disponible :
    Reprendre directement les lignes de la liasse
    confiance = haute

SI liasse absente mais déclarations passées disponibles :
    Recalculer les amortissements théoriques depuis l'acte d'origine
    Vérifier la cohérence avec les montants déclarés
    confiance = modérée

SI aucun document historique :
    Estimer les VNC actuelles à partir de l'acte d'origine et de l'ancienneté
    confiance = faible
    Signaler le risque au client
```
