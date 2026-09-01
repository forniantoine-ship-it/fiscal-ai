# FIELD-018 – Parking

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Parking".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

Le champ Parking indique si le bien dispose d'un ou plusieurs emplacements de stationnement privatifs associés à la propriété.

Cette information caractérise le bien et peut avoir un impact sur sa valorisation, son exploitation et certaines analyses.

---

# Entité

- Bien
    

---

# Nom métier

Parking

---

# Nom technique

has_parking

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
    
- État descriptif de division
    
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

Aucune.

---

# Questions associées

Si la valeur est absente :

**"Le bien dispose-t-il d'un parking privatif ?"**

---

# Documents pouvant fournir cette donnée

- Acte authentique
    
- État descriptif de division
    
- Annonce immobilière
    

---

# Utilisation

Ce champ est utilisé pour :

- caractériser le bien ;
    
- compléter les informations du dossier ;
    
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

Nom de colonne : `has_parking`

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

Libellé : Parking

Placeholder : —

Aide : Le bien dispose-t-il d'un emplacement de stationnement privatif ?

Écran : Création du bien

Ordre : 12

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
    
- Déduire automatiquement la présence d'un parking sans justification.