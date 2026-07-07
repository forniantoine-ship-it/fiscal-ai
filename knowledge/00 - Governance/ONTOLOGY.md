---
id: ONTOLOGY
title: Ontologie Fiscal AI
type: meta-model
status: approved
version: "1.0"
created: 2026-06-29
updated: 2026-06-29
owner: product-owner
tags: [ontologie, meta-model, knowledge-system]
---

# Ontologie Fiscal AI — v1.0

---

# 1. Domaine

Cette ontologie modélise l'expertise nécessaire à la production d'une déclaration fiscale LMNP en France. Elle représente le savoir d'un expert-comptable spécialisé, indépendamment de tout système informatique.

---

# 2. Concepts fondamentaux

Six concepts irréductibles, organisés en trois familles.

## Famille I — Le savoir

### Axiome (AX)

Vérité fondamentale non négociable. Un Axiome n'est jamais déduit. Il ne peut être invalidé que par un changement de loi.

Propriétés : identifiant, énoncé, portée, source légale.

Contrainte : un Axiome est toujours absolu. S'il ne l'est pas, ce n'est pas un Axiome.

### Savoir (SAV)

Fait vérifiable, définition, concept, seuil ou taxonomie. Un Savoir décrit le monde. Il ne prescrit rien.

Propriétés : identifiant, énoncé, catégorie (définition, fait, concept, taxonomie, seuil), domaine (fiscal, comptable, juridique), valeur, source, validité (début, fin).

Contrainte : un Savoir ne contient jamais de logique conditionnelle.

## Famille II — Le raisonnement

### Jugement (JUG)

Choix effectué parmi des alternatives identifiées.

Propriétés : identifiant, question, alternatives, choix, justification, confiance (haute, modérée, faible), réversibilité, propriétaire (expert, utilisateur, système).

Contrainte : un Jugement ne peut jamais contredire un Axiome. Minimum deux alternatives documentées.

### Raisonnement (RAI)

Enchaînement logique justifié. Dit dans quel ordre penser et pourquoi.

Propriétés : identifiant, objectif, prémisses, étapes, conclusion, condition de sortie.

Contrainte : chaque étape doit être rattachée à un Axiome, un Savoir ou un Jugement. L'ordre des étapes est signifiant.

## Famille III — L'action

### Transformation (TRF)

Opération entrée → sortie selon une logique explicite. Unité atomique d'action.

Propriétés : identifiant, énoncé, entrées (nom, type, rôle, produit_par), sorties (nom, type, confiance), logique, conditions (formelle + naturelle), catégorie (calcul, classification, mapping, filtre), gardes, récurrence.

Contrainte : déterministe. Aucune connaissance ni choix implicite. Toute Transformation sans Vérification est non validée.

### Vérification (VER)

Cas concret attestant qu'une Transformation produit le résultat attendu.

Propriétés : identifiant, cible, catégorie (nominal, limite, erreur, exclusion), données d'entrée, résultat attendu, verdict.

Contrainte : toujours liée à exactement une Transformation. Minimum requis par Transformation : 1 nominal, 1 limite, 1 erreur.

---

# 3. Relations

Dix relations irréductibles.

## Relations d'autorité

| Relation | Source → Cible | Signification |
|---|---|---|
| fonde | Axiome → Transformation, Raisonnement | Contrainte absolue |
| éclaire | Savoir → Jugement, Raisonnement, Transformation | Information nécessaire |

## Relations de paramétrage

| Relation | Source → Cible | Signification |
|---|---|---|
| paramètre | Jugement → Transformation | Fournit une variable |
| requiert | Transformation → Savoir, Jugement | Dépendance d'exécution |

## Relations d'ordonnancement

| Relation | Source → Cible | Signification |
|---|---|---|
| précède | Transformation, Raisonnement → idem | Ordre d'exécution |
| justifie | Raisonnement → Transformation | Explique l'existence et l'ordre |

## Relations de vérification

| Relation | Source → Cible | Signification |
|---|---|---|
| vérifie | Vérification → Transformation | Atteste le bon fonctionnement |
| contredit | tout → tout | Signale une incohérence (toujours anomalie) |

## Relations de cycle de vie

| Relation | Source → Cible | Signification |
|---|---|---|
| dérive de | tout → même type | Filiation |
| remplace | tout → même type | Rend obsolète |

---

# 4. Contraintes globales

C1 — Hiérarchie d'autorité : Axiome > Savoir > Jugement > Raisonnement > Transformation > Vérification.

C2 — Immuabilité des identifiants.

C3 — Complétude des Transformations (3 Vérifications minimum).

C4 — Traçabilité des Jugements (aucune valeur sans origine).

C5 — Fermeture des Raisonnements (chaque prémisse pointe vers un objet existant).

C6 — Non-circularité (précède et requiert ne forment jamais de cycle).

C7 — Isolation de contredit (toujours une anomalie à résoudre).

C8 — Déterminisme des Transformations.

C9 — Perpétuité des Axiomes (jamais retirés, remplacés si nécessaire).

C10 — Indépendance technologique.

C11 — Résolution de portées (la portée la plus spécifique au régime fiscal prévaut).

C12 — Obligation de trace (toute exécution produit un journal).

---

# 5. Projection

Cette ontologie est projetée dans le Vault Obsidian selon le principe : 1 concept = 1 dossier dans la zone 01 - Expertise.

Les zones 02 (Domaine), 03 (Produit) et 04 (Engineering) utilisent le vocabulaire relationnel KS-003 pour leurs propres objets. Les deux vocabulaires coexistent.
