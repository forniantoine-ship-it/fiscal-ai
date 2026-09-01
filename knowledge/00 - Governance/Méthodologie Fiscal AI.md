

Version : 1.0

Statut : Document fondateur

---

# Objectif

Définir la méthode officielle de conception, de spécification et de développement de Fiscal AI.

Ce document décrit comment une idée devient une fonctionnalité en production.

Toute nouvelle fonctionnalité doit suivre cette méthodologie.

---

# Notre philosophie

Nous ne développons jamais directement une idée.

Nous la transformons progressivement jusqu'à obtenir un code fiable, testable et maintenable.

Chaque étape réduit l'ambiguïté.

Chaque document a une responsabilité unique.

---

# La chaîne de conception

Toute évolution suit obligatoirement le processus suivant :

Idée

↓

Vision

↓

PRD

↓

Scénario

↓

Blueprint

↓

SAS

↓

User Stories

↓

Développement

↓

Tests

↓

Livraison

Aucune étape ne doit être ignorée.

---

# Les responsabilités

## Vision

Pourquoi cette fonctionnalité existe.

---

## PRD

Ce que doit faire la fonctionnalité.

Aucune décision technique.

---

## Scénario

Décrit le parcours utilisateur complet.

Le scénario est la référence fonctionnelle.

---

## Blueprint

Décrit la logique métier.

Le Blueprint contient :

- les moteurs ;
    
- les workflows ;
    
- les règles métier.
    

Le Blueprint ne décrit jamais la technologie.

---

## SAS

Décrit l'architecture technique.

Le SAS explique comment implémenter le Blueprint.

---

## User Stories

Découpent une fonctionnalité en unités de développement.

Chaque User Story doit être suffisamment petite pour être développée indépendamment.

---

## Développement

Le développement implémente exclusivement les User Stories validées.

Aucune logique métier ne doit être inventée pendant cette étape.

---

## Tests

Chaque fonctionnalité est validée à partir des règles métier et des critères d'acceptation définis dans les documents précédents.

---

# Les règles de conception

Chaque document possède une seule responsabilité.

Chaque document répond à une seule question.

Chaque document réduit une ambiguïté.

Chaque document doit pouvoir être relié à au moins un scénario.

---

# Les règles de développement

Le code suit toujours le Blueprint.

Le Blueprint suit toujours le PRD.

Le PRD suit toujours la Vision.

Le code ne modifie jamais le Blueprint.

---

# Les règles de qualité

Nous ne documentons jamais une technologie.

Nous documentons des comportements.

Nous documentons des décisions.

Nous documentons des règles métier.

Les technologies pourront évoluer.

La logique métier doit rester stable.

---

# Les critères de création d'un document

Avant de créer une nouvelle note, nous devons répondre aux questions suivantes :

- Quelle ambiguïté ce document supprime-t-il ?
    
- Quel document utilisera cette information ?
    
- Quelle partie du logiciel pourra être développée grâce à lui ?
    

Si ces réponses ne sont pas clairement identifiées, le document ne doit pas être créé.

---

# Les principes fondamentaux

Le produit guide la technique.

Le métier guide le produit.

Le code implémente le métier.

Le Blueprint est la source officielle de vérité.

Toute évolution commence par une évolution du Blueprint.

Jamais l'inverse.

---

# Notre objectif

Construire Fiscal AI comme un système durable.

Le code pourra évoluer.

Les technologies pourront changer.

Le raisonnement métier devra rester intact.