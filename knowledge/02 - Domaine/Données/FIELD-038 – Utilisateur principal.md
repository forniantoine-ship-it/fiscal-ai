# FIELD-038 – Utilisateur principal

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Utilisateur principal".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

L'Utilisateur principal est le propriétaire du dossier Fiscal AI.

Il est responsable du dossier, pilote son avancement et constitue l'interlocuteur principal du système.

---

# Entité

- Dossier
    

---

# Nom métier

Utilisateur principal

---

# Nom technique

primary_user_id

---

# Type

Référence

---

# Format

UUID

---

# Unité

Aucune

---

# Valeur obligatoire

Oui

---

# Valeur par défaut

Utilisateur connecté

---

# Source prioritaire

Système

---

# Sources autorisées

- Authentification
    
- Workflow Engine
    

---

# Moteurs concernés

- Authentication Engine
    
- Workflow Engine
    
- Validation Engine
    

---

# Features concernées

- F-001 Création d'un dossier
    
- Toutes les Features du dossier
    

---

# Rules concernées

Toutes les Rules nécessitant l'identification du propriétaire du dossier.

---

# Validation

Le champ doit :

- référencer un utilisateur existant ;
    
- être unique pour le dossier ;
    
- être obligatoire.
    

---

# Dépendances

- ENT-004 Utilisateur
    

---

# Questions associées

Aucune.

L'utilisateur principal est déterminé lors de la création du dossier.

---

# Documents pouvant fournir cette donnée

Aucun.

---

# Utilisation

Ce champ est utilisé pour :

- attribuer la propriété du dossier ;
    
- gérer les autorisations ;
    
- envoyer les notifications ;
    
- assurer la traçabilité.
    

---

# Traçabilité

Pour chaque valeur, Fiscal AI conserve :

- l'identifiant de l'utilisateur ;
    
- la date d'attribution ;
    
- le moteur ayant réalisé l'affectation.
    

---

# SQL

Nom de colonne : `primary_user_id`

Type SQL : UUID

Nullable : Non

Default : Utilisateur authentifié

Index : Oui

Unique : Non

Contraintes : Clé étrangère vers ENT-004 Utilisateur.

---

# API

Lecture : Oui

Écriture : Non

Visible utilisateur : Oui

Exportable : Oui

Filtrable : Oui

Triable : Oui

---

# UI

Libellé : Utilisateur principal

Placeholder : —

Aide : Propriétaire principal du dossier.

Écran : Informations du dossier

Ordre : 6

Composant : Lecture seule

---

# Tests

Cas nominal

Utilisateur créé automatiquement.

Cas limite

Changement de propriétaire autorisé par une Rule.

Cas d'erreur

Référence vers un utilisateur inexistant.

---

# Critères d'acceptation

✓ Le dossier possède toujours un utilisateur principal.

✓ La relation est valide.

✓ Les modifications sont historisées.

✓ Les autorisations reposent sur cette référence.

---

# ❌ Erreurs d'implémentation interdites

- Référencer un utilisateur inexistant.
    
- Autoriser plusieurs utilisateurs principaux.
    
- Modifier la référence sans historisation.
    
- Utiliser un identifiant non unique.