# FIELD-025 – Type de location

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Type de location".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

Le Type de location décrit le mode d'exploitation du bien immobilier.

Il détermine les Rules fiscales applicables et influence le traitement du dossier.

---

# Entité

- Bien
    

---

# Nom métier

Type de location

---

# Nom technique

rental_type

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

Aucune

---

# Source prioritaire

Document

---

# Sources autorisées

- Bail
    
- Bail commercial
    
- Contrat de gestion
    
- Utilisateur
    

---

# Valeurs autorisées

- LMNP longue durée
    
- LMNP saisonnier
    
- LMP
    
- Location nue
    
- Vacant
    
- Autre
    

---

# Moteurs concernés

- OCR Engine
    
- Classification Engine
    
- Validation Engine
    
- Question Engine
    
- Calculation Engine
    
- Explanation Engine
    

---

# Features concernées

- F-002 Création du bien
    
- F-004 Analyse documentaire
    
- F-005 Compléter les informations
    
- F-006 Calcul fiscal
    
- F-007 Génération de la déclaration
    

---

# Rules concernées

Toutes les Rules dépendant du mode d'exploitation du bien.

---

# Validation

Le champ doit :

- appartenir à la liste officielle ;
    
- être cohérent avec les documents importés.
    

---

# Dépendances

- FIELD-005 Date de mise en location
    

---

# Questions associées

Si la valeur est absente :

**"Quel est le type de location du bien ?"**

---

# Documents pouvant fournir cette donnée

- Bail
    
- Bail commercial
    
- Contrat de gestion
    

---

# Utilisation

Ce champ est utilisé pour :

- déterminer les Rules applicables ;
    
- contrôler la cohérence du dossier ;
    
- alimenter les calculs fiscaux.
    

---

# Traçabilité

Pour chaque valeur, Fiscal AI conserve :

- la valeur ;
    
- la source ;
    
- le document d'origine ;
    
- la date d'obtention ;
    
- le moteur ayant renseigné la donnée ;
    
- le niveau de confiance.
    

---

# SQL

Nom de colonne : `rental_type`

Type SQL : ENUM

Nullable : Non

Default : Aucun

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

Libellé : Type de location

Placeholder : Sélectionnez un type de location

Aide : Mode d'exploitation du bien.

Écran : Création du bien

Ordre : 19

Composant : Liste déroulante

---

# Tests

Cas nominal

LMNP longue durée.

Cas limite

Bien vacant.

Cas d'erreur

Valeur hors de l'énumération.

---

# Critères d'acceptation

✓ Une seule valeur est autorisée.

✓ La valeur est cohérente avec les documents.

✓ La provenance est connue.

✓ Toute modification est historisée.

---

# ❌ Erreurs d'implémentation interdites

- Accepter une valeur libre.
    
- Modifier l'énumération sans mettre à jour le Data Dictionary.
    
- Perdre la provenance.
    
- Utiliser une valeur non documentée.