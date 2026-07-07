---
id: RAI-002
title: Mode d'amortissement (création vs continuation)
type: raisonnement
status: approved
version: "1.0"
created: 2026-06-29
updated: 2026-06-29
owner: product-owner
tags: [amortissement, continuation, création, raisonnement]
objectif: "Déterminer si le plan d'amortissement est construit de zéro ou repris d'un existant"
prémisses: [AX-005, SAV-010]
conclusion: "Le mode est création, continuation avec reprise, ou continuation avec reconstitution"
condition_de_sortie: "Le mode est déterminé et les données nécessaires sont disponibles"
justifie: [TRF-0009, TRF-0013]
décision_source: DEC-AM-001
---

# RAI-002 — Mode d'amortissement

## Étapes

### Étape 1 — Vérifier l'historique

Le client a-t-il déjà déclaré des revenus LMNP pour ce bien ?

Si non → mode `création`. Aller à JUG-004.

### Étape 2 — Vérifier la disponibilité du plan antérieur

Si oui → existe-t-il une liasse 2033-C ou un bilan exploitable ?

Si oui → mode `continuation`. Reprendre les VNC et durées restantes.

Si non → mode `reconstitution`. Appliquer TRF-0013.
