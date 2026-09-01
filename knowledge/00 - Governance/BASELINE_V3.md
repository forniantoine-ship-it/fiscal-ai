---
id: BASELINE-V3
title: Baseline v3.0 du Knowledge System
type: standard
status: approved
version: "1.0"
created: 2026-06-30
updated: 2026-06-30
owner: product-owner
tags: [baseline, knowledge-system, ux, produit]
dérive de: [BASELINE-V2]
---

# Baseline v3.0 — Introduction de la couche Produit

---

# 1. Objectif

Cette baseline introduit dans le Knowledge System une couche Produit structurée, distincte de la couche Expertise (Zone 01) et de la couche Engineering (Zone 04).

Elle formalise également la distinction entre :
- les principes de conception produit (vérités durables — Constitution) ;
- les hypothèses de conception UX (provisoires — UX Patterns, statut 🟡).

---

# 2. Documents de référence

| Document | Version | Statut |
|---|---|---|
| Constitution du Cerveau Fiscal AI | 1.1 | Approved — P16 à P19 ajoutés |
| Blueprint Fiscal AI | 1.1 | Approved — UX passé de ⚪ à 🟡 |
| TEMPLATE - FEATURE | 1.1 | Approved — JTBD + Diagnostic + Moyens ajoutés |
| TEMPLATE - PROFIL | 1.0 | Approved |
| TEMPLATE - JTBD | 1.0 | Approved |
| TEMPLATE - UX PATTERN | 1.0 | Approved |

---

# 3. Changements par rapport à V2

| Changement | Raison |
|---|---|
| Constitution P16-P19 | Capitaliser les principes produit issus des missions R-003 et R-004 |
| Nouveaux artefacts : Profil (PROF-xxx) | Décrire les types d'utilisateurs réels de manière réutilisable entre Features |
| Nouveaux artefacts : Job To Be Done (JTBD-xxx) | Définir pourquoi l'utilisateur emploie le produit, à un niveau d'abstraction supérieur aux Features |
| Nouveaux artefacts : UX Pattern (UXP-xxx) | Capitaliser les solutions récurrentes aux problèmes d'interaction, avec cycle de vie hypothèse → validé |
| Template Feature enrichi | Forcer toute future Feature à définir son JTBD, son diagnostic de situation et ses moyens alternatifs |
| Nouveau dossier 03 - Produit/Profils/ | |
| Nouveau dossier 03 - Produit/Jobs To Be Done/ | |
| Nouveau dossier 03 - Produit/UX Patterns/ | |

---

# 4. Ce qui n'a PAS changé

- L'ontologie Zone 01 (AX/SAV/JUG/RAI/TRF/VER) reste inchangée — son périmètre est le savoir fiscal.
- Les UX Patterns ne sont pas des concepts ontologiques : ils vivent en Zone 03, avec leur propre cycle de vie.
- Le terme "Feature" est conservé dans le KS. La présentation utilisateur de ces Features (ex : "Assistant Activité") est une décision produit/UI, indépendante de la terminologie interne.

---

# 5. Décisions d'architecture

- Les User Journeys détaillés (flow-level) n'appartiennent pas au KS — trop éphémères, ils vivent dans les outils de design.
- Les Scénarios ne sont pas un artefact autonome — ils sont absorbés dans les Profils (situations structurelles) et les Features.
- Aucune "Charte Produit" séparée n'est créée — les principes produit rejoignent la Constitution.
- Les Capabilities ne sont pas introduites à ce stade. Si le travail sur plusieurs Features (Activité, Logement, Crédit, Charges) révèle un besoin naturel de couche intermédiaire entre Feature et Engine, elles seront introduites dans une BASELINE-V4.

---

# 6. Garanties

- Tout UX Pattern est créé avec le statut 🟡 Hypothèse jusqu'à confirmation par un usage réel documenté.
- Un Profil n'est jamais invalidé — il est enrichi ou subdivisé.
- Un JTBD évolue uniquement si la compréhension des motivations utilisateur change fondamentalement.
- La Baseline V2 reste accessible dans l'historique.
