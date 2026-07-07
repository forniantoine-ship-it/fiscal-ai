# FIELD-059 – Hash

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Hash".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

Le Hash est l'empreinte cryptographique unique du fichier importé.

Il permet de garantir l'intégrité du document, de détecter les doublons et de vérifier qu'un fichier n'a pas été modifié après son import.

---

# Entité

- Document
    

---

# Nom métier

Hash

---

# Nom technique

file_hash

---

# Type

Texte

---

# Format

SHA-256

---

# Unité

Aucune

---

# Valeur obligatoire

Oui

---

# Valeur par défaut

Calculé automatiquement

---

# Source prioritaire

Document Engine

---

# Sources autorisées

- Document Engine
    

---

# Moteurs concernés

- Import Engine
    
- Validation Engine
    
- Security Engine
    

---

# Features concernées

- F-003 Importer des documents
    
- F-004 Analyse documentaire
    

---

# Rules concernées

Toutes les Rules liées à l'intégrité et à la détection des doublons.

---

# Validation

Le champ doit :

- être calculé automatiquement ;
    
- être unique pour un contenu donné ;
    
- être recalculable à tout moment.
    

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

- vérifier l'intégrité du document ;
    
- détecter les doublons ;
    
- garantir la traçabilité du fichier ;
    
- sécuriser les traitements.
    

---

# Traçabilité

Pour chaque valeur, Fiscal AI conserve :

- le hash calculé ;
    
- l'algorithme utilisé ;
    
- la date du calcul ;
    
- le moteur ayant effectué le calcul.
    

---

# SQL

Nom de colonne : `file_hash`

Type SQL : CHAR(64)

Nullable : Non

Default : Calculé automatiquement

Index : Oui

Unique : Oui

Contraintes : Hash SHA-256 valide.

---

# API

Lecture : Oui

Écriture : Non

Visible utilisateur : Non

Exportable : Oui

Filtrable : Oui

Triable : Non

---

# UI

Libellé : Hash

Placeholder : —

Aide : Empreinte cryptographique du document.

Écran : Informations techniques

Ordre : 8

Composant : Lecture seule

---

# Tests

Cas nominal

Hash SHA-256 calculé.

Cas limite

Deux fichiers identiques.

Cas d'erreur

Hash manquant ou invalide.

---

# Critères d'acceptation

✓ Le hash est calculé automatiquement.

✓ Deux fichiers identiques possèdent le même hash.

✓ Deux fichiers différents possèdent des hash différents.

✓ Toute vérification est traçable.

---

# ❌ Erreurs d'implémentation interdites

- Autoriser une modification manuelle.
    
- Utiliser un algorithme non documenté.
    
- Calculer un hash différent pour un même fichier.
    
- Perdre la traçabilité des contrôles d'intégrité.