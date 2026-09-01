---
id: DIR-002
title: Le code devient une source de vérité
type: directive
status: approved
version: "1.1"
created: 2026-07-01
updated: 2026-07-01
owner: product-owner
tags: [directive, gouvernance, code, apprentissage, feedback-loop]
related: [DIR-001]
---

# DIR-002 — Le code devient une source de vérité

---

# Principe

À partir de cette phase, le code n'est plus considéré comme une simple implémentation.

Le code devient une source d'apprentissage au même titre que le produit.

Une difficulté rencontrée pendant l'implémentation peut remettre en question :
- une Feature ;
- un Workflow ;
- un Contract ;
- une Capability ;
- une décision d'architecture.

Le développement fait désormais partie du processus de conception.

---

# Principe de réalité

Une architecture n'est considérée comme validée que lorsqu'elle fonctionne dans le logiciel.

Une Feature n'est considérée comme réellement terminée que lorsqu'elle a été implémentée et utilisée.

Une hypothèse qui résiste au papier mais échoue dans le code doit être réévaluée.

---

# Règle de retour d'expérience

Chaque implémentation doit répondre à quatre questions :

1. Le Workflow était-il suffisamment précis ?
2. Les Contracts étaient-ils suffisants ?
3. L'architecture a-t-elle facilité ou compliqué le développement ?
4. Quelle découverte mérite de remonter vers Obsidian ?

---

# La règle la plus importante

Le code est désormais un partenaire de conception.

**Avant DIR-002 :**
```
Obsidian → Produit → Architecture
```

**À partir de DIR-002 :**
```
Obsidian ↔ Produit ↔ Architecture ↔ Code
```

Chaque couche peut apprendre aux autres.

---

# Périmètre de DIR-002

DIR-002 concerne exclusivement la **conception technique**.

Il ne modifie pas le principe fondateur de Fiscal AI. CLAUDE.md reste inchangé : le Knowledge System demeure la source de vérité des règles métier.

## Ce que le code peut remettre en question

- Un Workflow (trop vague, incomplet, mal séquencé)
- Un Contract (champs manquants, typage insuffisant)
- Une Capability (mal délimitée, trop couplée)
- Une décision d'architecture (inadaptée à l'implémentation réelle)
- Un choix d'implémentation (pattern, structure, dépendance)

## Ce que le code ne remet jamais en question

- Les règles fiscales
- Les Savoirs, Jugements et Transformations
- L'ontologie du domaine
- Les Axiomes
- Les décisions Produit validées par le Product Owner

**La règle :** si une difficulté d'implémentation touche au métier, elle remonte vers le Product Owner — elle ne se résout pas dans le code.
