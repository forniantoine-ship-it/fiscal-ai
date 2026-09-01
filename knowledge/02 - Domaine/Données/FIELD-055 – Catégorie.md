# FIELD-055 – Catégorie

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Catégorie".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

La Catégorie regroupe les documents par famille métier.

Contrairement au **Type de document**, qui identifie précisément un document (ex. : Acte authentique), la Catégorie permet de classer les documents selon leur domaine fonctionnel.

---

# Entité

- Document
    

---

# Nom métier

Catégorie

---

# Nom technique

document_category

---

# Type

Énumération

---

# Format

Liste de valeurs

---

# Unité

Aucune

---

# Valeur obligatoire

Oui

---

# Valeur par défaut

Déterminée automatiquement

---

# Source prioritaire

Classification Engine

---

# Sources autorisées

- Classification Engine
    
- Utilisateur
    

---

# Moteurs concernés

- Classification Engine
    
- Workflow Engine
    
- Validation Engine
    

---

# Features concernées

- F-003 Importer des documents
    
- F-004 Analyse documentaire
    

---

# Rules concernées

Toutes les Rules utilisant des familles de documents.

---

# Validation

Le champ doit :

- appartenir à la liste officielle ;
    
- être cohérent avec le type de document.
    

---

# Valeurs autorisées

- Acquisition
    
- Financement
    
- Fiscalité
    
- Location
    
- Travaux
    
- Comptabilité
    
- Banque
    
- Identité
    
- Assurance
    
- Autre
    

---

# Dépendances

- FIELD-054 Type de document
    

---

# Questions associées

Aucune.

La catégorie est déterminée automatiquement.

---

# Documents pouvant fournir cette donnée

Le document lui-même.

---

# Utilisation

Ce champ est utilisé pour :

- organiser les documents ;
    
- filtrer les recherches ;
    
- piloter certaines Rules.
    

---

# Traçabilité

Pour chaque valeur, Fiscal AI conserve :

- la catégorie ;
    
- le score de confiance ;
    
- le moteur ayant effectué la classification ;
    
- la date de classification.
    

---

# SQL

Nom de colonne : `document_category`

Type SQL : ENUM

Nullable : Non

Default : Déterminée automatiquement

Index : Oui

Unique : Non

Contraintes : Valeur appartenant à l'énumération officielle.

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

Libellé : Catégorie

Placeholder : Acquisition

Aide : Famille métier du document.

Écran : Détail du document

Ordre : 4

Composant : Liste déroulante

---

# Tests

Cas nominal

Acte authentique → Acquisition.

Cas limite

Document appartenant à plusieurs familles.

Cas d'erreur

Catégorie inexistante.

---

# Critères d'acceptation

✓ La catégorie appartient à la liste officielle.

✓ Elle est cohérente avec le type de document.

✓ La classification est traçable.

✓ Toute modification est historisée.

---

# ❌ Erreurs d'implémentation interdites

- Accepter une catégorie libre.
    
- Utiliser une catégorie incohérente avec le type.
    
- Perdre la traçabilité.
    
- Modifier la catégorie sans historisation.