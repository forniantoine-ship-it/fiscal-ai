---
id: JUG-007
title: Traitement d'un composant renouvelé
type: jugement
status: draft
version: "1.0"
created: 2026-06-29
updated: 2026-06-29
owner: product-owner
source: PCG, Pratique comptable
tags: [amortissement, composants, travaux, renouvellement]
question: "Quand des travaux renouvellent un composant, comment traiter le plan d'amortissement ?"
alternatives:
  - "A — Sortie de l'ancien (VNC en perte) + création du nouveau."
  - "B — Ajout du nouveau comme composant séparé sans toucher l'existant."
  - "C — Non applicable si les travaux sont classés en charges."
choix: "A si remplacement total identifiable. B si partiel. C si classé en charges."
justification: "La branche A est la plus rigoureuse. La branche B est plus simple mais crée de la redondance."
confiance: modérée
réversibilité: "Oui"
propriétaire: utilisateur
decision_type: fiscal
paramètre: []
grounded_in: [PCG art. 311-2]
décision_source: DEC-AM-006
---

# JUG-007 — Traitement d'un composant renouvelé

## Statut

Ce Jugement est partiellement modélisé. Il sera complété lors de la modélisation du flux Travaux.

La logique de sortie d'un composant (branche A) nécessite le flux Travaux pour déterminer :
- si les travaux sont une immobilisation ou une charge ;
- quel composant ils renouvellent ;
- quelle est la VNC restante de l'ancien composant.
