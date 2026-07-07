# FIELD-035 – Date de création

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Date de création".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

La Date de création correspond à la date et à l'heure de création du dossier dans Fiscal AI.

Elle est générée automatiquement par le système et permet d'assurer la traçabilité complète du dossier.

---

# Entité

- Dossier
    

---

# Nom métier

Date de création

---

# Nom technique

created_at

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

Système

---

# Sources autorisées

- Système
    

---

# Moteurs concernés

- Workflow Engine
    

---

# Features concernées

- F-001 Création d'un dossier
    

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

Cette donnée est générée automatiquement.

---

# Documents pouvant fournir cette donnée

Aucun.

---

# Utilisation

Ce champ est utilisé pour :

- assurer la traçabilité ;
    
- trier les dossiers ;
    
- alimenter les journaux d'audit.
    

---

# Traçabilité

Pour chaque valeur, Fiscal AI conserve :

- la date et l'heure exactes ;
    
- le moteur ayant créé le dossier.
    

---

# SQL

Nom de colonne : `created_at`

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

Libellé : Date de création

Placeholder : —

Aide : Date de création du dossier.

Écran : Détail du dossier

Ordre : 3

Composant : Texte en lecture seule

---

# Tests

Cas nominal

Date générée automatiquement.

Cas limite

Création simultanée de plusieurs dossiers.

Cas d'erreur

Modification de la date.

---

# Critères d'acceptation

✓ La date est générée automatiquement.

✓ Elle est immuable.

✓ Elle est historisée.

✓ Elle est disponible pour l'audit.

---

# ❌ Erreurs d'implémentation interdites

- Autoriser la modification de la date.
    
- Permettre une saisie utilisateur.
    
- Perdre la traçabilité.
    
- Utiliser un format différent de l'ISO 8601.