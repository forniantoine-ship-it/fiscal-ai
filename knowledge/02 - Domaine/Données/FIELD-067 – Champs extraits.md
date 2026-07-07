# FIELD-067 – Champs extraits

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Champs extraits".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

Les Champs extraits représentent l'ensemble des données métier identifiées automatiquement dans un document par les moteurs d'extraction de Fiscal AI.

Chaque champ extrait est associé à sa valeur, sa position dans le document, son niveau de confiance, sa provenance et son historique.

Ce champ constitue le lien entre un document brut et le Data Dictionary.

---

# Entité

- Document
    

---

# Nom métier

Champs extraits

---

# Nom technique

extracted_fields

---

# Type

Collection

---

# Format

Liste d'objets JSON

---

# Unité

Aucune

---

# Valeur obligatoire

Oui

---

# Valeur par défaut

Collection vide

---

# Source prioritaire

Extraction Engine

---

# Sources autorisées

- Extraction Engine
    

---

# Moteurs concernés

- OCR Engine
    
- Extraction Engine
    
- Validation Engine
    
- Explanation Engine
    

---

# Features concernées

- F-004 Analyse documentaire
    
- F-005 Compléter les informations
    
- F-006 Calcul fiscal
    

---

# Rules concernées

Toutes les Rules utilisant les données extraites des documents.

---

# Validation

Chaque champ extrait doit contenir :

- un FIELD du Data Dictionary ;
    
- une valeur ;
    
- un score de confiance ;
    
- une source ;
    
- une position dans le document ;
    
- un statut de validation.
    

---

# Dépendances

- FIELD-062 Statut OCR
    
- FIELD-063 Score de confiance OCR
    
- FIELD-064 Classification IA
    
- FIELD-065 Score de confiance IA
    

---

# Questions associées

Si un champ possède un faible niveau de confiance :

**"Pouvez-vous confirmer cette valeur ?"**

---

# Documents pouvant fournir cette donnée

Tous les documents analysés.

---

# Utilisation

Ce champ est utilisé pour :

- alimenter les entités métier ;
    
- déclencher les Rules ;
    
- calculer les déclarations ;
    
- expliquer les résultats.
    

---

# Traçabilité

Pour chaque champ extrait, Fiscal AI conserve :

- le FIELD concerné ;
    
- la valeur détectée ;
    
- le score de confiance ;
    
- la position dans le document ;
    
- le moteur ayant réalisé l'extraction ;
    
- la version du modèle ;
    
- la date d'extraction.
    

---

# SQL

Nom de colonne : `extracted_fields`

Type SQL : JSONB

Nullable : Non

Default : []

Index : Oui (GIN)

Unique : Non

Contraintes : Structure JSON conforme au schéma officiel.

---

# API

Lecture : Oui

Écriture : Non

Visible utilisateur : Oui

Exportable : Oui

Filtrable : Oui

Triable : Non

---

# UI

Libellé : Champs extraits

Placeholder : —

Aide : Ensemble des informations détectées automatiquement.

Écran : Analyse documentaire

Ordre : 16

Composant : Tableau interactif

---

# Tests

Cas nominal

25 champs extraits.

Cas limite

Aucun champ détecté.

Cas d'erreur

Structure JSON invalide.

---

# Critères d'acceptation

✓ Tous les champs sont reliés au Data Dictionary.

✓ Chaque valeur possède un score de confiance.

✓ La provenance est connue.

✓ Les extractions sont entièrement traçables.

---

# ❌ Erreurs d'implémentation interdites

- Stocker uniquement du texte brut.
    
- Perdre le lien avec les FIELD.
    
- Supprimer les scores de confiance.
    
- Ne pas historiser les extractions.