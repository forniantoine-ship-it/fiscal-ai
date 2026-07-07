# FIELD-045 – Nombre de documents

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Nombre de documents".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

Le Nombre de documents correspond au nombre total de documents rattachés au dossier.

Cette valeur est calculée automatiquement par Fiscal AI et permet de suivre la complétude documentaire du dossier.

---

# Entité

- Dossier
    

---

# Nom métier

Nombre de documents

---

# Nom technique

document_count

---

# Type

Nombre entier

---

# Format

Entier positif

---

# Unité

Document

---

# Valeur obligatoire

Oui

---

# Valeur par défaut

0

---

# Source prioritaire

Document Engine

---

# Sources autorisées

- ENT-003 Document
    
- Workflow Engine
    

---

# Moteurs concernés

- Document Engine
    
- Workflow Engine
    
- Validation Engine
    

---

# Features concernées

- F-003 Importer des documents
    
- F-004 Analyse documentaire
    
- Tableau de bord
    

---

# Rules concernées

Toutes les Rules nécessitant une vérification documentaire.

---

# Validation

Le champ doit :

- être supérieur ou égal à 0 ;
    
- être recalculé automatiquement à chaque ajout ou suppression de document.
    

---

# Dépendances

- ENT-003 Document
    

---

# Questions associées

Aucune.

---

# Documents pouvant fournir cette donnée

Aucun.

Cette valeur est calculée automatiquement.

---

# Utilisation

Ce champ est utilisé pour :

- afficher le nombre de documents du dossier ;
    
- mesurer la complétude documentaire ;
    
- piloter le Workflow Engine.
    

---

# Traçabilité

Pour chaque valeur, Fiscal AI conserve :

- le nombre calculé ;
    
- la date du calcul ;
    
- le moteur ayant effectué le calcul.
    

---

# SQL

Nom de colonne : `document_count`

Type SQL : INTEGER

Nullable : Non

Default : 0

Index : Non

Unique : Non

Contraintes : Valeur ≥ 0.

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

Libellé : Documents

Placeholder : —

Aide : Nombre total de documents importés.

Écran : Tableau de bord

Ordre : 13

Composant : Compteur

---

# Tests

Cas nominal

15 documents.

Cas limite

0 document.

Cas d'erreur

Valeur négative.

---

# Critères d'acceptation

✓ Le compteur est exact.

✓ Il est recalculé automatiquement.

✓ Il est cohérent avec ENT-003.

✓ Toute modification est historisée.

---

# ❌ Erreurs d'implémentation interdites

- Permettre une modification manuelle.
    
- Avoir un compteur différent du nombre réel de documents.
    
- Accepter une valeur négative.
    
- Ne pas mettre à jour le compteur après un ajout ou une suppression de document.