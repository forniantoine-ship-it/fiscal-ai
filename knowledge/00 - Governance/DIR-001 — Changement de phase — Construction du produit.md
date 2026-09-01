---
id: DIR-001
title: Changement de phase — Construction du produit
type: directive
status: approved
version: "1.0"
created: 2026-07-01
updated: 2026-07-01
owner: product-owner
tags: [directive, gouvernance, phase, mvp, construction]
supersedes: []
---

# DIR-001 — Changement de phase : Construction du produit

---

# Contexte

Le Knowledge System est désormais considéré comme suffisamment mature pour permettre le développement du MVP.

Les phases Vision, Gouvernance, Architecture et Modèle de conception des Assistants sont considérées comme stabilisées.

À partir de cette décision, la priorité du projet devient la construction du produit.

---

# Nouvelle règle de travail

Le produit devient la principale source de découverte.

Le Knowledge System n'anticipe plus les besoins futurs.

Le produit met le Knowledge System à l'épreuve.

Les évolutions du KS ne sont plus initiées par anticipation — uniquement lorsqu'un besoin réel apparaît lors de la conception ou de l'implémentation d'une Feature.

---

# Règle d'évolution du Knowledge System

Avant toute proposition d'évolution du KS, appliquer systématiquement les quatre questions suivantes :

1. Le développement est-il réellement bloqué ?
2. Ce besoin est-il rencontré dans un Assistant réel ?
3. Le problème ne peut-il pas être résolu avec les connaissances existantes ?
4. Cette évolution sera-t-elle réutilisable dans plusieurs Assistants ?

**Si une réponse est négative, l'évolution est reportée.**

Le besoin est enregistré dans le Registre d'observations ou dans le Backlog SAV selon sa nature.

---

# Règle de découverte

Toute découverte doit d'abord être considérée comme une **hypothèse**.

Elle ne devient une règle du Knowledge System qu'après avoir été :
- confirmée par au moins un cas réel ;
- soumise à une revue contradictoire et avoir résisté.

Une découverte non confirmée n'a pas sa place dans le KS — elle appartient au Registre d'observations ou au Backlog SAV.

---

# Règle de conception des Assistants

Chaque nouvel Assistant suit le cycle suivant, sans dérogation :

```
Compréhension du problème utilisateur
    ↓
Identification de la famille d'Assistant
    ↓
Conception UX
    ↓
Challenge contradictoire
    ↓
Validation
    ↓
Implémentation
    ↓
Tests
    ↓
Assistant suivant
```

**Aucun Assistant n'est laissé partiellement conçu.**

---

# Définition de terminé (Definition of Done)

Une Feature est considérée comme terminée lorsqu'elle satisfait tous les critères suivants :

- [ ] Son problème utilisateur est clairement identifié
- [ ] Sa famille d'Assistant est connue
- [ ] Son workflow est validé
- [ ] Ses Contracts sont identifiés
- [ ] Elle a survécu à une revue contradictoire
- [ ] Elle est prête à être implémentée dans Cursor

À partir de ce moment, la priorité devient son implémentation.

---

# Règle de gouvernance

Les abstractions nouvelles sont interdites par défaut.

Toute nouvelle famille, tout nouveau moteur, toute nouvelle Capability ou toute nouvelle couche d'architecture doit être justifiée par un problème utilisateur réel qui ne peut pas être modélisé avec les concepts existants.

---

# Rôle de Claude

Le rôle principal de Claude évolue à partir de DIR-001.

**Rôle précédent :** concepteur du Knowledge System.

**Rôle à partir de DIR-001 :** Principal AI Software Architect et Technical Lead.

Ses priorités :
1. Concevoir les Assistants
2. Challenger les choix Produit et Architecture
3. Garantir la cohérence entre Obsidian et le code
4. Préparer une implémentation simple dans Cursor

---

# Rôle d'Obsidian

Obsidian devient la mémoire officielle du projet.

Il ne sert plus à anticiper toutes les situations possibles.

Il sert à :
- conserver les décisions ;
- documenter les règles métier ;
- tracer les choix d'architecture ;
- capitaliser les découvertes validées.

---

# Principe directeur

> Le meilleur moyen d'améliorer le Knowledge System n'est plus d'écrire de nouveaux documents. C'est de construire le produit. Chaque implémentation est désormais une expérience qui confirme, invalide ou enrichit les connaissances existantes.
