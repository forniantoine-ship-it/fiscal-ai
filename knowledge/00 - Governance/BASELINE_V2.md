---
id: BASELINE-V2
title: Baseline v2.0 du Knowledge System
type: standard
status: approved
version: "1.0"
created: 2026-06-29
updated: 2026-06-29
owner: product-owner
tags: [baseline, knowledge-system, ontologie]
dérive de: [BASELINE-V1]
---

# Baseline v2.0 — Knowledge System

---

# 1. Objectif

Cette baseline marque le passage d'une architecture par type d'objet à une architecture fondée sur l'ontologie Fiscal AI.

Le Knowledge System est désormais organisé selon les 6 concepts fondamentaux de l'ontologie : Axiome, Savoir, Jugement, Raisonnement, Transformation, Vérification.

---

# 2. Documents de référence

| Document | Version | Statut |
|---|---|---|
| ONTOLOGY.md | 1.0 | Approved |
| KS-001 – Naming Convention | 1.0 | Approved |
| KS-002 – Front Matter Standard | 1.0 | Approved |
| KS-003 – Relationship Vocabulary | 1.0 | Approved |
| KS-004 – Status Model | 1.0 | Approved |
| TRANSFORMATION_STANDARDS | 1.1 | Approved |
| VERIFICATION_STANDARDS | 1.1 | Approved |
| JUDGEMENT_STANDARDS | 1.1 | Approved |
| CONTRACT_STANDARDS | 1.1 | Approved (Engineering) |
| ENGINE_INTERACTION_STANDARDS | 1.1 | Approved (Engineering) |

---

# 3. Architecture du Vault

| Zone | Nom | Responsabilité |
|---|---|---|
| 00 | Governance | Standards, ontologie, baselines, templates |
| 01 | Expertise | Savoir de l'expert (6 concepts de l'ontologie) |
| 02 | Domaine | Structure des données métier (Entités, Données, États, Événements) |
| 03 | Produit | Vision, Features, Backlog, Références |
| 04 | Engineering | Architecture technique, Engines, Contracts, AI Agents |
| 05 | Workspace | Espace de travail hors Knowledge System |

---

# 4. Changements majeurs par rapport à V1

| Changement | Raison |
|---|---|
| Rules → Transformations (TRF-) | Alignement avec l'ontologie |
| Validations → Vérifications (VER-) | Alignement avec l'ontologie |
| Decisions → Jugements (JUG-) | Séparation métier/technique |
| 01 - Business → 01 - Expertise | Reflète le savoir de l'expert |
| Engines et Contracts → 04 - Engineering | Composants techniques séparés du savoir métier |
| Ajout Axiomes, Savoirs, Raisonnements, Restitutions | Niveaux cognitifs manquants |
| Création de 02 - Domaine et 03 - Produit | Séparation données/produit/expertise |

---

# 5. Décisions d'architecture

- L'ontologie v1.0 est la source de vérité des concepts.
- Les identifiants TRF-xxxx sont renommés en TRF-xxxx. Cette violation de C2 est acceptée car aucun objet approved n'utilisait les anciens IDs.
- Les vocabulaires relationnels KS-003 (zones 02-04) et ontologique (zone 01) coexistent.
- Les standards techniques (CONTRACT, ENGINE_INTERACTION) vivent dans 04 - Engineering, pas dans 00 - Governance.

---

# 6. Garanties

- L'ontologie ne sera plus modifiée sauf si une Transformation concrète démontre une insuffisance.
- Toute Transformation suit le cycle en 9 étapes défini lors de la validation de TRF-001.
- Les 12 contraintes de l'ontologie s'appliquent à tous les objets de la zone 01.
- La Baseline V1 reste accessible dans l'historique.

---

# 7. Prochaines étapes

- Peupler les Axiomes fondamentaux.
- Peupler les Savoirs de base.
- Rédiger les premiers Jugements (JUG-001, JUG-002).
- Rédiger le premier Raisonnement (RAI-001).
- Finaliser TRF-001 dans le nouveau format.
- Rédiger les Vérifications associées (VER-001 à VER-005).
