# RULE-0000 - Rule Specification Standard

Version : 1.0

Statut : Référence

Classification : Standard de conception

---

# 1. Objectif

Ce document définit le format officiel de toutes les règles métier utilisées par Fiscal AI.

Aucune règle métier ne peut être créée sans respecter ce standard.

L'objectif est de garantir :

- une documentation homogène ;
    
- une compréhension rapide ;
    
- une implémentation fiable ;
    
- une maintenance simplifiée.
    

---

# 2. Philosophie

Une règle métier représente une connaissance.

Elle ne représente ni un écran, ni une interface, ni une technologie.

Une règle décrit une vérité métier que le logiciel doit appliquer.

Les moteurs utilisent les règles.

Ils ne les définissent pas.

---

# 3. Structure obligatoire

Chaque règle métier doit contenir les sections suivantes.

## Identifiant

Exemple :

RULE-0006

---

## Nom

Nom court et explicite.

Exemple :

Amortissement du bâtiment.

---

## Objectif

Pourquoi cette règle existe-t-elle ?

Quel problème métier résout-elle ?

---

## Description

Explication générale de la règle.

Sans entrer dans les détails techniques.

---

## Conditions d'application

Quand cette règle doit-elle être appliquée ?

Quand ne doit-elle pas être utilisée ?

---

## Données nécessaires

Liste exhaustive des informations indispensables.

Exemple :

- date d'acquisition
    
- prix du bien
    
- valeur du terrain
    
- durée d'amortissement
    

---

## Traitement

Description précise du raisonnement métier.

Étape par étape.

Sans code.

---

## Résultat attendu

Que produit cette règle ?

Exemple :

Montant annuel amortissable.

---

## Exceptions

Cas où la règle ne s'applique pas normalement.

---

## Cas particuliers

Situations rares mais prévues.

---

## Cas d'erreur

Que se passe-t-il si une donnée est absente ou incohérente ?

---

## Moteurs concernés

Quels moteurs utilisent cette règle ?

Exemple :

- Calculation Engine
    
- Validation Engine
    

---

## Écrans concernés

Quels écrans peuvent afficher ou demander des informations liées à cette règle ?

---

## Tests métier

Liste des cas de test permettant de vérifier que la règle est correctement implémentée.

Chaque règle doit posséder au minimum :

- un cas nominal ;
    
- un cas limite ;
    
- un cas d'erreur.
    

---

## Références

Sources officielles :

- BOFiP
    
- CGI
    
- doctrine
    
- jurisprudence
    

---

## Historique

Version de la règle.

Date.

Auteur.

Motif de modification.

---

# 4. Principes

Une règle ne contient jamais de code.

Une règle ne décrit jamais une interface utilisateur.

Une règle ne dépend jamais d'une technologie.

Une règle doit pouvoir être comprise par :

- un fiscaliste ;
    
- un Product Manager ;
    
- un développeur.
    

---

# 5. Critères de qualité

Une règle est considérée comme terminée lorsqu'elle est :

- compréhensible ;
    
- complète ;
    
- testable ;
    
- traçable ;
    
- référencée ;
    
- indépendante.
    

---

# 6. Rôle dans Fiscal AI

Les règles métier constituent la base de connaissance officielle de Fiscal AI.

Les moteurs ne doivent jamais contenir directement la logique métier lorsqu'elle peut être exprimée sous forme de règle.

Toute évolution fonctionnelle commence par une évolution des règles métier.

Les moteurs sont responsables de leur exécution.

Les règles sont responsables de la connaissance.