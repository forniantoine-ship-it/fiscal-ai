# FIELD-043 – Centre des impôts

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Centre des impôts".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

Le Centre des impôts correspond au service de l'administration fiscale compétent pour le traitement du dossier fiscal.

Cette information permet de personnaliser certaines démarches, de compléter les formulaires et de préparer les futures interactions avec l'administration fiscale.

---

# Entité

- Dossier
    

---

# Nom métier

Centre des impôts

---

# Nom technique

tax_office

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

Non

---

# Valeur par défaut

Déterminée automatiquement lorsque possible

---

# Source prioritaire

Rule

---

# Sources autorisées

- Adresse fiscale
    
- Utilisateur
    
- Rule
    
- Administration fiscale
    

---

# Moteurs concernés

- Validation Engine
    
- Workflow Engine
    
- Explanation Engine
    

---

# Features concernées

- F-001 Création d'un dossier
    
- F-005 Compléter les informations
    
- F-007 Génération de la déclaration
    

---

# Rules concernées

Toutes les Rules nécessitant l'identification du service fiscal compétent.

---

# Validation

Le champ doit :

- correspondre à un centre des impôts existant ;
    
- être cohérent avec le pays fiscal et l'adresse fiscale.
    

---

# Dépendances

- FIELD-050 Pays fiscal
    
- Adresse fiscale de l'utilisateur
    

---

# Questions associées

Si la détermination automatique échoue :

**"Quel est votre centre des impôts ?"**

---

# Documents pouvant fournir cette donnée

- Avis d'imposition
    
- Courrier de l'administration fiscale
    

---

# Utilisation

Ce champ est utilisé pour :

- compléter certains formulaires ;
    
- préparer les échanges avec l'administration ;
    
- vérifier la cohérence du dossier.
    

---

# Traçabilité

Pour chaque valeur, Fiscal AI conserve :

- la valeur ;
    
- la source ;
    
- la date d'obtention ;
    
- le moteur ayant renseigné la donnée.
    

---

# SQL

Nom de colonne : `tax_office`

Type SQL : VARCHAR(150)

Nullable : Oui

Default : NULL

Index : Oui

Unique : Non

Contraintes : Aucune.

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

Libellé : Centre des impôts

Placeholder : Service des Impôts des Particuliers de Bordeaux

Aide : Service compétent pour votre dossier fiscal.

Écran : Paramètres du dossier

Ordre : 11

Composant : Champ texte avec autocomplétion

---

# Tests

Cas nominal

Centre des impôts déterminé automatiquement.

Cas limite

Centre renseigné manuellement.

Cas d'erreur

Centre inexistant.

---

# Critères d'acceptation

✓ Le centre est cohérent avec le dossier.

✓ La provenance est connue.

✓ Toute modification est historisée.

✓ La détermination automatique est privilégiée.

---

# ❌ Erreurs d'implémentation interdites

- Accepter un centre incohérent avec l'adresse fiscale.
    
- Perdre la provenance.
    
- Modifier la valeur sans historisation.
    
- Utiliser une valeur non valide.