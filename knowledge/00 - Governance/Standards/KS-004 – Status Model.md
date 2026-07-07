---
id: KS-004
title: Status Model
type: standard
status: approved
version: "1.0"
created: 2026-06-28
updated: 2026-06-28
owner: product-owner
source: Baseline v1.0
tags: [knowledge-system, status, lifecycle]
---

# KS-004 — Status Model

---

# 1. Objectif

Définir le cycle de vie officiel des objets du Knowledge System.

Chaque objet possède un statut unique qui détermine son niveau de confiance et le comportement attendu des IA.

---

# 2. Statuts officiels

## 2.1 `draft`

- **Définition** : l'objet est en cours de création ou de rédaction
- **Conditions d'entrée** : création d'un nouvel objet
- **Conditions de sortie** : contenu complet, front matter rempli → `review`
- **Qui peut attribuer** : tout contributeur
- **Effet IA** : ne jamais utiliser comme source de vérité. Lecture autorisée pour contexte uniquement.
- **Effet recherches** : inclus mais marqué comme non fiable
- **Effet analyses d'impact** : exclu

## 2.2 `review`

- **Définition** : l'objet est complet et soumis à validation
- **Conditions d'entrée** : contenu rédigé, front matter rempli, relations déclarées
- **Conditions de sortie** : approbation → `approved`. Retour → `draft`.
- **Qui peut attribuer** : auteur de l'objet
- **Effet IA** : lecture autorisée. Ne jamais baser un calcul fiscal sur un objet en review.
- **Effet recherches** : inclus, distingué des objets approved
- **Effet analyses d'impact** : inclus en mode prévisionnel uniquement

## 2.3 `approved`

- **Définition** : l'objet est validé. Il constitue la source de vérité officielle.
- **Conditions d'entrée** : revue effectuée, validé par le Product Owner
- **Conditions de sortie** : remplacement → `deprecated`. Retrait définitif → `deprecated` puis `archived`.
- **Qui peut attribuer** : Product Owner uniquement. Jamais une IA.
- **Effet IA** : source de vérité. Appliquer sans questionner.
- **Effet recherches** : prioritaire dans tous les résultats
- **Effet analyses d'impact** : inclus systématiquement. Toute modification déclenche une analyse d'impact.

## 2.4 `deprecated`

- **Définition** : l'objet n'est plus valide mais reste consultable pour traçabilité
- **Conditions d'entrée** : un nouvel objet le `supersedes`, ou décision explicite de retrait
- **Conditions de sortie** : archivage → `archived`. Réhabilitation exceptionnelle → `review`.
- **Qui peut attribuer** : Product Owner uniquement
- **Effet IA** : ne jamais utiliser. Suivre le lien `supersedes` pour trouver le remplaçant. Signaler une anomalie si aucun remplaçant n'existe.
- **Effet recherches** : exclu par défaut
- **Effet analyses d'impact** : exclu. Si un objet `approved` dépend d'un objet `deprecated`, signaler une anomalie.

## 2.5 `archived`

- **Définition** : l'objet est retiré du Knowledge System actif. Conservé uniquement pour l'historique.
- **Conditions d'entrée** : l'objet est `deprecated` et plus aucun objet actif ne le référence
- **Conditions de sortie** : aucune. État terminal.
- **Qui peut attribuer** : Product Owner uniquement
- **Effet IA** : ne jamais lire. Ne jamais inclure dans aucune analyse.
- **Effet recherches** : exclu de toutes les recherches
- **Effet analyses d'impact** : totalement exclu

---

# 3. Cycle de vie

```
                    ┌──────────┐
                    │  draft   │
                    └────┬─────┘
                         │ contenu complet
                         ▼
                    ┌──────────┐
              ┌─────│  review  │
              │     └────┬─────┘
   retour pour│          │ validé par PO
   modification          ▼
              │     ┌──────────┐
              └────▶│ approved │◀── réhabilitation (rare)
                    └────┬─────┘         ▲
                         │ remplacé      │
                         ▼               │
                    ┌──────────────┐     │
                    │  deprecated  │─────┘
                    └────┬────────┘
                         │ plus aucune référence
                         ▼
                    ┌──────────┐
                    │ archived │
                    └──────────┘
                    (état terminal)
```

---

# 4. Transitions autorisées

| De | Vers | Condition | Qui |
|---|---|---|---|
| `draft` | `review` | Contenu complet, front matter rempli | Auteur |
| `draft` | `archived` | Brouillon abandonné | Product Owner |
| `review` | `approved` | Revue validée | Product Owner |
| `review` | `draft` | Retour pour modification | Product Owner ou Auteur |
| `approved` | `deprecated` | Remplacé ou retiré | Product Owner |
| `deprecated` | `archived` | Plus aucune référence active | Product Owner |
| `deprecated` | `review` | Réhabilitation exceptionnelle | Product Owner |

---

# 5. Transitions interdites

| De | Vers | Raison |
|---|---|---|
| `draft` | `approved` | Pas de raccourci. La revue est obligatoire. |
| `draft` | `deprecated` | On ne déprécie pas ce qui n'a jamais été validé. |
| `review` | `deprecated` | Un objet en revue n'a jamais fait foi. |
| `review` | `archived` | Retour en draft ou approbation. |
| `approved` | `archived` | Doit d'abord passer par deprecated. |
| `approved` | `draft` | Ne jamais repasser un objet approved en draft. Créer un nouvel objet en draft à la place. |
| `archived` | tout statut | L'archivage est terminal. |

---

# 6. Règle de continuité

Un objet `approved` ne doit jamais être modifié directement.

Pour toute modification majeure :

1. Créer un nouvel objet en `draft`.
2. Le faire passer en `review` puis `approved`.
3. L'ancien objet passe en `deprecated` avec `supersedes`.

Cette règle garantit qu'il existe toujours une version `approved` de chaque connaissance critique.
