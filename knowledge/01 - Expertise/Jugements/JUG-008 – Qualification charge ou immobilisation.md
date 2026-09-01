---
id: JUG-008
title: "Qualification charge ou immobilisation"
type: jugement
status: approved
version: "2.0"
created: 2026-06-29
updated: 2026-06-29
owner: product-owner
source: "CGI art. 39-1, PCG art. 311-1, BOFiP BOI-BIC-CHG-20-30"
tags: [travaux, charges, immobilisation, qualification, arbre-décision]
question: "Cette dépense de travaux est-elle une charge ou une immobilisation ?"
choix: "Arbre de décision hiérarchique : nature d'abord, montant en dernier"
confiance: haute
réversibilité: "Oui — reclassement possible avant clôture."
propriétaire: utilisateur
decision_type: fiscal
paramètre: [TRF-0015, TRF-0026]
grounded_in: [CGI art. 39-1, PCG art. 311-1]
décision_source: DEC-TR-002, DEC-TR-003
---

# JUG-008 — Qualification charge ou immobilisation

## Arbre de décision

```
Le travail maintient-il le bien dans son état d'origine ?
│
├── OUI → CHARGE (entretien/réparation) — AX-013
│         Exemples : peinture identique, robinet équivalent, joint carrelage
│
└── NON
    │
    Le travail crée-t-il de la surface ou une capacité nouvelle ?
    │
    ├── OUI → IMMOBILISATION (construction/agrandissement) — AX-014
    │         Exemples : véranda, surélévation, création de pièce
    │         Durée : 25-30 ans
    │
    └── NON
        │
        Le travail remplace-t-il un composant entier du plan ?
        │
        ├── OUI → IMMOBILISATION + SORTIE COMPOSANT — SAV-023
        │         Exemples : toute l'électricité, toute la plomberie, toiture complète
        │         Durée : durée du composant (SAV-005)
        │
        └── NON
            │
            Le travail améliore-t-il le bien au-delà de son état d'origine ?
            │
            ├── OUI → IMMOBILISATION (amélioration) — AX-014
            │         Exemples : cuisine supérieure, double vitrage, climatisation
            │         Durée : 15-20 ans
            │
            └── AMBIGUÏTÉ
                │
                Montant < 500 € HT ?
                │
                ├── OUI → CHARGE (tolérance SAV-015)
                └── NON → IMMOBILISATION (par prudence)
```

## Règle fondamentale

La nature prime sur le montant (SAV-025). Le seuil de 500 € n'intervient qu'en dernier recours.

Un remplacement à l'identique est toujours une charge, quel que soit le montant (AX-013). Un chauffe-eau remplacé par un modèle équivalent à 1 800 € est une charge.
