---
id: RAI-001
title: Construction de la base amortissable
type: raisonnement
status: approved
version: "1.0"
created: 2026-06-29
updated: 2026-06-29
owner: product-owner
tags: [lmnp, acquisition, amortissement, raisonnement]
objectif: "Déterminer la base sur laquelle l'amortissement du bâti sera calculé"
prémisses: [AX-001, AX-002, AX-003, SAV-001, SAV-003, SAV-004]
conclusion: "La base amortissable du bâti est le prix de revient diminué du mobilier et de la part terrain"
condition_de_sortie: "Un montant unique, positif, justifié, prêt à être décomposé par composants"
justifie: [TRF-0001, TRF-0002]
précède: []
---

# RAI-001 — Construction de la base amortissable

## Objectif

Déterminer la valeur exacte sur laquelle l'amortissement du bâti sera calculé. Cette valeur conditionne directement le montant de l'amortissement annuel et donc le résultat fiscal.

## Prémisses

- AX-001 : Le terrain ne s'amortit jamais → il doit être retiré
- AX-002 : Le prix de revient inclut les frais d'acquisition → il faut d'abord calculer le prix de revient complet
- AX-003 : Le mobilier est un actif distinct → il doit être isolé avant la ventilation
- SAV-001 : Les frais comprennent droits de mutation, émoluments, débours, frais d'agence acquéreur
- SAV-003 : La ventilation terrain/bâti est estimable par ratios de localisation
- SAV-004 : La date d'acquisition est la date de l'acte authentique

## Étapes

### Étape 1 — Identifier la date d'acquisition

Lire l'acte notarié. Extraire la date de signature de l'acte authentique (SAV-004). Cette date ancre toute la suite.

Condition de passage : une date existe et est cohérente.

### Étape 2 — Identifier le prix d'acquisition

Lire le prix dans l'acte. Vérifier s'il inclut le mobilier ou non.

Condition de passage : un montant existe et correspond au décompte.

### Étape 3 — Isoler le mobilier

Si le mobilier est inclus dans le prix → le soustraire (AX-003).

La valeur du mobilier provient des factures ou de l'estimation du client (JUG-003).

Condition de passage : le prix est désormais hors mobilier.

### Étape 4 — Déterminer les frais d'acquisition

Lire le décompte du notaire. Identifier les frais d'agence et vérifier s'ils sont à charge acquéreur (SAV-001).

Condition de passage : le montant total des frais est identifié.

### Étape 5 — Calculer le prix de revient

Appliquer TRF-0001. Le résultat dépend de JUG-001 (intégration ou déduction des frais).

Condition de passage : le prix de revient est un montant unique et justifié.

### Étape 6 — Ventiler terrain / bâti

Appliquer TRF-0002. Le ratio provient de JUG-002 (suggestion par localisation, validation par l'utilisateur).

Condition de passage : la part terrain et la part bâti sont identifiées.

## Conclusion

La base amortissable du bâti = prix de revient - mobilier - part terrain.

Cette valeur est prête à être décomposée par composants (RAI-002, à venir).

## Condition de sortie

Un montant unique, positif, justifié par :
- L'acte notarié (prix et date)
- Le décompte du notaire (frais)
- Les factures ou liste de mobilier (mobilier isolé)
- Le ratio terrain/bâti choisi et documenté

Chaque composant est traçable. Aucune valeur n'est apparue sans origine.
