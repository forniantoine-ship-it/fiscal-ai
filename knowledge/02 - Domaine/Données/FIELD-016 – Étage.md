# FIELD-016 – Étage

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Étage".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

L'Étage correspond au niveau où est situé le bien dans un immeuble.

Cette information permet de caractériser le bien, d'effectuer des contrôles de cohérence et d'alimenter certaines analyses.

---

# Entité

- Bien
    

---

# Nom métier

Étage

---

# Nom technique

floor_level

---

# Type

Nombre entier

---

# Format

Entier

---

# Unité

Étage

---

# Valeur obligatoire

Non

---

# Valeur par défaut

Aucune

---

# Source prioritaire

Document

---

# Sources autorisées

- Acte authentique
    
- DPE
    
- Plans
    
- Annonce immobilière
    
- Utilisateur
    

---

# Moteurs concernés

- OCR Engine
    
- Classification Engine
    
- Validation Engine
    
- Question Engine
    

---

# Features concernées

- F-002 Création du bien
    
- F-004 Analyse documentaire
    
- F-005 Compléter les informations
    

---

# Rules concernées

Aucune Rule fiscale directe.

Utilisé pour caractériser le bien.

---

# Validation

Le champ doit :

- être un entier ;
    
- être cohérent avec le type de bien ;
    
- être cohérent avec les documents fournis.
    

Les valeurs négatives sont autorisées pour les sous-sols.

---

# Dépendances

- FIELD-012 Type de bien
    

---

# Questions associées

Si la valeur est absente :

**"À quel étage est situé le bien ?"**

---

# Documents pouvant fournir cette donnée

- Acte authentique
    
- DPE
    
- Plans
    
- Annonce immobilière
    

---

# Utilisation

Ce champ est utilisé pour :

- décrire le bien ;
    
- effectuer des contrôles de cohérence ;
    
- alimenter certaines analyses.
    

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

Nom de colonne : `floor_level`

Type SQL : SMALLINT

Nullable : Oui

Default : NULL

Index : Non

Unique : Non

Contraintes : Entier compris entre -10 et 200.

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

Libellé : Étage

Placeholder : 3

Aide : Indiquez l'étage où se situe le bien.

Écran : Création du bien

Ordre : 10

Composant : Champ numérique

---

# Tests

Cas nominal

Appartement au 3ᵉ étage.

Cas limite

Sous-sol (-1).

Cas d'erreur

Valeur non entière.

---

# Critères d'acceptation

✓ L'étage est cohérent avec le type de bien.

✓ Les sous-sols sont autorisés.

✓ La provenance est connue.

✓ Toute modification est historisée.

---

# ❌ Erreurs d'implémentation interdites

- Refuser les valeurs négatives correspondant à un sous-sol.
    
- Accepter une valeur décimale.
    
- Perdre la provenance.
    
- Modifier la valeur sans historisation.