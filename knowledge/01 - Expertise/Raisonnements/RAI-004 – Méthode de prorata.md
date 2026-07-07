---
id: RAI-004
title: Méthode de prorata
type: raisonnement
status: approved
version: "1.0"
created: 2026-06-29
updated: 2026-06-29
owner: product-owner
tags: [amortissement, prorata, méthode, raisonnement]
objectif: "Déterminer la méthode de calcul du prorata temporis"
prémisses: [SAV-009]
conclusion: "Le prorata est calculé en jours. Constant sur toute la durée du plan."
condition_de_sortie: "La méthode est fixée"
justifie: [TRF-0011]
décision_source: DEC-AM-007
---

# RAI-004 — Méthode de prorata

Le prorata en jours est retenu par défaut. La précision ne coûte rien en calcul automatisé et évite les approximations du prorata en mois.

Ce choix est un paramètre système, pas un jugement au cas par cas. Il est appliqué uniformément à tous les dossiers et tous les exercices.
