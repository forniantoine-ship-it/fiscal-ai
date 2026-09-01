# FIELD-057 – Taille

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Taille".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

La Taille correspond au poids réel du fichier importé.

Elle permet de contrôler les limites d'import, d'optimiser le stockage et de surveiller les performances du système.

---

# Entité

- Document
    

---

# Nom métier

Taille

---

# Nom technique

file_size

---

# Type

Nombre entier

---

# Format

Octets

---

# Unité

Byte (B)

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
    
- Storage Engine
    
- Validation Engine
    

---

# Features concernées

- F-003 Importer des documents
    

---

# Rules concernées

Toutes les Rules de validation des imports.

---

# Validation

Le champ doit :

- être supérieur à 0 ;
    
- correspondre exactement au fichier importé.
    

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

- contrôler les limites d'import ;
    
- optimiser le stockage ;
    
- afficher les informations techniques.
    

---

# Traçabilité

Pour chaque valeur, Fiscal AI conserve :

- la taille ;
    
- la date d'import ;
    
- le moteur ayant effectué la mesure.
    

---

# SQL

Nom de colonne : `file_size`

Type SQL : BIGINT

Nullable : Non

Default : Détectée automatiquement

Index : Non

Unique : Non

Contraintes : Valeur > 0.

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

Libellé : Taille

Placeholder : 2,3 Mo

Aide : Taille du fichier importé.

Écran : Détail du document

Ordre : 6

Composant : Texte

---

# Tests

Cas nominal

2,3 Mo.

Cas limite

Fichier très volumineux.

Cas d'erreur

Taille égale à 0.

---

# Critères d'acceptation

✓ La taille correspond exactement au fichier.

✓ Elle est détectée automatiquement.

✓ La valeur est traçable.

✓ Toute anomalie est signalée.

---

# ❌ Erreurs d'implémentation interdites

- Permettre une modification manuelle.
    
- Enregistrer une taille différente de celle du fichier.
    
- Accepter une taille nulle.
    
- Perdre les métadonnées du fichier.