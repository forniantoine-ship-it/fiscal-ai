---
id: KS-002
title: Front Matter Standard
type: standard
status: approved
version: "1.0"
created: 2026-06-28
updated: 2026-06-28
owner: product-owner
source: Baseline v1.0
tags: [knowledge-system, front-matter, metadata]
---

# KS-002 — Front Matter Standard

---

# 1. Objectif

Définir la structure de métadonnées commune à tous les objets du Knowledge System.

Le front matter est la seule source de métadonnées d'un objet. Aucune métadonnée ne doit être déduite du contenu du document ni de son emplacement dans l'arborescence.

---

# 2. Format

YAML, délimité par `---`, en tête de chaque fichier `.md`.

---

# 3. Champs obligatoires

## 3.1 `id`

- **Type** : string
- **Description** : identifiant unique conforme à KS-001
- **Exemple** : `id: TRF-0001`
- **Justification** : l'ID dans le front matter est la source de vérité. Le nom du fichier est un raccourci humain. En cas de divergence, le front matter fait foi.

## 3.2 `title`

- **Type** : string
- **Description** : titre complet et évolutif de l'objet
- **Exemple** : `title: Acquisition du bien`
- **Justification** : découpler le titre affiché du nom de fichier. Le titre peut évoluer, le nom de fichier suit la convention KS-001.

## 3.3 `type`

- **Type** : string (enum)
- **Valeurs autorisées** : `entity`, `field`, `rule`, `feature`, `engine`, `event`, `state`, `contract`, `decision`, `validation`, `standard`, `meta-model`, `data-model`, `user-story`, `scenario`
- **Exemple** : `type: rule`
- **Justification** : le type est un contrat entre l'auteur et le consommateur du document. Il dit explicitement comment interpréter ce document.

## 3.4 `status`

- **Type** : string (enum)
- **Valeurs autorisées** : `draft`, `review`, `approved`, `deprecated`, `archived`
- **Valeur par défaut** : si absent, considéré comme `draft`
- **Exemple** : `status: approved`
- **Justification** : porte à la fois la maturité et le niveau de confiance. Défini par KS-004. Seuls les objets `approved` font foi.

## 3.5 `version`

- **Type** : string
- **Exemple** : `version: "1.0"`
- **Justification** : chaque modification significative incrémente la version. Les corrections de forme ne changent pas la version. Les changements de fond oui.

## 3.6 `created`

- **Type** : date (ISO 8601, `YYYY-MM-DD`)
- **Exemple** : `created: 2026-06-28`
- **Justification** : la date de création est la seule métadonnée qui ne change jamais. Elle ancre l'objet dans le temps.

## 3.7 `updated`

- **Type** : date (ISO 8601, `YYYY-MM-DD`)
- **Exemple** : `updated: 2026-06-28`
- **Justification** : combiné avec `created`, il permet de calculer l'âge et la fraîcheur d'un document.

---

# 4. Champs recommandés

## 4.1 `owner`

- **Type** : string
- **Description** : personne ou rôle responsable de la validité du document
- **Exemple** : `owner: product-owner`
- **Justification** : quand une IA détecte une incohérence, elle doit savoir à qui s'adresser.

## 4.2 `source`

- **Type** : string ou liste
- **Description** : origine de la connaissance contenue dans le document
- **Exemple** : `source: CGI art. 39-C`
- **Justification** : dans un système fiscal, chaque règle doit pouvoir être rattachée à un texte de loi, une doctrine ou une décision produit.

## 4.3 `tags`

- **Type** : liste de strings, kebab-case
- **Description** : mots-clés facilitant la recherche transversale
- **Exemple** : `tags: [lmnp, amortissement, calcul]`
- **Justification** : permet la navigation transversale entre types d'objets différents.

---

# 5. Champs relationnels

Les relations utilisent exclusivement le vocabulaire défini par KS-003.

## 5.1 `depends_on`

```yaml
depends_on:
  hard: [FIELD-004, FIELD-031]
  soft: [DEC-003]
```

## 5.2 `grounded_in`

```yaml
grounded_in: [CGI art. 39-C, BOFiP BIC-AMT-10]
```

## 5.3 `derived_from`

```yaml
derived_from: [TRF-0001]
```

## 5.4 `supersedes`

```yaml
supersedes: null
```

## 5.5 `implements`

```yaml
implements: [F-006]
```

## 5.6 `validates`

```yaml
validates: [TRF-0006]
```

## 5.7 `governs`

```yaml
governs: [TRF-0006, ENG-007]
```

## 5.8 `contains`

```yaml
contains: [ENT-001, ENT-003]
```

## 5.9 `belongs_to`

```yaml
belongs_to: [ENT-002]
```

---

# 6. Champs spécifiques par type

Chaque type d'objet peut ajouter des champs propres dans son front matter, à condition que :

1. Le champ ne duplique pas un champ du socle commun.
2. Le champ est défini dans le standard spécifique du type.
3. Le champ respecte la convention `snake_case` en anglais.

Les champs spécifiques seront formalisés dans les standards de type (TRANSFORMATION_STANDARDS, FEATURE_STANDARDS, etc.).

---

# 7. Règles de validation

1. Un front matter sans `id` est invalide.
2. Un front matter sans `type` est invalide.
3. Si `status` est absent, la valeur est `draft`.
4. Les champs relationnels utilisent exclusivement des identifiants KS-001.
5. Les champs spécifiques ne doivent jamais redéfinir un champ du socle commun.
6. L'ordre des champs dans le YAML suit l'ordre : obligatoires → recommandés → relationnels → spécifiques.

---

# 8. Exemple complet

```yaml
---
id: TRF-0006
title: Calcul des amortissements LMNP
type: rule
status: approved
version: "2.0"
created: 2026-06-28
updated: 2026-07-15
owner: product-owner
source: CGI art. 39-C, BOFiP BIC-AMT-10
tags: [lmnp, amortissement, calcul, bâti]
depends_on:
  hard: [ENT-001, FIELD-004, FIELD-031, FIELD-032]
  soft: [DEC-012]
grounded_in: [CGI art. 39-C, BOFiP BIC-AMT-10]
derived_from: []
supersedes: null
implements: [F-006]
validates: []
governs: []
contains: []
belongs_to: []
input_fields: [FIELD-004, FIELD-031]
output_fields: [FIELD-082]
fiscal_regime: lmnp-reel
---
```
