# FIELD-017 – Ascenseur

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Ascenseur".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

Le champ Ascenseur indique si le bien bénéficie d'un accès par ascenseur.

Cette information caractérise le bien et peut être utilisée pour des analyses, des contrôles de cohérence et de futures fonctionnalités.

---

# Entité

- Bien
    

---

# Nom métier

Ascenseur

---

# Nom technique

has_elevator

---

# Type

Booléen

---

# Format

Oui / Non

---

# Unité

Aucune

---

# Valeur obligatoire

Non

---

# Valeur par défaut

Non

---

# Source prioritaire

Document

---

# Sources autorisées

- Acte authentique
    
- DPE
    
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

---

# Validation

Le champ doit :

- prendre uniquement la valeur Oui ou Non ;
    
- être cohérent avec les documents fournis.
    

---

# Dépendances

- FIELD-012 Type de bien
    
- FIELD-016 Étage
    

---

# Questions associées

Si la valeur est absente :

**"Le bien est-il desservi par un ascenseur ?"**

---

# Documents pouvant fournir cette donnée

- Acte authentique
    
- DPE
    
- Annonce immobilière
    

---

# Utilisation

Ce champ est utilisé pour :

- caractériser le bien ;
    
- effectuer des contrôles de cohérence ;
    
- alimenter les futures analyses.
    

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

Nom de colonne : `has_elevator`

Type SQL : BOOLEAN

Nullable : Oui

Default : FALSE

Index : Non

Unique : Non

Contraintes : Aucune.

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

Libellé : Ascenseur

Placeholder : —

Aide : Le bien est-il desservi par un ascenseur ?

Écran : Création du bien

Ordre : 11

Composant : Interrupteur Oui / Non

---

# Tests

Cas nominal

Oui.

Cas limite

Information inconnue.

Cas d'erreur

Valeur différente de Oui / Non.

---

# Critères d'acceptation

✓ La valeur est booléenne.

✓ La provenance est connue.

✓ Toute modification est historisée.

---

# ❌ Erreurs d'implémentation interdites

- Accepter une valeur autre que Oui / Non.
    
- Perdre la provenance.
    
- Modifier la valeur sans historisation.
    
- Déduire automatiquement la présence d'un ascenseur sans justification.