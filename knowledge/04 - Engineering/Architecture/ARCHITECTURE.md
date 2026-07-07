# ARCHITECTURE

Version : 1.0

Statut : Document fondateur

---

# Mission

Ce document définit l'architecture officielle de Fiscal AI.

Toute évolution du projet doit respecter cette architecture.

Aucun développement ne doit être réalisé s'il est en contradiction avec ce document.

---

# Philosophie

Fiscal AI est conçu selon les principes du Domain Driven Design (DDD).

Le métier est toujours prioritaire sur la technique.

La documentation constitue la source officielle du projet.

Le code est une conséquence de la documentation.

Le Data Dictionary constitue la référence officielle des données.

Les Rules constituent la référence officielle des traitements métier.

Les Features constituent la référence officielle des fonctionnalités.

Aucun composant ne doit contourner ces principes.

---

# Principe fondamental

Documentation

↓

Architecture

↓

Code

↓

Tests

↓

Déploiement

Jamais l'inverse.

# MISSION

Version : 1.0

Statut : Fondation du projet

---

# Pourquoi ce document existe

Ce document explique la philosophie de développement de Fiscal AI.

Il ne décrit pas une architecture logicielle.

Il décrit la manière dont le projet doit être pensé.

Toute IA intervenant sur ce projet doit comprendre ce document avant de modifier le moindre fichier.

---

# Notre conviction

Les modèles d'intelligence artificielle évoluent rapidement.

Les frameworks évoluent rapidement.

Les langages évoluent rapidement.

En revanche, la connaissance métier évolue beaucoup plus lentement.

La valeur de Fiscal AI ne réside donc pas dans son code.

Elle réside dans la qualité de sa connaissance métier.

---

# Notre objectif

Notre objectif n'est pas de produire du code.

Notre objectif est de construire une base de connaissances suffisamment précise pour permettre à une IA de produire un logiciel fiable.

Le code est un résultat.

La connaissance est l'actif principal.

---

# Le rôle du Blueprint

Le Blueprint n'est pas une documentation.

Le Blueprint est une base de connaissances.

Il décrit :

* le métier ;
* les contraintes ;
* les concepts ;
* les règles ;
* les objectifs.

Il ne décrit pas l'implémentation technique.

---

# Le rôle de l'IA

Le Blueprint définit :

* ce qu'il faut construire ;
* pourquoi il faut le construire.

L'IA décide :

* comment le construire.

L'IA est encouragée à proposer de meilleures solutions techniques tant qu'elles respectent les contraintes métier.

Une amélioration technique est toujours bienvenue.

Une modification du métier ne l'est jamais sans validation.

---

# Notre priorité

Réduire les hallucinations sur le métier.

Pas réduire la créativité technique.

---

# La règle fondamentale

Le métier est stable.

La technique évolue.

Le Blueprint protège le métier.

L'IA optimise la technique.

Cette séparation constitue le principe fondateur de Fiscal AI.

# Principe de l'ingénieur senior

Une IA intervenant sur Fiscal AI n'est pas considérée comme un simple générateur de code.

Elle est considérée comme un ingénieur logiciel senior.

À ce titre, elle doit :

* comprendre le problème avant de proposer une solution ;
* remettre en question une implémentation technique lorsqu'une meilleure approche existe ;
* expliquer les avantages et les inconvénients de ses propositions ;
* préserver la cohérence globale du projet.

En revanche, une IA ne doit jamais modifier seule :

* les règles métier ;
* les contraintes fonctionnelles ;
* les définitions du domaine ;
* les décisions produit.

Ces décisions relèvent exclusivement du Blueprint et nécessitent une validation humaine.

L'objectif est de combiner :

* l'expertise métier du Blueprint ;
* la capacité d'analyse de l'IA ;
* la validation du Product Owner.

C'est cette collaboration qui garantit la qualité de Fiscal AI.
