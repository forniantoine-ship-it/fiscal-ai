---
id: VAL-001
title: Politique de validation du moteur
type: standard
status: approved
version: "1.0"
created: 2026-06-29
updated: 2026-06-29
owner: product-owner
source: Ontologie Fiscal AI
tags: [validation, politique, moteur, executor, knowledge-system]
depends_on:
  hard: [ONTOLOGY, BASELINE-V2]
  soft: [CASE-001]
---

# VAL-001 — Politique de validation du moteur

---

# 1. Objectif

Définir les règles officielles de validation entre le Knowledge System, les cas canoniques et les Executors.

Ce document est une loi du projet. Il ne décrit pas une fonctionnalité. Il décrit les règles que tout développeur et toute IA doivent respecter lorsqu'ils travaillent sur le moteur de calcul.

---

# 2. Hiérarchie des sources de vérité

```
Knowledge System (Vault)
    ↓ fait autorité sur
Cas canoniques (CASE-xxx)
    ↓ fait autorité sur
Executors (code TypeScript)
```

### Règle 1 — Le Knowledge System est la source de vérité unique

Les Axiomes, Savoirs, Jugements, Raisonnements et Transformations du Vault sont la référence absolue. En cas de contradiction entre le Vault et tout autre artefact, le Vault fait foi.

### Règle 2 — Un cas canonique est une référence de validation, pas une source de vérité

CASE-001 et les futurs CASE-xxx documentent les résultats attendus sur des dossiers concrets. Ils sont dérivés du Knowledge System. Si une Transformation du Vault change, le cas canonique doit être mis à jour en conséquence.

Un cas canonique ne peut jamais contredire une Transformation du Vault. S'il la contredit, c'est le cas qui est faux.

### Règle 3 — Un Executor n'est jamais une source de vérité

Un Executor est une implémentation d'une Transformation. Il exécute la logique documentée dans le Vault. Il ne la définit pas.

Si un Executor produit un résultat différent de ce que la Transformation prescrit, c'est l'Executor qui est faux — sauf si l'analyse révèle une erreur dans la Transformation elle-même.

---

# 3. Protocole de traitement des divergences

### Quand une divergence est détectée

Une divergence est un écart entre le résultat produit par un Executor et le résultat attendu par un cas canonique.

### Étape 1 — Constater

Le Validation Runner détecte la divergence et produit un rapport. Il ne corrige rien.

### Étape 2 — Analyser

Un humain (ou une IA sous supervision humaine) analyse la divergence et identifie la source :

| Source de l'erreur | Action |
|---|---|
| **Executor incorrect** | Corriger le code de l'Executor. Ne pas toucher au Knowledge System ni au cas canonique. |
| **Cas canonique incorrect** | Corriger les valeurs du cas canonique. Justifier la correction. Ne pas toucher au Knowledge System ni à l'Executor. |
| **Transformation incorrecte dans le Knowledge System** | Proposer une évolution du Knowledge System. Après validation humaine, mettre à jour la Transformation, puis le cas canonique, puis l'Executor. |
| **Nouvelle connaissance découverte** | Proposer un nouveau Savoir, Jugement ou Axiome. Ne rien modifier tant que la connaissance n'est pas validée et intégrée au Vault. |

### Étape 3 — Corriger

La correction suit toujours l'ordre de la hiérarchie :

1. D'abord le Knowledge System (si nécessaire)
2. Puis le cas canonique (si nécessaire)
3. Puis l'Executor (si nécessaire)

Jamais dans l'ordre inverse.

### Étape 4 — Vérifier

Après correction, le Validation Runner est relancé. La divergence doit disparaître. Si une nouvelle divergence apparaît, retourner à l'étape 2.

---

# 4. Règles de correction

### Règle 4 — Aucune correction automatique

Aucun composant du système ne corrige automatiquement une divergence. Le Validation Runner constate. Il ne répare jamais.

### Règle 5 — Aucune connaissance codée directement

Si une validation révèle qu'une connaissance métier manque dans le Vault (axiome inconnu, savoir absent, jugement non documenté), cette connaissance doit d'abord être proposée comme évolution du Knowledge System.

Elle ne doit jamais être codée directement dans un Executor.

L'Executor ne sait que ce que le Vault lui dit de savoir.

### Règle 6 — Les arrondis ne sont pas des divergences

Le Comparator utilise une tolérance configurable (par défaut : 0,01 €). Un écart inférieur à cette tolérance est un match, pas une divergence.

Quand les valeurs canoniques d'un cas sont établies, elles doivent correspondre au calcul exact du moteur, pas à un arrondi manuel. Si un écart systématique d'arrondi est détecté, c'est le cas canonique qui est ajusté aux valeurs exactes.

### Règle 7 — Un Executor sans cas canonique est non validé

Un Executor qui n'est couvert par aucun cas canonique est considéré comme non validé. Il peut exister dans le code mais il ne peut pas être utilisé en production.

---

# 5. Cycle de vie d'un Executor

```
Transformation rédigée dans le Vault
    ↓
Cas canonique rédigé (CASE-xxx)
    ↓
Executor implémenté
    ↓
Validation Runner exécuté
    ↓
Tous les cas passent → Executor validé
    ↓
Executor utilisable en production
```

Un Executor ne peut pas être implémenté avant que sa Transformation soit `approved` dans le Vault.

Un Executor ne peut pas être considéré comme validé avant qu'au moins un cas canonique le couvre.

---

# 6. Évolution du Knowledge System pendant le développement

### Règle 8 — Les découvertes alimentent le Vault

Si le développement d'un Executor révèle :
- un Axiome non documenté,
- un Savoir manquant,
- un Jugement implicite,
- une erreur dans une Transformation,
- un cas limite non prévu,

la découverte est documentée et proposée comme évolution du Knowledge System.

Le développement de l'Executor est suspendu sur le point concerné tant que l'évolution n'est pas validée.

### Règle 9 — Le code suit le Vault, jamais l'inverse

Si un Executor fonctionne correctement mais contredit le Vault, c'est le Vault qui a potentiellement tort. Mais la correction passe par le Vault d'abord, puis le code s'aligne.

Le code n'est jamais la justification d'une modification du Vault. L'expertise métier est la justification.

---

# 7. Responsabilités

| Rôle | Responsabilité |
|---|---|
| Knowledge System | Définir la vérité métier |
| Cas canoniques | Vérifier que la vérité est exécutable |
| Executors | Exécuter la vérité |
| Validation Runner | Constater les divergences |
| Humain (Product Owner) | Analyser et décider la correction |
