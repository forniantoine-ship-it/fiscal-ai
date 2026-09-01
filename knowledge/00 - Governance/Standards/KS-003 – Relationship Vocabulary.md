---
id: KS-003
title: Relationship Vocabulary
type: standard
status: approved
version: "1.0"
created: 2026-06-28
updated: 2026-06-28
owner: product-owner
source: Baseline v1.0
tags: [knowledge-system, relations, vocabulary]
---

# KS-003 — Relationship Vocabulary

---

# 1. Objectif

Définir le vocabulaire relationnel officiel du Knowledge System.

Toute relation entre deux objets du Vault doit utiliser exclusivement un verbe défini dans ce document.

Aucun synonyme, aucune variante, aucune invention.

---

# 2. Principes de conception

Chaque relation a survécu à trois filtres :

1. **Irréductible** — elle ne peut pas être exprimée avec une autre relation existante.
2. **Actionnable** — une IA peut prendre une décision différente grâce à cette relation.
3. **Stable** — cette relation existera encore dans 5 ans, quel que soit le stack technique.

Toute nouvelle relation doit passer ces trois filtres et être validée dans ce document.

---

# 3. Famille 1 — Relations structurelles

## 3.1 `contains`

- **Direction** : parent → enfant
- **Signification** : l'objet source contient l'objet destination comme partie constitutive
- **Source autorisée** : `entity`, `data-model`
- **Destination autorisée** : `entity`, `field`
- **Exemple** : `ENT-002 (Dossier) contains ENT-001 (Bien immobilier)`

## 3.2 `belongs_to`

- **Direction** : enfant → parent
- **Signification** : l'objet source fait partie de l'objet destination
- **Source autorisée** : `entity`, `field`
- **Destination autorisée** : `entity`, `data-model`
- **Exemple** : `FIELD-004 (Valeur du bâti) belongs_to ENT-001 (Bien immobilier)`

`contains` et `belongs_to` sont la même relation en deux directions. Les deux sont conservées pour permettre la navigation bidirectionnelle sans scan du Vault.

---

# 4. Famille 2 — Relations de dépendance

## 4.1 `depends_on`

- **Direction** : source → cible
- **Signification** : l'objet source a besoin de l'objet cible pour être valide, complet ou exécutable
- **Source autorisée** : tous les types
- **Destination autorisée** : tous les types

### Force de la dépendance

```yaml
depends_on:
  hard: [FIELD-004, FIELD-031]
  soft: [DEC-003]
```

| Force | Signification | Comportement IA |
|---|---|---|
| `hard` | L'objet ne peut pas fonctionner sans la cible | Bloquer si la cible est manquante, draft ou deprecated |
| `soft` | La cible enrichit la compréhension | Avertir si absente, ne pas bloquer |

### Relations absorbées

- `requires` — contenu dans `depends_on` hard
- `blocks` — inverse de `depends_on`, calculable depuis le graphe

---

# 5. Famille 3 — Relations de référence

## 5.1 `grounded_in`

- **Direction** : objet → source d'autorité
- **Signification** : l'objet source tire son autorité ou sa légitimité de l'objet destination
- **Source autorisée** : `rule`, `constraint`, `decision`, `contract`
- **Destination autorisée** : source légale (CGI, BOFiP, doctrine), `decision`, `standard`
- **Exemple** : `TRF-0006 grounded_in "CGI art. 39-C"`

### Hiérarchie des sources d'autorité

| Niveau | Source | Nature |
|---|---|---|
| 1 | Loi (CGI) | Externe, non modifiable |
| 2 | Doctrine administrative (BOFiP) | Externe, interprétative |
| 3 | Jurisprudence | Externe, contextuelle |
| 4 | Decision interne | Interne, modifiable |
| 5 | Standard interne | Interne, convention |

Une IA doit toujours privilégier le niveau le plus élevé.

## 5.2 `derived_from`

- **Direction** : produit → matière première
- **Signification** : l'objet source a été construit à partir de l'objet destination
- **Source autorisée** : `validation`, `rule`, `contract`, `feature`
- **Destination autorisée** : `rule`, `entity`, `feature`, `decision`, `contract`
- **Exemple** : `VAL-001 derived_from TRF-0006`

### Distinction avec les autres relations

- `depends_on` = "j'ai besoin de toi pour fonctionner maintenant"
- `derived_from` = "tu es la raison pour laquelle j'existe"
- `grounded_in` = "tu es la source d'autorité qui me légitime"

### Relations éliminées

- `references` — trop vague, remplacé par `grounded_in` et `derived_from`
- `cites` — synonyme faible de `grounded_in`
- `inspired_by` — non actionnable

---

# 6. Famille 4 — Relations de gouvernance

## 6.1 `supersedes`

- **Direction** : nouvel objet → ancien objet
- **Signification** : l'objet source remplace officiellement l'objet destination
- **Source autorisée** : tous les types
- **Destination autorisée** : même type que la source
- **Exemple** : `TRF-0012 supersedes TRF-0003`

### Comportement IA

1. Si un objet a `status: deprecated`, chercher qui le `supersedes`.
2. Utiliser le nouvel objet à la place.
3. Si aucun `supersedes` n'existe pour un objet deprecated, signaler une anomalie.

### Règle de démarcation

- Même ID + nouvelle version → champ `version`
- Nouvel ID → `supersedes`

### Relations éliminées

- `replaces` — synonyme exact de `supersedes`
- `deprecated_by` — inverse de `supersedes`, calculable depuis le graphe

---

# 7. Famille 5 — Relations métier

## 7.1 `implements`

- **Direction** : réalisation → spécification
- **Signification** : l'objet source réalise concrètement ce que l'objet destination spécifie
- **Source autorisée** : `engine`, `rule`, `contract`
- **Destination autorisée** : `feature`, `contract`
- **Exemple** : `ENG-007 (Calculation Engine) implements F-006 (Calcul fiscal)`

## 7.2 `validates`

- **Direction** : vérificateur → objet vérifié
- **Signification** : l'objet source vérifie la conformité de l'objet destination
- **Source autorisée** : `validation`
- **Destination autorisée** : `rule`, `engine`, `feature`, `contract`
- **Exemple** : `VAL-001 validates TRF-0006`

## 7.3 `governs`

- **Direction** : autorité → objet gouverné
- **Signification** : l'objet source impose des règles, des limites ou des comportements à l'objet destination
- **Source autorisée** : `constraint`, `contract`, `standard`, `decision`
- **Destination autorisée** : `entity`, `rule`, `engine`, `feature`
- **Exemple** : `Constraint "L'amortissement ne porte jamais sur le terrain" governs TRF-0006`
- **Criticité** : la plus élevée du système

### Relations éliminées

- `describes` — non discriminant
- `applies_to` — synonyme de `governs`
- `calculates` / `generates` — cas particuliers de `produces`
- `consumes` / `produces` — couverts par `input_fields` / `output_fields` dans KS-002

---

# 8. Arbre de décision

| Question | Si oui | Si non |
|---|---|---|
| L'objet source fournit-il des données à la cible ? | `depends_on` | → question suivante |
| L'objet source impose-t-il des limites à la cible ? | `governs` | → question suivante |
| L'objet source justifie-t-il l'existence de la cible ? | `grounded_in` | → wikilink Obsidian |

---

# 9. Tableau récapitulatif

| # | Relation | Famille | Sens | Criticité |
|---|---|---|---|---|
| 1 | `contains` | Structurelle | parent → enfant | Moyenne |
| 2 | `belongs_to` | Structurelle | enfant → parent | Moyenne |
| 3 | `depends_on` | Dépendance | source → cible | Élevée |
| 4 | `grounded_in` | Référence | objet → autorité | Élevée |
| 5 | `derived_from` | Référence | produit → source | Moyenne |
| 6 | `supersedes` | Gouvernance | nouveau → ancien | Élevée |
| 7 | `implements` | Métier | réalisation → spec | Élevée |
| 8 | `validates` | Métier | vérificateur → vérifié | Élevée |
| 9 | `governs` | Métier | autorité → gouverné | Critique |
