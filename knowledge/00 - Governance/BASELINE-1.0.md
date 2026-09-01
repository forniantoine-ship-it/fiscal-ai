---
id: BASELINE-1.0
title: "Core Fiscal Engine LMNP — Baseline 1.0"
type: standard
status: approved
version: "1.0"
created: 2026-06-29
updated: 2026-06-29
owner: product-owner
tags: [baseline, fiscal-engine, lmnp, v1]
---

# Core Fiscal Engine LMNP — Baseline 1.0

---

# 1. Objectif

Cette Baseline fige la première version stable du moteur fiscal LMNP de Fiscal AI.

À partir de cette Baseline, toute évolution passe obligatoirement par KS-004A (cycle de vie), KS-004B (compatibilité) et KS-004C (releases).

---

# 2. Inventaire du Knowledge System

| Type | Nombre | IDs |
|---|---|---|
| Axiomes | 16 | AX-001 à AX-017 |
| Savoirs | 28 | SAV-001 à SAV-028 |
| Jugements | 13 | JUG-001 à JUG-013 |
| Raisonnements | 15 | RAI-000 à RAI-014 |
| Transformations | 26 (avec contenu) | TRF-0001 à TRF-0032 |
| Vérifications | 52 | VER-001 à VER-052 |
| **Total** | **150 objets actifs** | |

7 fichiers Transformation placeholders (TRF-0002 à TRF-0008) sans front matter — hérités de la migration. Non comptés.

---

# 3. Domaines métier couverts

| # | Domaine | Transformations | Executors | Statut |
|---|---|---|---|---|
| 1 | Acquisition | TRF-0001, TRF-0002 | 2 | Complet |
| 2 | Amortissements | TRF-0009, TRF-0010, TRF-0011 | 3 | Complet |
| 3 | Charges déductibles | TRF-0015 à TRF-0021 | 7 | Complet |
| 4 | Pré-exploitation | TRF-0022 à TRF-0025 | 4 | Complet |
| 5 | Travaux | TRF-0026 à TRF-0028 | 3 | Complet |
| 6 | Assemblage du plan | TRF-0012, TRF-0014 | 2 | Complet |
| 7 | Résultat fiscal | TRF-0029 à TRF-0032 | 4 | Complet |

---

# 4. Infrastructure technique

| Composant | Version | Statut |
|---|---|---|
| Serveur MCP | 0.1.0 | Opérationnel |
| VaultProvider | 1.0 | resolve, search, list |
| Runtime Engine | 1.0 | Orchestrateur complet |
| Resolver | 1.0 | ResolvedField avec traçabilité |
| Validation Runner | 1.0 | CASE-001 100% |
| Document Intelligence Engine | 1.0 | Pipeline 8 niveaux (RT-003) |
| Document Runtime Bridge | 1.0 | Document → FiscalResult |
| Knowledge Validator | 1.0 | 28 règles de validation |
| Executor Registry | 1.0 | 25 executors enregistrés |

### Outils MCP

| Outil | Rôle |
|---|---|
| knowledge_resolve | Récupérer un objet du KS |
| transformation_execute | Exécuter une Transformation |
| resolve_inputs | Vérifier les entrées |
| runtime_run | Exécuter un cas complet |
| validation_run | Valider un CASE canonique |

---

# 5. Validation

| CASE | Transformations | Passed | Failed | Couverture |
|---|---|---|---|---|
| CASE-001 | 13 | 13 | 0 | 100% |

### Transformations sans Executor

| ID | Raison |
|---|---|
| TRF-0013 | Reconstitution plan antérieur — chemin rare, sera implémenté quand un CASE le nécessitera |

### Executors sans Transformation

Aucun.

---

# 6. Gouvernance

| Document | Rôle | Statut |
|---|---|---|
| KS-001 | Naming Convention | Approved |
| KS-002 | Front Matter Standard | Approved |
| KS-003 | Relationship Vocabulary | Approved |
| KS-004 | Status Model | Approved |
| KS-003A | Validation documentaire | Figé |
| KS-004A | Cycle de vie | Figé |
| KS-004B | Compatibilité | Figé |
| KS-004C | Releases | Figé |
| ONTOLOGY | Ontologie (6 concepts, 10 relations, 12 contraintes) | Approved |
| VAL-001 | Politique de validation du moteur | Approved |
| RT-001 | Couche Observations | Approved |
| RT-002 | Runtime Adapter | Approved |
| RT-003 | Document Intelligence Pipeline | Approved v2.0 |
| MCP-001 | Knowledge API Specification | Approved |

---

# 7. Architecture du pipeline

```
Document → Document Model → Extraction → Observation → Candidate → ResolvedField → Transformation → FiscalResult
```

8 niveaux. 12 invariants. Traçabilité complète de chaque chiffre jusqu'au document source.

---

# 8. Chaîne de calcul complète

```
Acquisition (TRF-0001 → TRF-0002)
    ↓ base amortissable
Amortissements (TRF-0009 → TRF-0010 → TRF-0011 → TRF-0012 → TRF-0014)
    ↓ plan d'amortissement
Pré-exploitation (TRF-0022 → TRF-0023 → TRF-0024 → TRF-0025)
    ↓ charges pré-exploitation
Travaux (TRF-0026 → TRF-0027 → TRF-0028)
    ↓ composants travaux
Charges (TRF-0015 → TRF-0016 → TRF-0017 → TRF-0018 → TRF-0019 → TRF-0020 → TRF-0021)
    ↓ total charges
Résultat fiscal (TRF-0029 → TRF-0030 → TRF-0031 → TRF-0032)
    ↓
FiscalResult
```

---

# 9. Limites connues

| # | Limite | Impact |
|---|---|---|
| 1 | TRF-0013 non implémenté | Pas de reprise de plans antérieurs |
| 2 | 7 fichiers TRF placeholders sans front matter | Nettoyage à planifier |
| 3 | CASE-002 non encore écrit comme CASE canonique | Validation du cas complexe à formaliser |
| 4 | Flux Recettes minimal (TRF-0029) | Pas de gestion des recettes multi-sources |
| 5 | Liasse fiscale non générée | FiscalResult produit mais pas encore mappé aux formulaires Cerfa |

---

# 10. Évolutions prévues (Phase 2)

- Génération de la liasse fiscale (2031 + 2033-A à D + 2042-C-PRO)
- CASE-002 canonique (maison individuelle, travaux, pré-exploitation)
- Flux Recettes complet (multi-biens, saisonnalité)
- Reconstitution de plan antérieur (TRF-0013)
- OCR réel (remplacement des FakeExtractors)
- Extraction GPT
- Interface utilisateur

---

# 11. Immutabilité

Cette Baseline est immutable après publication.

Si une correction est nécessaire, une nouvelle Baseline (1.1 ou 2.0) est publiée selon KS-004C.

---

# 12. Reproductibilité

Un utilisateur peut demander : "Exécuter ce dossier avec la Baseline 1.0."

Le moteur produit exactement les mêmes résultats que ceux documentés dans CASE-001.

Les mêmes entrées avec les mêmes Jugements produisent toujours les mêmes sorties (contrainte C8 de l'ontologie).
