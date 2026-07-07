---
id: RAI-013
title: "Assemblage du plan d'amortissement"
type: raisonnement
status: approved
version: "1.0"
created: 2026-06-29
updated: 2026-06-29
owner: product-owner
tags: [amortissement, plan, assemblage, raisonnement]
objectif: "Assembler un plan d'amortissement unique à partir de toutes les sources"
prémisses: [AX-004, AX-005, AX-007, SAV-026]
conclusion: "Un plan unique, ordonné, vérifiable"
condition_de_sortie: "Tous les composants intégrés, plan cohérent"
justifie: [TRF-0012, TRF-0014]
---

# RAI-013 — Assemblage du plan d'amortissement

## Étapes

1. Collecter les composants d'acquisition (TRF-0009 + TRF-0010).
2. Collecter les composants travaux (TRF-0028), si existants.
3. Marquer les composants sortis (TRF-0027), si existants.
4. Assembler dans un plan unique, trié par date de début.
5. Pour chaque composant actif de l'exercice demandé :
   - Calculer la dotation (pleine, proratisée première année, proratisée dernière année, ou 0 si terminé).
   - Calculer les amortissements cumulés.
   - Calculer la VNC.
6. Totaliser les dotations de l'exercice.
7. Vérifier la cohérence (TRF-0014).
