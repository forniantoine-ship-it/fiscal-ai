

Version : 1.0

Statut : 🔒 Référence

---

# Objectif

Définir les objets métier fondamentaux de Fiscal AI.

Tous les moteurs, toutes les Features, toutes les Rules et toutes les futures bases de données s'appuient sur ce modèle.

Ce document décrit les concepts métier.

Il ne décrit pas les tables SQL.

---

# Philosophie

Chaque objet représente un concept métier.

Jamais une implémentation technique.

Les relations entre les objets sont stables.

Les technologies pourront évoluer.

Les concepts métier resteront.

---

# Domain Model

## Dossier

Représente une déclaration LMNP.

Un dossier possède :

- un propriétaire ;
    
- une année fiscale ;
    
- un ou plusieurs biens (V2, un seul pour le MVP) ;
    
- des documents ;
    
- des calculs ;
    
- une déclaration.
    

---

## Bien

Représente un bien immobilier.

Il appartient à un seul dossier.

Un bien possède notamment :

- une acquisition ;
    
- un financement ;
    
- des travaux ;
    
- du mobilier ;
    
- des amortissements.
    

---

## Document

Représente un document importé.

Un document possède :

- un type ;
    
- un contenu OCR ;
    
- un statut ;
    
- des métadonnées.
    

---

## Question

Représente une information demandée à l'utilisateur.

Une question possède :

- un objectif ;
    
- une priorité ;
    
- un statut ;
    
- une réponse éventuelle.
    

---

## Réponse

Information fournie par l'utilisateur.

Une réponse est toujours associée à une seule question.

---

## Rule

Représente une règle métier.

Une Rule décrit une connaissance fiscale.

Elle ne contient aucun code.

Elle est utilisée par le Calculation Engine.

---

## Calcul

Représente le résultat d'une ou plusieurs Rules.

Chaque calcul est traçable.

Chaque calcul est reproductible.

---

## Déclaration

Représente le résultat final produit par Fiscal AI.

Elle regroupe :

- les formulaires ;
    
- les annexes ;
    
- les justificatifs.
    

---

# Relations

Un Dossier contient :

- des Biens ;
    
- des Documents ;
    
- des Questions ;
    
- des Calculs ;
    
- une Déclaration.
    

Un Bien produit :

- des Calculs.
    

Les Documents alimentent :

- les Questions ;
    
- les Rules.
    

Les Rules alimentent :

- les Calculs.
    

Les Calculs alimentent :

- la Déclaration.
    

---

# Principes

Un objet métier ne connaît jamais un Engine.

Les Engines manipulent les objets.

Les objets ne dépendent jamais des Engines.

Les Rules manipulent les objets.

Jamais les interfaces.

---

# Interdictions

Ne jamais ajouter :

- des notions techniques ;
    
- des classes ;
    
- des tables SQL ;
    
- des API ;
    
- des composants React.
    

Ce document décrit exclusivement le métier.

---

# Critères d'acceptation

✓ Tous les concepts métier sont définis.

✓ Les relations sont explicites.

✓ Aucune dépendance technique.

✓ Tous les futurs développements utilisent ces objets.

---

# ❌ Erreurs d'implémentation interdites

- Confondre un objet métier avec une table SQL.
    
- Ajouter des propriétés techniques.
    
- Faire dépendre un objet d'un Engine.
    
- Mélanger métier et implémentation.
    
- Créer un nouvel objet sans mettre à jour ce document.