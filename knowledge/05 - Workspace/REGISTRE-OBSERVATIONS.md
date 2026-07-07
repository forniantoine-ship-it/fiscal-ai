---
id: REGISTRE-OBSERVATIONS
title: Registre d'observations
type: registry
status: living-document
---

# REGISTRE D'OBSERVATIONS

---

# Nature du document

Ce document est un espace de travail.

Il ne constitue pas une source de vérité.

Il recense uniquement des observations, candidats, signaux et travaux en cours.

Aucune information contenue ici ne fait autorité tant qu'elle n'a pas été capitalisée dans le Knowledge System.

Le document doit pouvoir être supprimé entièrement sans provoquer de perte de connaissance dans le Knowledge System.

---

## Règle de fonctionnement

Un signal entre dans ce registre quand il a été observé pour la première fois dans une Feature, une ADR, ou une session de réflexion stratégique/produit.

Un signal progresse quand une nouvelle occurrence est confirmée **avec la même cause racine** (test : la même solution résoudrait-elle toutes les occurrences ?).

À 3/3 occurrences et cause racine confirmée, le signal déclenche une ADR (Niveau 3) ou une évolution du KS (Niveau 2) selon son périmètre. Il sort alors de ce registre.

Un signal sans nouvelle occurrence depuis trois Assistants consécutifs peut être archivé.

---

## Candidats en observation — Engines / Architecture

| Signal | Description | Occurrences | Observé dans |
|---|---|---|---|
| ENG-Calculation — Mode génératif | Le Calculation Engine génère un échéancier complet depuis des inputs minimaux (série temporelle) — capacité non documentée dans la spécification actuelle | 1/3 | F-011 |
| ENG-Validation — Complétude de collection | Le Validation Engine doit vérifier qu'un inventaire attendu est complet, pas seulement que des valeurs sont cohérentes | 1/3 | F-012 |

---

## Candidats en observation — UX Patterns

| Signal | Description | Occurrences | Observé dans |
|---|---|---|---|
| UXP-002 — Exposition d'un Jugement | Présenter un Jugement à l'utilisateur avec alternatives, implications et recommandation — avant de recueillir son choix | 1/3 | F-010 |
| UXP-Skip — Assistant conditionnel | Bypass gracieux d'un assistant entier avec confirmation explicite et traçabilité | 1/3 | F-011 |
| UXP-Scaffold — Inventaire structuré | Proposer un inventaire des catégories attendues avant de collecter — cadrer l'espace plutôt que laisser l'utilisateur face à une page blanche | 1/3 | F-012 |
| Mode-Qualifier | Catégorie d'information dont la saisie déclenche une classification fiscale plutôt qu'une valeur manquante | 1/3 | F-012 |

---

## Candidats en observation — Knowledge System (règles)

| Signal | Description | Occurrences | Observé dans |
|---|---|---|---|
| RT-001 — Priorité multi-occurrences | Règle de résolution quand un même Field apparaît à plusieurs endroits d'un document avec des valeurs potentiellement divergentes | 1/3 | F-010 |
| SAV-PreExploitation | Charges non déductibles avant la date_mise_en_service — règle transversale à tous les assistants de charges et financement | 2/3 | F-011, F-012 |

---

## Backlog SAV — Règles fiscales observées, portée à confirmer

Ces règles fiscales ont été identifiées dans des Features. Elles ne seront rédigées en Zone 01 qu'après confirmation de leur portée sur plusieurs Features.

| Candidat SAV | Contexte d'apparition | Potentiellement transversal ? | Observé dans |
|---|---|---|---|
| Intérêts d'emprunt déductibles comme charges LMNP | Financement | Oui — lié à toutes les charges | F-011 |
| Capital remboursé jamais déductible | Financement | Oui — piège récurrent | F-011 |
| IRA déductible l'année du remboursement anticipé | Financement | Modéré | F-011 |
| Assurance emprunteur déductible (bancaire ou délégation) | Financement | Oui — lié aux charges | F-011 |
| Méthode caisse — charge déductible l'année de paiement | Charges | Oui — s'applique à toutes les charges | F-012 |
| Distinction réparation / amélioration (charge vs. amortissement) | Charges, Travaux | Oui — F-013 probablement aussi | F-012 |
| Fonds de travaux ALUR non déductible à la cotisation | Charges copropriété | Modéré | F-012 |
| Charges récupérables vs. non récupérables sur le locataire | Charges | Modéré | F-012 |
| Remboursement d'assurance — réduction de charge ou produit selon exercice | Charges | Modéré | F-012 |

---

## Candidats ayant atteint 3/3 — en attente de décision PO

Ces signaux ont atteint le seuil. Ils attendent une décision avant de déclencher une ADR ou une évolution KS.

| Signal | Description | ADR existante ? | Statut |
|---|---|---|---|
| ENG-Classification — Granularité transactionnelle | Le Classification Engine doit opérer à deux niveaux : document ET transaction à l'intérieur du document | ADR-001 (rejetée — à réécrire) | En attente de révision |
| ENG-Question — Guidance contextuelle | Le Question Engine doit pouvoir présenter un contexte et recueillir un choix éclairé, pas seulement collecter une valeur manquante | ADR-002 (rejetée — fond valide, implémentation à retravailler) | En attente de révision |

---

## Points de vigilance — Normalisation documentaire (issus de la séquence Mission Engine / ADR-006, TRF-0033)

Ces points ne sont pas des règles métier candidates — ce sont des incohérences ou lacunes de forme dans les Standards eux-mêmes, identifiées pendant la conception du Mission Engine, volontairement non traitées pour ne pas interrompre l'implémentation. À traiter lors d'une future session de normalisation documentaire dédiée, pas par anticipation.

| Observation | Détail | Documents concernés |
|---|---|---|
| Type `adr` non enregistré | `type: adr`, utilisé depuis ADR-001, ne figure pas dans l'énumération officielle de KS-002 §3.3 | KS-002, ADR-001 à ADR-006 |
| `grounded_in` vs `source` | KS-TRF prescrit `grounded_in` comme champ obligatoire avant `approved`, mais la pratique réelle (TRF-0001, TRF-0033) utilise `source:` | KS-TRF, TRF-0001, TRF-0033 |
| Portée des relations KS-003 pour `state` | `governs`/`belongs_to` ne listent pas explicitement `state` comme source ou destination autorisée | KS-003, STATE-001 |
| Front matter pré-KS-002 restant | ENG-001 conserve son en-tête informel ("Version :/Statut :"), non migré lors de la synchronisation STATE-001/ARCH-001 | ENG-001 |
| Granularité des Missions d'attente | `attendre_analyse` fusionne DOCUMENTS_IMPORTES et ANALYSE_DOCUMENTAIRE ; `attendre_calcul` fusionne DOSSIER_COMPLET et CALCUL_EN_COURS | TRF-0033 |
| Relance post-calcul non traitée | Besoin réel mais distinct : relancer un client inactif après CALCUL_TERMINE/DECLARATION_GENEREE relève d'une hésitation à la décision d'achat (UXP-004), pas d'un abandon de construction — nécessite une Mission dédiée, non définie | DEC-001, TRF-0033 |
| Arbitrage multi-Dossiers | Aucune Entité ne représente l'agrégat "client possédant plusieurs Dossiers" — nécessaire uniquement si un client a plusieurs Dossiers actifs simultanément | ADR-006 §5 |

---

*Dernière mise à jour : 2026-07-05 — après ADR-005 (dépréciée), ADR-006, DEC-001, RAI-015, TRF-0033, synchronisation STATE-001/ARCH-001/ENG-001*
