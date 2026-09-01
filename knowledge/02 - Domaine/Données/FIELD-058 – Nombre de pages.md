# FIELD-058 – Nombre de pages

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Nombre de pages".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

Le Nombre de pages correspond au nombre total de pages contenues dans le document importé.

Cette information est utilisée pour le traitement OCR, le suivi de l'analyse documentaire et certains contrôles de cohérence.

---

# Entité

- Document
    

---

# Nom métier

Nombre de pages

---

# Nom technique

page_count

---

# Type

Nombre entier

---

# Format

Entier positif

---

# Unité

Page

---

# Valeur obligatoire

Oui

---

# Valeur par défaut

Détectée automatiquement

---

# Source prioritaire

Document Engine

---

# Sources autorisées

- Document Engine
    

---

# Moteurs concernés

- Import Engine
    
- OCR Engine
    
- Validation Engine
    

---

# Features concernées

- F-003 Importer des documents
    
- F-004 Analyse documentaire
    

---

# Rules concernées

Toutes les Rules liées au traitement des documents.

---

# Validation

Le champ doit :

- être supérieur ou égal à 1 ;
    
- correspondre exactement au nombre de pages du document.
    

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

- suivre la progression de l'OCR ;
    
- afficher les informations du document ;
    
- optimiser les traitements.
    

---

# Traçabilité

Pour chaque valeur, Fiscal AI conserve :

- le nombre de pages ;
    
- la date d'import ;
    
- le moteur ayant effectué la détection.
    

---

# SQL

Nom de colonne : `page_count`

Type SQL : INTEGER

Nullable : Non

Default : Détecté automatiquement

Index : Non

Unique : Non

Contraintes : Valeur ≥ 1.

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

Libellé : Nombre de pages

Placeholder : 12

Aide : Nombre total de pages du document.

Écran : Détail du document

Ordre : 7

Composant : Texte

---

# Tests

Cas nominal

12 pages.

Cas limite

1 page.

Cas d'erreur

0 page.

---

# Critères d'acceptation

✓ Le nombre de pages est exact.

✓ Il est détecté automatiquement.

✓ Il est cohérent avec le document.

✓ Toute anomalie est signalée.

---

# ❌ Erreurs d'implémentation interdites

- Permettre une modification manuelle.
    
- Enregistrer un nombre de pages incorrect.
    
- Accepter une valeur inférieure à 1.
    
- Perdre les métadonnées du document.