---
id: BASELINE-V1
title: Baseline v1.0 du Knowledge System
type: standard
status: approved
version: "1.0"
created: 2026-06-28
updated: 2026-06-28
owner: product-owner
tags: [baseline, knowledge-system, governance]
---

# Baseline v1.0 — Knowledge System

---

# 1. Objectif

Cette baseline constitue la référence officielle du langage du Knowledge System de Fiscal AI.

Elle définit les conventions, les métadonnées, les relations et les statuts utilisés par tous les objets du Vault.

Tous les futurs standards (RULE_STANDARDS, CONTRACT_STANDARDS, etc.) doivent s'appuyer sur cette baseline et ne jamais la redéfinir.

---

# 2. Documents de la baseline

| ID | Document | Version | Statut |
|---|---|---|---|
| KS-001 | Naming Convention | 1.0 | Approved |
| KS-002 | Front Matter Standard | 1.0 | Approved |
| KS-003 | Relationship Vocabulary | 1.0 | Approved |
| KS-004 | Status Model | 1.0 | Approved |

---

# 3. Date de création

28 juin 2026

---

# 4. Décisions d'architecture

## 4.1 Identifiants

- Les identifiants sont immuables. Un identifiant ne change jamais pendant toute la durée de vie de l'objet.
- Les identifiants ne sont jamais réutilisés. Un identifiant supprimé est définitivement réservé.
- Les conventions numériques historiques sont conservées par type. Aucune renumérotation.

## 4.2 Langue

- Les dossiers structurels utilisent l'anglais (Rules, Features, Engines, etc.).
- Le contenu des documents reste intégralement en français.

## 4.3 Relations

- Le vocabulaire relationnel est volontairement limité à 9 relations.
- Chaque relation est irréductible, actionnable et stable.
- Toute nouvelle relation doit passer les trois filtres et être ajoutée à KS-003.
- Les IA doivent appliquer strictement la sémantique définie par KS-003.

## 4.4 Front Matter

- Le front matter constitue le socle commun de tous les objets.
- Un seul champ `status` porte à la fois la maturité et le niveau de confiance (fusion des anciens champs `status` et `authority`).
- Si `status` est absent, la valeur par défaut est `draft`.

## 4.5 Statuts

- 5 statuts officiels : `draft`, `review`, `approved`, `deprecated`, `archived`.
- Seul le Product Owner peut passer un objet en `approved`.
- Un objet `approved` ne retourne jamais en `draft`. Pour toute modification majeure, créer un nouvel objet.
- L'archivage est un état terminal.

## 4.6 Préfixes

- Le préfixe officiel pour Contract est `CTR`.
- Tout nouveau préfixe doit être validé et ajouté à KS-001.

---

# 5. Garanties

Cette baseline garantit que :

- Toutes les IA manipulent les mêmes conventions de nommage.
- Tous les objets du Knowledge System partagent un socle commun de métadonnées.
- Les relations entre objets sont non ambiguës et documentées.
- Les statuts ont un comportement défini et prévisible.
- Les futurs standards (RULE_STANDARDS, CONTRACT_STANDARDS, DECISION_STANDARDS, VALIDATION_STANDARDS, etc.) devront obligatoirement respecter cette baseline.
- Une IA arrivant à froid sur le projet peut comprendre le système de connaissances en lisant uniquement les 4 documents KS.

---

# 6. Limites connues

- La frontière entre `governs` et `depends_on` (hard) peut être ambiguë dans certains cas. Un arbre de décision est fourni dans KS-003 pour guider le choix.
- `contains` et `belongs_to` sont la même relation en deux directions. Cette redondance est acceptée volontairement pour faciliter la navigation.
- `supersedes` sera peu utilisé au début du MVP. Son existence est justifiée par le besoin de traçabilité long terme.
- Les objets existants du Vault ne portent pas encore de front matter conforme à KS-002. La mise en conformité sera progressive.

---

# 7. Évolutions prévues

- Rédaction des standards spécifiques : RULE_STANDARDS, CONTRACT_STANDARDS, DECISION_STANDARDS, VALIDATION_STANDARDS, FEATURE_STANDARDS.
- Mise en conformité progressive des objets existants (ajout des front matters).
- Formalisation des objets Contracts, Decisions et Validations.
- Création du KM-001 — Knowledge Meta Model.

---

# 8. Conditions d'ouverture d'une Baseline V2

Une nouvelle baseline ne pourra être ouverte que si :

1. Une incohérence fondamentale est détectée dans la baseline actuelle.
2. Un besoin métier non couvert par les 4 KS est identifié.
3. L'ajout d'un nouveau KS est nécessaire (KS-005+).
4. La modification est validée par le Product Owner.

Les évolutions mineures (corrections, précisions) sont traitées par montée de version des KS individuels sans ouvrir de nouvelle baseline.
