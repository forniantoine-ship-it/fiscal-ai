# FIELD-033 – Nom du dossier

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Nom du dossier".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

Le Nom du dossier est un libellé lisible permettant d'identifier facilement un dossier fiscal par l'utilisateur.

Il est destiné à l'affichage et à la recherche. Il n'a aucune valeur métier ou fiscale.

---

# Entité

- Dossier
    

---

# Nom métier

Nom du dossier

---

# Nom technique

folder_name

---

# Type

Texte

---

# Format

Chaîne de caractères

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
    
- Utilisateur
    

---

# Moteurs concernés

- Workflow Engine
    
- Validation Engine
    

---

# Features concernées

- F-001 Création d'un dossier
    
- F-005 Compléter les informations
    

---

# Rules concernées

Aucune Rule fiscale directe.

---

# Validation

Le champ doit :

- être renseigné ;
    
- contenir entre 3 et 150 caractères ;
    
- être unique pour un utilisateur (recommandé).
    

---

# Dépendances

Aucune.

---

# Questions associées

Aucune.

Le système génère un nom par défaut que l'utilisateur peut modifier.

---

# Documents pouvant fournir cette donnée

Aucun.

---

# Utilisation

Ce champ est utilisé pour :

- identifier un dossier dans l'interface ;
    
- faciliter la recherche ;
    
- améliorer l'organisation des dossiers.
    

---

# Traçabilité

Pour chaque valeur, Fiscal AI conserve :

- la valeur ;
    
- l'auteur de la modification ;
    
- la date de modification.
    

---

# SQL

Nom de colonne : `folder_name`

Type SQL : VARCHAR(150)

Nullable : Non

Default : Nom généré automatiquement

Index : Oui

Unique : Non

Contraintes : Longueur comprise entre 3 et 150 caractères.

---

# API

Lecture : Oui

Écriture : Oui

Visible utilisateur : Oui

Exportable : Oui

Filtrable : Oui

Triable : Oui

---

# UI

Libellé : Nom du dossier

Placeholder : LMNP Bordeaux - 2026

Aide : Nom permettant d'identifier facilement votre dossier.

Écran : Création du dossier

Ordre : 1

Composant : Champ texte

---

# Tests

Cas nominal

Nom personnalisé.

Cas limite

Nom généré automatiquement.

Cas d'erreur

Nom vide ou supérieur à 150 caractères.

---

# Critères d'acceptation

✓ Le dossier possède toujours un nom.

✓ Le nom est modifiable.

✓ Toutes les modifications sont historisées.

---

# ❌ Erreurs d'implémentation interdites

- Utiliser le nom comme identifiant technique.
    
- Empêcher sa modification.
    
- Accepter un nom vide.
    
- Perdre l'historique des modifications.