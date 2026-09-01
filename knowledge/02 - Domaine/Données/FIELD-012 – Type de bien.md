# FIELD-012 – Type de bien

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Type de bien".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

Le Type de bien identifie la nature du bien immobilier acquis.

Il est utilisé pour déterminer les Rules fiscales applicables, les contrôles de cohérence et certains calculs spécifiques.

---

# Entité

- Bien
    

---

# Nom métier

Type de bien

---

# Nom technique

property_type

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

- Acte authentique
    
- Compromis de vente
    
- Bail
    
- Utilisateur
    

---

# Valeurs autorisées

- Appartement
    
- Maison
    
- Immeuble
    
- Local commercial
    
- Résidence services
    
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

Toutes les Rules dépendant de la nature du bien.

---

# Validation

Le champ doit :

- être renseigné ;
    
- appartenir à la liste des valeurs autorisées ;
    
- être cohérent avec les documents importés.
    

---

# Dépendances

Aucune.

---

# Questions associées

Si la valeur est absente :

**"Quel est le type du bien immobilier ?"**

---

# Documents pouvant fournir cette donnée

- Acte authentique
    
- Compromis de vente
    
- Bail
    

---

# Utilisation

Ce champ est utilisé pour :

- appliquer les bonnes Rules ;
    
- contrôler la cohérence du dossier ;
    
- alimenter les formulaires fiscaux.
    

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

Nom de colonne : `property_type`

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

Libellé : Type de bien

Placeholder : Sélectionnez un type de bien

Aide : Nature du bien immobilier.

Écran : Création du bien

Ordre : 6

Composant : Liste déroulante

---

# Tests

Cas nominal

Appartement.

Cas limite

Résidence services.

Cas d'erreur

Valeur non autorisée.

---

# Critères d'acceptation

✓ Une seule valeur est sélectionnée.

✓ La valeur appartient à la liste officielle.

✓ La provenance est conservée.

✓ Toute modification est historisée.

---

# ❌ Erreurs d'implémentation interdites

- Accepter une valeur libre.
    
- Modifier la liste sans mise à jour du Data Dictionary.
    
- Perdre la provenance.
    
- Utiliser une valeur non documentée.