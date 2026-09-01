---
id: SAV-026
title: "Structure du plan d'amortissement"
type: savoir
status: approved
version: "1.0"
created: 2026-06-29
updated: 2026-06-29
owner: product-owner
source: "PCG art. 311-2, 322-1, 322-4"
tags: [amortissement, plan, structure, composants]
catégorie: concept
domaine: comptable
authority: PCG
confidence: certaine
scope: immobilisations-BIC
force: obligatoire
stability: stable
éclaire: [TRF-0012, TRF-0014]
---

# SAV-026 — Structure du plan d'amortissement

Le plan d'amortissement regroupe tous les composants amortissables d'un bien immobilier.

Chaque composant contient :
- un identifiant unique
- un libellé
- une base amortissable (montant)
- une durée d'amortissement (années)
- une date de début (mise en service ou fin des travaux)
- une date de fin calculée (début + durée)
- une dotation annuelle (base / durée)
- un état (actif, sorti, totalement_amorti)
- une source (acquisition ou travaux)

Le plan est alimenté par trois sources :
1. Composants d'acquisition (TRF-0009, TRF-0010)
2. Composants travaux (TRF-0028)
3. Composants sortis (TRF-0027) — restent dans le plan avec état "sorti"

Un composant sorti ne génère plus de dotation. Un composant totalement amorti (VNC = 0) ne génère plus de dotation mais reste dans le plan.
