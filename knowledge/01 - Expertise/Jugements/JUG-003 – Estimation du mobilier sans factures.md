---
id: JUG-003
title: Estimation du mobilier sans factures
type: jugement
status: approved
version: "1.0"
created: 2026-06-29
updated: 2026-06-29
owner: product-owner
source: Pratique comptable LMNP
tags: [lmnp, mobilier, estimation, acquisition]
question: "Comment déterminer la valeur du mobilier quand les factures sont absentes ou incomplètes ?"
alternatives:
  - "A — Factures détaillées obligatoires. Très fiable mais bloque le dossier si les factures sont perdues."
  - "B — Estimation forfaitaire (pourcentage du prix d'achat). Simple mais peu défendable en contrôle."
  - "C — Déclaration du client avec liste valorisée. Flexible, responsabilise le client, défendable si la liste est crédible."
choix: "C — Déclaration du client accompagnée d'une liste valorisée des équipements"
justification: "Le client connaît son mobilier. Une liste détaillée avec des montants réalistes est plus défendable qu'un forfait. Les factures existantes doivent être jointes quand elles sont disponibles."
confiance: modérée
réversibilité: "Oui — si les factures sont retrouvées ultérieurement, elles remplacent l'estimation."
propriétaire: utilisateur
decision_type: fiscal
paramètre: [TRF-0001]
éclaire: []
grounded_in: []
---

# JUG-003 — Estimation du mobilier sans factures

## Contexte

Beaucoup de clients LMNP n'ont pas conservé toutes les factures de mobilier, surtout en cas d'achat ancien.

## Méthode retenue

1. Le client fournit une liste des équipements avec une valeur estimée par élément.
2. Le système vérifie que le total est dans une fourchette crédible (5% à 15% du prix d'acquisition pour un meublé standard).
3. Les factures disponibles sont jointes comme justificatifs.
4. Le montant total est documenté et traçable.

## Gardes-fous

- Montant total < 5% du prix d'acquisition → avertissement "montant inhabituellement bas"
- Montant total > 15% du prix d'acquisition → avertissement "montant inhabituellement élevé"
- Montant total > 30% du prix d'acquisition → blocage "montant incohérent"
