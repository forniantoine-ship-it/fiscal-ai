# FIELD-054 – Type de document

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Type de document".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

Le Type de document identifie la nature métier du document importé.

Il est utilisé pour déclencher les bonnes Rules d'extraction, les contrôles de cohérence et les traitements spécifiques à chaque document.

---

# Entité

- Document
    

---

# Nom métier

Type de document

---

# Nom technique

document_type

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

À classifier

---

# Source prioritaire

Classification Engine

---

# Sources autorisées

- Classification Engine
    
- Utilisateur
    

---

# Moteurs concernés

- Classification Engine
    
- OCR Engine
    
- Validation Engine
    
- Workflow Engine
    

---

# Features concernées

- F-003 Importer des documents
    
- F-004 Analyse documentaire
    

---

# Rules concernées

Toutes les Rules dépendant du type de document.

---

# Validation

Le champ doit :

- appartenir à la liste officielle ;
    
- être cohérent avec le contenu du document.
    

---

# Valeurs autorisées

- Acte authentique
    
- Compromis de vente
    
- Bail
    
- Bail commercial
    
- Avis d'imposition
    
- Taxe foncière
    
- DPE
    
- Facture
    
- Tableau d'amortissement
    
- Relevé bancaire
    
- Contrat de prêt
    
- Devis
    
- Attestation
    
- Justificatif d'identité
    
- Autre
    

---

# Dépendances

Aucune.

---

# Questions associées

Si la classification est incertaine :

**"Quel est le type de ce document ?"**

---

# Documents pouvant fournir cette donnée

Le document lui-même.

---

# Utilisation

Ce champ est utilisé pour :

- sélectionner les moteurs d'extraction ;
    
- appliquer les bonnes Rules ;
    
- organiser les documents.
    

---

# Traçabilité

Pour chaque valeur, Fiscal AI conserve :

- la valeur ;
    
- le score de confiance ;
    
- le moteur ayant réalisé la classification ;
    
- la date de classification.
    

---

# SQL

Nom de colonne : `document_type`

Type SQL : ENUM

Nullable : Non

Default : 'À classifier'

Index : Oui

Unique : Non

Contraintes : Valeur appartenant à l'énumération officielle.

---

# API

Lecture : Oui

Écriture : Oui

Visible utilisateur : Oui

Exportable : Oui

Filtrable : Oui

Triable : Oui

---

# UI

Libellé : Type de document

Placeholder : Sélectionnez un type

Aide : Nature du document importé.

Écran : Détail du document

Ordre : 3

Composant : Liste déroulante

---

# Tests

Cas nominal

Acte authentique correctement identifié.

Cas limite

Document multifonction.

Cas d'erreur

Type absent de l'énumération.

---

# Critères d'acceptation

✓ Le type appartient à la liste officielle.

✓ Il est cohérent avec le contenu.

✓ La classification est traçable.

✓ Toute modification est historisée.

---

# ❌ Erreurs d'implémentation interdites

- Accepter une valeur libre.
    
- Perdre le score de confiance.
    
- Modifier la classification sans historisation.
    
- Utiliser un type inexistant.