# FIELD-061 – Source d'import

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Source d'import".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

La Source d'import indique par quel moyen le document a été ajouté dans Fiscal AI.

Cette information permet d'assurer la traçabilité complète des documents, d'adapter certains traitements et d'analyser les usages de la plateforme.

---

# Entité

- Document
    

---

# Nom métier

Source d'import

---

# Nom technique

import_source

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

Upload Web

---

# Source prioritaire

Import Engine

---

# Sources autorisées

- Import Engine
    

---

# Moteurs concernés

- Import Engine
    
- Workflow Engine
    
- Audit Engine
    

---

# Features concernées

- F-003 Importer des documents
    

---

# Rules concernées

Aucune Rule fiscale directe.

---

# Validation

Le champ doit :

- appartenir à la liste officielle ;
    
- être déterminé automatiquement lors de l'import.
    

---

# Valeurs autorisées

- Upload Web
    
- Application mobile
    
- Glisser-déposer
    
- API
    
- Email
    
- Import cloud
    
- Import automatique
    
- Autre
    

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
    
- produire des statistiques d'utilisation ;
    
- adapter certains traitements techniques.
    

---

# Traçabilité

Pour chaque valeur, Fiscal AI conserve :

- la source d'import ;
    
- la date d'import ;
    
- le moteur ayant effectué l'import.
    

---

# SQL

Nom de colonne : `import_source`

Type SQL : ENUM

Nullable : Non

Default : 'Upload Web'

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

Libellé : Source d'import

Placeholder : Upload Web

Aide : Origine du document importé.

Écran : Détail du document

Ordre : 10

Composant : Badge

---

# Tests

Cas nominal

Upload Web.

Cas limite

Import via API.

Cas d'erreur

Source non reconnue.

---

# Critères d'acceptation

✓ La source est détectée automatiquement.

✓ Elle appartient à la liste officielle.

✓ Elle est historisée.

✓ Elle est disponible pour les audits.

---

# ❌ Erreurs d'implémentation interdites

- Autoriser une modification manuelle.
    
- Utiliser une source non documentée.
    
- Perdre la traçabilité.
    
- Ne pas enregistrer l'origine réelle du document.