# FIELD-062 – Statut OCR

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Statut OCR".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

Le Statut OCR indique l'état d'avancement du traitement OCR du document.

Il permet de savoir immédiatement si le document est exploitable pour l'extraction des données ou si une intervention est nécessaire.

---

# Entité

- Document
    

---

# Nom métier

Statut OCR

---

# Nom technique

ocr_status

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

En attente

---

# Source prioritaire

OCR Engine

---

# Sources autorisées

- OCR Engine
    

---

# Moteurs concernés

- OCR Engine
    
- Workflow Engine
    
- Validation Engine
    

---

# Features concernées

- F-003 Importer des documents
    
- F-004 Analyse documentaire
    

---

# Rules concernées

Toutes les Rules dépendant de la disponibilité du texte OCR.

---

# Validation

Le champ doit :

- appartenir à la liste officielle ;
    
- être mis à jour automatiquement.
    

---

# Valeurs autorisées

- En attente
    
- En cours
    
- Terminé
    
- Échec
    
- Validation requise
    

---

# Dépendances

Aucune.

---

# Questions associées

Aucune.

---

# Documents pouvant fournir cette donnée

Aucun.

Cette donnée est produite par l'OCR Engine.

---

# Utilisation

Ce champ est utilisé pour :

- suivre l'avancement du traitement OCR ;
    
- déclencher les étapes suivantes du workflow ;
    
- identifier les documents nécessitant une intervention.
    

---

# Traçabilité

Pour chaque changement, Fiscal AI conserve :

- le statut ;
    
- la date ;
    
- le moteur ayant effectué la mise à jour.
    

---

# SQL

Nom de colonne : `ocr_status`

Type SQL : ENUM

Nullable : Non

Default : 'En attente'

Index : Oui

Unique : Non

Contraintes : Valeur appartenant à l'énumération officielle.

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

Libellé : Statut OCR

Placeholder : —

Aide : État du traitement OCR du document.

Écran : Détail du document

Ordre : 11

Composant : Badge

---

# Tests

Cas nominal

OCR terminé.

Cas limite

Validation requise.

Cas d'erreur

Statut inconnu.

---

# Critères d'acceptation

✓ Le statut est mis à jour automatiquement.

✓ Les transitions sont cohérentes.

✓ Les changements sont historisés.

✓ Le workflow utilise ce statut.

---

# ❌ Erreurs d'implémentation interdites

- Autoriser une modification manuelle.
    
- Utiliser un statut hors de l'énumération.
    
- Perdre l'historique des changements.
    
- Lancer l'extraction avant un OCR terminé.