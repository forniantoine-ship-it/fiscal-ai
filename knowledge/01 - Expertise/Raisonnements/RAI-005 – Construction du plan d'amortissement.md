---
id: RAI-005
title: Construction du plan d'amortissement
type: raisonnement
status: approved
version: "1.0"
created: 2026-06-29
updated: 2026-06-29
owner: product-owner
tags: [amortissement, plan, raisonnement, global]
objectif: "Assembler le plan d'amortissement complet à partir de ses composants"
prémisses: [AX-004, AX-005, AX-006, AX-007]
conclusion: "Un plan d'amortissement complet, vérifiable, avec toutes les lignes et le total annuel"
condition_de_sortie: "Total brut = prix de revient. VNC ≥ 0 pour toutes les lignes."
justifie: [TRF-0012, TRF-0014]
---

# RAI-005 — Construction du plan d'amortissement

## Frontière avec le flux Acquisition

Le flux Acquisition produit :
- `prix_revient` (TRF-0001)
- `base_amortissable_bâti` (TRF-0002)
- `montant_mobilier_isolé` (TRF-0001)

Le flux Amortissements consomme ces sorties. Il ne les recalcule jamais.

## Étapes

### Étape 1 — Déterminer le mode (RAI-002)

Création, continuation ou reconstitution.

### Étape 2 — Décomposer le bâti (TRF-0009)

Appliquer la grille de composants (JUG-004) avec les durées retenues (JUG-005) sur la base amortissable du bâti.

### Étape 3 — Traiter le mobilier (TRF-0010)

Appliquer le mode lot ou détaillé (JUG-006) sur le montant du mobilier isolé.

### Étape 4 — Calculer le prorata (TRF-0011)

Appliquer le prorata de la première année selon la date de début (RAI-003) et la méthode retenue (RAI-004).

### Étape 5 — Assembler le plan (TRF-0012)

Réunir toutes les lignes (bâti + mobilier + travaux éventuels). Calculer le total annuel.

### Étape 6 — Vérifier la cohérence (TRF-0014)

Contrôler que le total des valeurs brutes = prix de revient. Contrôler que toutes les VNC ≥ 0.
