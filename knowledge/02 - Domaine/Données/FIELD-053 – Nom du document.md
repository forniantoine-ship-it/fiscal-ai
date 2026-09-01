# FIELD-053 – Nom du document

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Nom du document".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

Le Nom du document correspond au libellé affiché à l'utilisateur pour identifier facilement un document.

Il peut être conservé tel qu'importé ou être renommé automatiquement par Fiscal AI afin d'améliorer la lisibilité.

Le nom n'est jamais utilisé comme identifiant technique.

---

# Entité

- Document
    

---

# Nom métier

Nom du document

---

# Nom technique

document_name

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

Nom du fichier importé

---

# Source prioritaire

Document Engine

---

# Sources autorisées

- Document Engine
    
- Utilisateur
    

---

# Moteurs concernés

- Document Engine
    
- Classification Engine
    
- Workflow Engine
    

---

# Features concernées

- F-003 Importer des documents
    
- F-004 Analyse documentaire
    

---

# Rules concernées

Aucune Rule fiscale directe.

---

# Validation

Le champ doit :

- être renseigné ;
    
- contenir entre 1 et 255 caractères ;
    
- être modifiable sans impacter les traitements.
    

---

# Dépendances

Aucune.

---

# Questions associées

Aucune.

---

# Documents pouvant fournir cette donnée

Le document importé.

---

# Utilisation

Ce champ est utilisé pour :

- afficher le document dans l'interface ;
    
- faciliter la recherche ;
    
- améliorer la lisibilité du dossier.
    

---

# Traçabilité

Pour chaque valeur, Fiscal AI conserve :

- le nom ;
    
- la date de modification ;
    
- l'auteur de la modification.
    

---

# SQL

Nom de colonne : `document_name`

Type SQL : VARCHAR(255)

Nullable : Non

Default : Nom du fichier importé

Index : Oui

Unique : Non

Contraintes : Longueur maximale 255 caractères.

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

Libellé : Nom du document

Placeholder : Acte authentique.pdf

Aide : Nom utilisé pour identifier le document.

Écran : Liste des documents

Ordre : 2

Composant : Champ texte

---

# Tests

Cas nominal

Nom du document affiché correctement.

Cas limite

Nom renommé par l'utilisateur.

Cas d'erreur

Nom vide.

---

# Critères d'acceptation

✓ Le document possède toujours un nom.

✓ Le nom est modifiable.

✓ Les modifications sont historisées.

✓ Le nom n'est jamais utilisé comme identifiant technique.

---

# ❌ Erreurs d'implémentation interdites

- Utiliser le nom comme clé primaire.
    
- Refuser le renommage.
    
- Accepter un nom vide.
    
- Perdre l'historique des modifications.