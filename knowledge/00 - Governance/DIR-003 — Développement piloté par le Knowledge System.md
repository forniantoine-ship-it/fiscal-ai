---
id: DIR-003
title: Développement piloté par le Knowledge System
type: directive
status: approved
version: "1.1"
created: 2026-07-01
updated: 2026-07-01
owner: product-owner
tags: [directive, gouvernance, ks, workflow, développement]
related: [DIR-001, DIR-002]
---

# DIR-003 — Développement piloté par le Knowledge System

---

# Contexte

Toute personne travaillant sur Fiscal AI — développeur humain ou assistant IA — dispose désormais d'un accès en lecture au Knowledge System.

Cet accès change la nature du développement.

Il n'est plus acceptable de développer une Feature en s'appuyant uniquement sur le code existant, sur des hypothèses personnelles, ou sur la mémoire d'une conversation précédente.

Le KS est accessible. Il doit être consulté en premier.

---

# Règle fondamentale

Toute implémentation commence par la lecture du Knowledge System.

Le Knowledge System décrit le produit tel qu'il doit être. Le code décrit le produit tel qu'il est.

Ces deux lectures ne se substituent pas l'une à l'autre. Elles se complètent.

---

# Règles de travail

## Règle 1 — Lecture avant écriture

Avant de modifier le code d'une Feature, le développeur lit les documents KS concernés.

Une Feature ne peut pas être implémentée à partir du seul code existant.

Si aucun document KS n'existe pour la Feature concernée, appliquer la **Règle 4**.

## Règle 2 — Priorité à l'intention

Lorsque le KS et le code décrivent des comportements différents, le KS prévaut.

La divergence n'est pas résolue arbitrairement.

Elle est analysée, puis son origine est identifiée :
- Le code a divergé du KS sans décision explicite → le code est aligné sur le KS.
- Le KS est devenu obsolète par rapport à une décision validée → le KS est mis à jour.
- L'origine est ambiguë → la décision remonte au Product Owner.

Le développeur ne tranche jamais seul une divergence entre KS et code.

## Règle 3 — Lecture seule du KS depuis le code

La connexion entre l'environnement de développement et le KS est volontairement en lecture seule.

Aucune évolution du KS ne déclenche automatiquement une modification du code.

Aucune exécution de code ne modifie le KS.

Le développement reste un acte intentionnel, initié par un humain.

## Règle 4 — Modifications sans document KS préalable

Toutes les modifications ne sont pas équivalentes. Deux cas sont distingués.

**Cas 1 — Évolution fonctionnelle ou métier**

Une évolution fonctionnelle modifie, étend ou introduit un comportement visible du produit : une nouvelle Feature, une modification du Workflow, un changement de Contract, une règle métier.

Si aucun document KS ne couvre l'évolution envisagée :

1. L'implémentation est suspendue.
2. Le développeur signale l'absence au Product Owner.
3. Le document KS est rédigé, challengé et validé.
4. L'implémentation commence ensuite.

Il n'existe pas d'évolution fonctionnelle "évidente" qui puisse court-circuiter cette règle.

**Cas 2 — Correction purement technique**

Une correction purement technique ne modifie pas le comportement métier du produit : refactoring local, correction de bug technique, optimisation, réduction de dette technique, ajustement CSS, correction de build.

Ces corrections peuvent être réalisées directement dans le code sans document KS préalable.

**Garde-fou :** si la correction révèle une divergence entre le code et le KS, ou soulève une question sur l'intention métier, elle bascule en Cas 1 et le Product Owner est consulté.

## Règle 5 — Rôle des assistants IA

Lorsqu'un assistant IA cherche à comprendre une Feature, il consulte le KS en premier.

Le code ne sert à l'assistant IA que pour comprendre l'implémentation actuelle — jamais pour inférer l'intention du produit.

Si le KS est silencieux sur un point, l'assistant IA le signale explicitement plutôt que d'interpréter le code comme source de vérité métier.

---

# Workflow officiel

```
Lecture du KS (Feature, Workflow, Contracts)
          ↓
   Analyse d'impact
          ↓
      Proposition
          ↓
  Validation Product Owner
          ↓
    Implémentation
          ↓
        Tests
          ↓
      Commit Git
```

Ce workflow s'applique aux évolutions fonctionnelles et métier (Règle 4, Cas 1).

Les corrections purement techniques (Règle 4, Cas 2) n'en requièrent pas l'application complète.

Aucune étape ne peut être sautée sans validation explicite du Product Owner.

---

# Ce que cette directive ne change pas

DIR-003 ne modifie pas les règles suivantes, qui restent en vigueur :

- Le KS n'est mis à jour qu'après validation humaine. (CLAUDE.md)
- Toute découverte est d'abord une hypothèse. (DIR-001)
- Le code peut remettre en question un Workflow, un Contract ou une Capability — mais jamais les règles fiscales, les Savoirs, Jugements ou Transformations. (DIR-002)

---

# Principe directeur

> Comprendre avant d'écrire. Lire le KS n'est pas une étape optionnelle — c'est la première étape du développement.
