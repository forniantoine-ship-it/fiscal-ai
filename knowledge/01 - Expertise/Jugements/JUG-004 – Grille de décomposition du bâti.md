---
id: JUG-004
title: Grille de décomposition du bâti
type: jugement
status: approved
version: "2.0"
created: 2026-06-29
updated: 2026-06-29
owner: product-owner
source: Pratique professionnelle
tags: [amortissement, composants, grille, bâti, appartement, maison]
question: "Quelle grille de décomposition par composants appliquer au bâti ?"
alternatives:
  - "A — Grille Appartement 6 composants (SAV-007 Grille A). Adaptée aux appartements en copropriété."
  - "B — Grille Maison 8 composants (SAV-007 Grille B). Adaptée aux maisons individuelles."
  - "C — Grille personnalisée. L'utilisateur ajuste chaque pourcentage."
  - "D — Grille simplifiée 3 composants (gros œuvre, installations techniques, agencements). Moins d'optimisation."
choix: "Sélection automatique selon le type de bien (A ou B), modifiable par l'utilisateur (C)"
justification: "Le type de bien détermine la grille de référence. L'utilisateur peut ensuite ajuster les pourcentages dans les limites de la cohérence. La sélection automatique évite de proposer une grille appartement pour une maison."
confiance: haute
réversibilité: "Oui — l'utilisateur peut modifier les pourcentages à tout moment avant la validation du plan."
propriétaire: utilisateur
decision_type: fiscal
paramètre: [TRF-0009]
grounded_in: [PCG art. 311-2]
décision_source: DEC-AM-002
---

# JUG-004 — Grille de décomposition du bâti

## Contexte

Il n'existe aucun barème légal pour la décomposition en composants. L'expert choisit les pourcentages selon le type de bien, son état et ce qui est défendable devant l'administration.

## Arbre de sélection

```
Type de bien ?
    ├── Appartement en copropriété → Grille A (6 composants)
    ├── Maison individuelle → Grille B (8 composants)
    └── Autre (résidence services, etc.) → Grille A par défaut
```

Après sélection automatique, l'utilisateur peut :
- Accepter la grille telle quelle
- Ajuster les pourcentages (total = 100%)
- Passer en mode personnalisé (ajout/suppression de composants)

## Grilles de référence

Voir SAV-007 v2 pour le détail et la justification de chaque composant.

## Gardes-fous

- Le total des pourcentages doit être exactement 100%.
- Aucun composant ne peut avoir un pourcentage de 0%.
- Le gros œuvre ne devrait jamais descendre en dessous de 30%.
- Les agencements ne devraient jamais dépasser 30%.
- Pour une maison, la toiture ne devrait jamais descendre en dessous de 10%.

## Compatibilité

CASE-001 (appartement Lyon) utilise la Grille A avec les mêmes pourcentages que la v1. Les résultats sont inchangés.
