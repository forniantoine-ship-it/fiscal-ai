# FIELD-034 – Référence du dossier

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Référence du dossier".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

La Référence du dossier est l'identifiant unique et immuable attribué par Fiscal AI à chaque dossier.

Contrairement au nom du dossier, elle n'est jamais modifiée et sert de référence technique et métier dans l'ensemble du système.

---

# Entité

- Dossier
    

---

# Nom métier

Référence du dossier

---

# Nom technique

folder_reference

---

# Type

Texte

---

# Format

UUID ou identifiant unique Fiscal AI

---

# Unité

Aucune

---

# Valeur obligatoire

Oui

---

# Valeur par défaut

Générée automatiquement

---

# Source prioritaire

Système

---

# Sources autorisées

- Système
    

---

# Moteurs concernés

- Workflow Engine
    
- Validation Engine
    

---

# Features concernées

- F-001 Création d'un dossier
    
- Toutes les Features utilisant un dossier
    

---

# Rules concernées

Aucune Rule fiscale directe.

---

# Validation

Le champ doit :

- être unique ;
    
- être généré automatiquement ;
    
- être immuable.
    

---

# Dépendances

Aucune.

---

# Questions associées

Aucune.

Cette valeur n'est jamais demandée à l'utilisateur.

---

# Documents pouvant fournir cette donnée

Aucun.

---

# Utilisation

Ce champ est utilisé pour :

- identifier un dossier de manière unique ;
    
- référencer le dossier dans les API ;
    
- établir les relations entre les entités ;
    
- assurer la traçabilité.
    

---

# Traçabilité

Pour chaque valeur, Fiscal AI conserve :

- la date de création ;
    
- le moteur ayant généré la référence.
    

---

# SQL

Nom de colonne : `folder_reference`

Type SQL : UUID

Nullable : Non

Default : Généré automatiquement

Index : Oui

Unique : Oui

Contraintes : Immuable.

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

Libellé : Référence

Placeholder : —

Aide : Identifiant unique du dossier.

Écran : Détail du dossier

Ordre : 2

Composant : Texte en lecture seule

---

# Tests

Cas nominal

Référence générée automatiquement.

Cas limite

Création simultanée de plusieurs dossiers.

Cas d'erreur

Référence dupliquée.

---

# Critères d'acceptation

✓ Chaque dossier possède une référence unique.

✓ La référence est immuable.

✓ Elle est utilisée dans toutes les relations techniques.

✓ Sa génération est entièrement automatique.

---

# ❌ Erreurs d'implémentation interdites

- Autoriser la modification de la référence.
    
- Générer deux références identiques.
    
- Utiliser le nom du dossier comme identifiant.
    
- Permettre une saisie manuelle de la référence.