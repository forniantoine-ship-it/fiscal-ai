---
id: UXP-001
title: Diagnostic de situation
type: ux-pattern
status: hypothesis
version: "1.0"
created: 2026-06-30
updated: 2026-06-30
owner: product-owner
tags: [ux-pattern, onboarding, collecte, friction]
statut-produit: 🟡 Hypothèse
principes: [P16, P19]
---

# Diagnostic de situation

---

# Problème résolu

Lorsqu'une étape de collecte d'information suppose que l'utilisateur possède un document, une connaissance ou une information précise, une partie significative des utilisateurs se retrouve dans une impasse — soit parce qu'ils ne possèdent pas ce qui est demandé, soit parce qu'ils ne comprennent pas ce qu'on leur demande.

Cette friction produit de l'abandon et génère de l'anxiété chez l'utilisateur qui ne se sent pas "à la hauteur".

---

# Principe appliqué

- **Constitution P16** : le diagnostic précède la demande — ne jamais supposer que l'utilisateur possède une information particulière.
- **Constitution P19** : le chemin de moindre friction prévaut — parmi les moyens disponibles, sélectionner celui qui demande le moins d'effort à chaque profil.

---

# Condition d'application

Ce pattern s'applique quand :
- Une étape cherche à obtenir une information que l'utilisateur peut posséder de plusieurs manières différentes (document, numéro mémorisé, déduction automatique, API…)
- Plusieurs profils d'utilisateurs arrivent sur cette étape dans des situations structurellement différentes (certains ont l'information, d'autres non)

Ce pattern ne s'applique PAS quand :
- L'information est universellement disponible pour tous les utilisateurs (ex : "quelle est l'adresse de votre bien ?" — tout propriétaire la connaît)
- Un seul chemin est possible et connu de tous

---

# Structure générale

1. **Orientation** : avant toute demande d'information ou de document, poser une question simple qui permet d'identifier la situation structurelle de l'utilisateur. La question doit pouvoir être répondue sans aucune connaissance préalable.

2. **Ramification** : chaque réponse ouvre un chemin adapté à la situation identifiée. Le chemin emprunte le moyen de moindre effort disponible pour ce profil.

3. **Convergence** : tous les chemins aboutissent au même résultat — l'information est obtenue, validée, et l'utilisateur peut poursuivre.

4. **Transparence** : quel que soit le chemin emprunté, expliquer à l'utilisateur ce qui a été retenu et pourquoi — avant de passer à l'étape suivante.

La question d'orientation ne demande ni document, ni numéro, ni connaissance technique. Elle demande un état de fait que l'utilisateur peut évaluer instinctivement.

---

# Alternatives rejetées

**Alternative 1 — Formulaire complet unique** : présenter tous les champs à remplir. Rejetée car elle suppose que l'utilisateur possède toutes les informations et sait quoi mettre dans chaque champ.

**Alternative 2 — Import de document obligatoire** : exiger un document précis comme point d'entrée. Rejetée car elle échoue pour les profils qui ne possèdent pas ce document (PROF-003, PROF-004) et frustre ceux pour qui la saisie directe serait plus rapide (PROF-002).

**Alternative 3 — Questions séquentielles sans orientation préalable** : poser les questions une par une sans diagnostic initial. Rejetée car l'utilisateur qui ne sait pas répondre à une question est bloqué sans issue visible.

---

# Features qui appliquent ce pattern

- F-009 — Déclaration d'activité LMNP (premier cas d'application documenté)

---

# Statut de validation

🟡 Hypothèse — raisonnement produit issu de la mission R-004 (2026-06-30), non encore confirmé par un test utilisateur réel.

**Critère de passage à ✅ Validé** : taux de complétion de l'étape "Activité" mesuré sur un minimum de 20 utilisateurs réels, comparé à une version sans diagnostic de situation. Amélioration attendue : réduction des abandons sur cette étape.

**Critère de passage à 🔴 Invalidé** : si des tests utilisateurs révèlent que la question d'orientation crée plus de confusion qu'elle n'en résout, ou qu'un formulaire unique avec aide contextuelle est plus efficace.
