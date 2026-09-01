# FIELD-029 – Gestion locative

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Gestion locative".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

La Gestion locative indique le mode de gestion du bien immobilier.

Cette information permet d'identifier qui assure la gestion quotidienne du bien et d'appliquer certaines Rules relatives aux honoraires, aux documents attendus et aux contrôles de cohérence.

---

# Entité

- Bien
    

---

# Nom métier

Gestion locative

---

# Nom technique

property_management_type

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

Gestion personnelle

---

# Source prioritaire

Document

---

# Sources autorisées

- Mandat de gestion
    
- Bail
    
- Utilisateur
    

---

# Valeurs autorisées

- Gestion personnelle
    
- Agence immobilière
    
- Administrateur de biens
    
- Résidence de services
    
- Autre
    

---

# Moteurs concernés

- Classification Engine
    
- Validation Engine
    
- Question Engine
    
- Calculation Engine
    

---

# Features concernées

- F-002 Création du bien
    
- F-004 Analyse documentaire
    
- F-005 Compléter les informations
    
- F-006 Calcul fiscal
    

---

# Rules concernées

Toutes les Rules liées :

- aux frais de gestion ;
    
- aux honoraires ;
    
- aux justificatifs ;
    
- aux charges déductibles.
    

---

# Validation

Le champ doit :

- appartenir à la liste officielle ;
    
- être cohérent avec les documents du dossier.
    

---

# Dépendances

Aucune.

---

# Questions associées

Si la valeur est absente :

**"Qui assure la gestion locative du bien ?"**

---

# Documents pouvant fournir cette donnée

- Mandat de gestion
    
- Bail
    
- Contrat de gestion
    

---

# Utilisation

Ce champ est utilisé pour :

- appliquer certaines Rules fiscales ;
    
- identifier les justificatifs attendus ;
    
- contrôler la cohérence du dossier.
    

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

Nom de colonne : `property_management_type`

Type SQL : ENUM

Nullable : Non

Default : 'Gestion personnelle'

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

Libellé : Gestion locative

Placeholder : Sélectionnez un mode de gestion

Aide : Qui assure la gestion du bien ?

Écran : Exploitation

Ordre : 23

Composant : Liste déroulante

---

# Tests

Cas nominal

Gestion par une agence.

Cas limite

Résidence de services.

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