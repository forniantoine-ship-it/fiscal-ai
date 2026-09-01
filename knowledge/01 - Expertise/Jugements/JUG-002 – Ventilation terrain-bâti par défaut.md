---
id: JUG-002
title: Ventilation terrain-bâti par défaut
type: jugement
status: approved
version: "2.0"
created: 2026-06-29
updated: 2026-06-29
owner: product-owner
source: Doctrine fiscale, Pratique professionnelle
tags: [lmnp, terrain, bâti, ventilation, maison, appartement]
question: "Quel ratio terrain/bâti appliquer quand l'acte notarié ne le mentionne pas ?"
alternatives:
  - "A — Ratio fixe unique. Simple mais injustifiable."
  - "B — Ratio par type de bien + catégorie de localisation. Plus précis, justifiable."
  - "C — Estimation via expert immobilier. Très précis mais coûteux."
  - "D — Valeur saisie par l'utilisateur avec suggestion et validation par fourchette."
choix: "D — Valeur saisie par l'utilisateur, avec suggestion basée sur B (type de bien + localisation) et validation par fourchette"
justification: "L'utilisateur connaît son bien. La suggestion par type et localisation (SAV-003 v2) lui donne un repère adapté. La validation par fourchette empêche les valeurs aberrantes."
confiance: haute
réversibilité: "Oui — modifiable à tout moment."
propriétaire: utilisateur
decision_type: fiscal
paramètre: [TRF-0002]
éclaire: []
grounded_in: [BOFiP BIC-AMT-10]
---

# JUG-002 — Ventilation terrain-bâti par défaut

## Contexte

La majorité des actes notariés ne mentionnent pas la ventilation terrain/bâti. L'expert doit l'estimer en fonction du type de bien et de sa localisation.

## Méthode retenue

1. Déterminer le type de bien : appartement ou maison.
2. Déterminer la catégorie de localisation (SAV-003 v2).
3. Si le prix au m² local dépasse significativement la moyenne de sa catégorie, utiliser les ratios de la catégorie supérieure.
4. Suggérer le ratio correspondant à l'utilisateur.
5. L'utilisateur peut accepter la suggestion ou saisir sa propre valeur.
6. Le système valide que le ratio est dans la fourchette de son type de bien.
7. Si hors fourchette, avertissement mais pas de blocage.

## Arbre de suggestion

```
Type de bien ?
    ├── Appartement
    │     └── Localisation ?
    │           ├── Paris → suggestion 35%
    │           ├── Grande métropole → suggestion 25%
    │           ├── Ville moyenne → suggestion 18%
    │           └── Zone rurale → suggestion 12%
    │
    └── Maison individuelle
          └── Localisation ?
                ├── Zone urbaine dense (prix > 4 000 €/m²) → suggestion 40%
                ├── Zone urbaine standard → suggestion 30%
                ├── Zone périurbaine → suggestion 25%
                └── Zone rurale → suggestion 20%
```

Si le prix au m² local est supérieur de plus de 30% à la moyenne de sa catégorie, appliquer la suggestion de la catégorie supérieure.

## Fourchettes de validation

### Appartement

| Localisation | Fourchette acceptable |
|---|---|
| Paris intra-muros | 25% à 45% |
| Grande métropole | 15% à 35% |
| Ville moyenne | 10% à 25% |
| Zone rurale | 5% à 20% |

### Maison individuelle

| Localisation | Fourchette acceptable |
|---|---|
| Zone urbaine dense | 30% à 50% |
| Zone urbaine standard | 20% à 40% |
| Zone périurbaine | 15% à 35% |
| Zone rurale | 10% à 30% |

Un ratio hors fourchette déclenche un avertissement, pas un blocage.

## Compatibilité

Les ratios pour appartement sont inchangés par rapport à la v1. Les résultats de CASE-001 (appartement Lyon, ratio 20%) restent identiques.
