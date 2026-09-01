---
id: JUG-005
title: Durées d'amortissement par composant
type: jugement
status: approved
version: "1.0"
created: 2026-06-29
updated: 2026-06-29
owner: product-owner
source: Pratique professionnelle
tags: [amortissement, durées, composants]
question: "Quelle durée d'amortissement retenir pour chaque composant ?"
alternatives:
  - "A — Durées standard (50/25/25/25/15/15 ans). Défendable, conservateur."
  - "B — Durées ajustées à l'âge du bien. Plus optimisé mais nécessite une justification."
  - "C — Durées raccourcies avec justification technique. Plus agressif, risque de contrôle accru."
choix: "A par défaut"
justification: "Les durées standard sont les plus communément admises. Elles correspondent aux fourchettes SAV-005. Un écart doit être justifié par l'état réel du composant."
confiance: haute
réversibilité: "Oui — modifiable tant que le plan n'est pas validé. Après validation, les durées sont figées pour la durée de vie du composant."
propriétaire: utilisateur
decision_type: fiscal
paramètre: [TRF-0009]
grounded_in: []
décision_source: DEC-AM-003
---

# JUG-005 — Durées d'amortissement par composant

## Contexte

La durée d'amortissement doit correspondre à la "durée normale d'utilisation" du composant. Ce n'est pas sa durée de vie physique — c'est la durée pendant laquelle il remplit sa fonction sans remplacement majeur.

## Gardes-fous

- Aucune durée ne doit sortir des fourchettes SAV-005 sans justification documentée.
- Les durées choisies doivent être constantes sur toute la vie du composant.
