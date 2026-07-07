# FIELD-060 – Date d'import

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Date d'import".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

La Date d'import correspond à la date et à l'heure exactes auxquelles le document a été importé dans Fiscal AI.

Elle constitue la référence temporelle officielle de l'entrée du document dans le système.

---

# Entité

- Document
    

---

# Nom métier

Date d'import

---

# Nom technique

imported_at

---

# Type

Date et heure

---

# Format

ISO 8601 (AAAA-MM-JJTHH:MM:SSZ)

---

# Unité

Date / Heure

---

# Valeur obligatoire

Oui

---

# Valeur par défaut

Date et heure système

---

# Source prioritaire

Document Engine

---

# Sources autorisées

- Document Engine
    

---

# Moteurs concernés

- Import Engine
    
- Audit Engine
    
- Workflow Engine
    

---

# Features concernées

- F-003 Importer des documents
    

---

# Rules concernées

Aucune Rule fiscale directe.

---

# Validation

Le champ doit :

- être généré automatiquement ;
    
- être immuable ;
    
- respecter le format ISO 8601.
    

---

# Dépendances

Aucune.

---

# Questions associées

Aucune.

---

# Documents pouvant fournir cette donnée

Aucun.

---

# Utilisation

Ce champ est utilisé pour :

- assurer la traçabilité des imports ;
    
- trier les documents ;
    
- alimenter les journaux d'audit.
    

---

# Traçabilité

Pour chaque valeur, Fiscal AI conserve :

- la date et l'heure d'import ;
    
- le moteur ayant effectué l'import.
    

---

# SQL

Nom de colonne : `imported_at`

Type SQL : TIMESTAMP

Nullable : Non

Default : CURRENT_TIMESTAMP

Index : Oui

Unique : Non

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

Libellé : Date d'import

Placeholder : —

Aide : Date et heure d'import du document.

Écran : Détail du document

Ordre : 9

Composant : Texte en lecture seule

---

# Tests

Cas nominal

Import réussi.

Cas limite

Imports simultanés.

Cas d'erreur

Date modifiée manuellement.

---

# Critères d'acceptation

✓ La date est générée automatiquement.

✓ Elle est immuable.

✓ Elle est disponible pour l'audit.

✓ Toute tentative de modification est refusée.

---

# ❌ Erreurs d'implémentation interdites

- Autoriser une modification manuelle.
    
- Utiliser une date différente de l'import réel.
    
- Perdre la traçabilité.
    
- Générer une date dans un format non ISO.