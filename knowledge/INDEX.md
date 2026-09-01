---
id: INDEX
title: Index du Knowledge System
type: meta-model
status: approved
version: "3.0"
created: 2026-06-28
updated: 2026-07-05
owner: product-owner
tags: [index, knowledge-system, navigation, router]
---

# Fiscal AI — Knowledge Router

---

# Règles de lecture

1. Lire le minimum nécessaire.
2. Descendre progressivement dans l'arbre.
3. Ne jamais ouvrir un document si l'arbre ne t'y conduit pas.

---

```
DÉMARRAGE DE SESSION
│
├─ Toujours, sans exception :
│     Les Lois Fondamentales.md (~2 min)
│     → DIR-001 (~3 min)
│
▼
Quelle est la nature de la mission ?
│
├── Q1 · Aucune tâche précise encore identifiée ?
│     └─ OUI → Tu as déjà lu ce qu'il faut. Attends la tâche avant d'aller plus loin.
│
├── Q2 · La tâche concerne le produit (vision, utilisateur, une Feature) ?
│     └─ OUI → Vision.md (~2 min)
│           │
│           └─ Une Feature ou un Assistant précis est concerné ?
│                 ├─ OUI → CAT-001 (~5 min)
│                 │        → Fiche Feature F-0XX correspondante (~3 min)
│                 │        → Objets liés en 01-Expertise (Savoirs/Jugements référencés — ~1-2 min/objet)
│                 │        → Entités/Fields concernés en 02-Domaine si une donnée précise est en jeu (~1 min/objet)
│                 └─ NON → Contexte suffisant, ne pas aller plus loin
│
├── Q3 · La tâche concerne le code (implémentation, bug, audit) ?
│     └─ OUI → CODE-001 (~8 min)
│           │
│           └─ Une divergence entre le code et le KS est suspectée ?
│                 ├─ OUI → DIR-002 (~3 min) → DIR-003 (~3 min)
│                 └─ NON → Contexte suffisant
│
├── Q4 · La tâche implique de créer/modifier un objet du KS, ou de prendre une décision ?
│     └─ OUI → ONTOLOGY.md (~4 min) + KS-001 / KS-002 (~3 min)
│           │
│           └─ Le changement touche un contrat partagé (plusieurs Features/Engines) ou un principe fondateur ?
│                 ├─ OUI → GOUV-001, section Niveau 3/4 uniquement (~2 min ciblé)
│                 │        → Constitution / Charte du Cerveau si architecture (~5 min chacun)
│                 └─ NON → Action directe (Niveau 1-2 GOUV-001), pas d'ADR nécessaire
│           │
│           └─ Dans tous les cas : vérifier REGISTRE-OBSERVATIONS.md avant de conclure (~2 min)
│
└── Q5 · La mission est-elle suffisamment claire ?
      ├─ OUI → Suivre la branche correspondante (Q2, Q3 ou Q4).
      └─ NON → Demander des précisions à l'utilisateur avant de continuer.
```

---

# Où en sommes-nous maintenant

*(branche latérale toujours disponible — ne fait pas partie du chemin séquentiel)*

```
Phase actuelle ──────────────────► DIR-001
Signaux en cours d'accumulation ──► REGISTRE-OBSERVATIONS.md
Ce qui est construit / partiel ───► Blueprint Fiscal AI.md (🟢🟡⚪)
```

---

# À ne jamais lire par défaut

*(terminus — aucune branche n'y mène jamais)*

```
✗ BASELINE-1.0.md, BASELINE_V1.md, BASELINE_V2.md   — historique, jamais l'état actuel
✗ MIGRATION_V1.md                                    — artefact de migration clos
✗ 05 - Workspace/Archive/*                           — hors Knowledge System
✗ 05 - Workspace/ (hors REGISTRE-OBSERVATIONS.md)    — jamais source de vérité
```
