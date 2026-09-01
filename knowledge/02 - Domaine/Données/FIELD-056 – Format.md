# FIELD-056 – Format

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Format".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

Le Format correspond au type de fichier physique importé dans Fiscal AI.

Il permet au système de sélectionner les moteurs de traitement adaptés (OCR, extraction, prévisualisation, conversion) et de vérifier la compatibilité du document.

---

# Entité

- Document
    

---

# Nom métier

Format

---

# Nom technique

file_format

---

# Type

Énumération

---

# Format

Extension de fichier

---

# Unité

Aucune

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
    
- Preview Engine
    
- Validation Engine
    

---

# Features concernées

- F-003 Importer des documents
    
- F-004 Analyse documentaire
    

---

# Rules concernées

Toutes les Rules de validation des fichiers.

---

# Validation

Le champ doit :

- être détecté automatiquement ;
    
- appartenir à la liste des formats supportés ;
    
- être cohérent avec le fichier importé.
    

---

# Valeurs autorisées

- PDF
    
- JPG
    
- JPEG
    
- PNG
    
- TIFF
    
- HEIC
    
- DOCX
    
- XLSX
    
- CSV
    
- XML
    
- Autre
    

---

# Dépendances

Aucune.

---

# Questions associées

Aucune.

---

# Documents pouvant fournir cette donnée

Le fichier importé.

---

# Utilisation

Ce champ est utilisé pour :

- sélectionner le moteur de traitement ;
    
- vérifier la compatibilité ;
    
- afficher les informations techniques du document.
    

---

# Traçabilité

Pour chaque valeur, Fiscal AI conserve :

- le format détecté ;
    
- la date d'import ;
    
- le moteur ayant effectué la détection.
    

---

# SQL

Nom de colonne : `file_format`

Type SQL : VARCHAR(10)

Nullable : Non

Default : Détecté automatiquement

Index : Oui

Unique : Non

Contraintes : Format appartenant à la liste des formats supportés.

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

Libellé : Format

Placeholder : PDF

Aide : Format du fichier importé.

Écran : Détail du document

Ordre : 5

Composant : Badge

---

# Tests

Cas nominal

PDF.

Cas limite

HEIC.

Cas d'erreur

Format non supporté.

---

# Critères d'acceptation

✓ Le format est détecté automatiquement.

✓ Il est compatible avec le moteur de traitement.

✓ La détection est traçable.

✓ Toute incompatibilité est signalée.

---

# ❌ Erreurs d'implémentation interdites

- Permettre une modification manuelle.
    
- Détecter un format différent du fichier réel.
    
- Accepter un format non supporté sans avertissement.
    
- Perdre les informations techniques du fichier.