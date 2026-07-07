---
id: KS-001
title: Naming Convention
type: standard
status: approved
version: "1.0"
created: 2026-06-28
updated: 2026-06-28
owner: product-owner
source: Baseline v1.0
tags: [knowledge-system, naming, convention]
---

# KS-001 — Naming Convention

---

# 1. Objectif

Définir les conventions de nommage officielles du Knowledge System de Fiscal AI.

Chaque objet possède un identifiant unique, lisible par un humain et requêtable par une IA.

---

# 2. Format de l'identifiant

```
{PREFIX}-{NUMÉRO}
```

- **PREFIX** : code alphabétique en majuscules, identifiant le type d'objet.
- **NUMÉRO** : numérique, zéro-paddé. La convention numérique est fixée par type et ne change plus.

---

# 3. Table des préfixes officiels

| Préfixe | Type d'objet | Exemple |
|---|---|---|
| `ENT` | Entity | ENT-001 |
| `FIELD` | Field | FIELD-042 |
| `RULE` | Rule | TRF-0001 |
| `F` | Feature | F-001 |
| `ENG` | Engine | ENG-007 |
| `EVT` | Event | EVT-001 |
| `STATE` | State | STATE-001 |
| `CTR` | Contract | CTR-001 |
| `DEC` | Decision | DEC-001 |
| `VAL` | Validation | VAL-001 |
| `KS` | Knowledge Standard | KS-001 |
| `KM` | Knowledge Meta Model | KM-001 |
| `DATA` | Data Model | DATA-001 |
| `US` | User Story | US-001 |
| `SCN` | Scenario | SCN-001 |

---

# 4. Nommage des fichiers

```
{ID} – {Titre}.md
```

- Séparateur : tiret cadratin ` – ` (avec espaces).
- Titre : casse naturelle en français.
- Exemple : `TRF-0001 – Acquisition du bien.md`

---

# 5. Nommage des dossiers

- Dossiers de zone : `{NN} - {Nom}` (ex: `01 - Business`).
- Sous-dossiers : nom au pluriel, en anglais (ex: `Rules`, `Features`, `Engines`).
- Le contenu des fichiers reste intégralement en français.

---

# 6. Règles fondamentales

## 6.1 Immuabilité

Un identifiant ne change jamais.

Le titre d'un document peut évoluer. Son identifiant reste identique pendant toute sa durée de vie.

Exemple :

`TRF-0006 – Amortissements` → `TRF-0006 – Calcul des amortissements LMNP`

L'identifiant TRF-0006 reste inchangé.

## 6.2 Non-réutilisation

Si un objet est supprimé ou remplacé, son identifiant est définitivement réservé.

La prochaine Rule créée après TRF-0008 sera TRF-0009, jamais une nouvelle TRF-0008.

## 6.3 Convention numérique stable

Chaque type d'objet conserve sa convention historique. Les objets existants ne sont jamais renumérotés.

## 6.4 Autorité

Chaque objet du Knowledge System possède un statut défini par KS-004. Seuls les objets `approved` font foi.

---

# 7. Ajout d'un nouveau préfixe

Un nouveau préfixe ne peut être ajouté que par mise à jour de KS-001.

Il doit être :

- unique ;
- non ambigu ;
- de 1 à 5 caractères ;
- validé par le Product Owner.
