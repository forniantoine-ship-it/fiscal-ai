# FIELD-052 – Référence du document

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Référence du document".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

La Référence du document est l'identifiant unique et immuable attribué automatiquement à chaque document importé dans Fiscal AI.

Elle permet de relier le document à toutes les analyses, extractions, calculs et journaux d'audit.

---

# Entité

- Document
    

---

# Nom métier

Référence du document

---

# Nom technique

document_reference

---

# Type

Texte

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

Générée automatiquement

---

# Source prioritaire

Document Engine

---

# Sources autorisées

- Document Engine
    

---

# Moteurs concernés

- Document Engine
    
- Workflow Engine
    
- Audit Engine
    

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

- être unique ;
    
- être généré automatiquement ;
    
- être immuable.
    

---

# Dépendances

Aucune.

---

# Questions associées

Aucune.

Cette valeur est générée automatiquement.

---

# Documents pouvant fournir cette donnée

Aucun.

---

# Utilisation

Ce champ est utilisé pour :

- identifier un document ;
    
- relier les analyses OCR ;
    
- relier les extractions IA ;
    
- assurer la traçabilité complète.
    

---

# Traçabilité

Pour chaque valeur, Fiscal AI conserve :

- la référence ;
    
- la date de génération ;
    
- le moteur ayant créé le document.
    

---

# SQL

Nom de colonne : `document_reference`

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

Libellé : Référence du document

Placeholder : —

Aide : Identifiant unique du document.

Écran : Détail du document

Ordre : 1

Composant : Texte en lecture seule

---

# Tests

Cas nominal

Référence générée automatiquement.

Cas limite

Import simultané de plusieurs documents.

Cas d'erreur

Référence dupliquée.

---

# Critères d'acceptation

✓ Chaque document possède une référence unique.

✓ La référence est immuable.

✓ Elle est utilisée dans toutes les relations techniques.

✓ Sa génération est entièrement automatique.

---

# ❌ Erreurs d'implémentation interdites

- Autoriser une modification manuelle.
    
- Générer deux références identiques.
    
- Utiliser le nom du fichier comme identifiant.
    
- Permettre une saisie utilisateur.