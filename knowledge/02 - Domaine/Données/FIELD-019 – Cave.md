# FIELD-019 – Cave

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Cave".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

Le champ Cave indique si le bien dispose d'une cave privative ou d'un local de stockage rattaché au lot principal.

Cette information permet de caractériser précisément le bien et pourra être utilisée dans de futures analyses patrimoniales.

---

# Entité

- Bien
    

---

# Nom métier

Cave

---

# Nom technique

has_cellar

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

**"Le bien dispose-t-il d'une cave privative ?"**

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

Nom de colonne : `has_cellar`

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

Libellé : Cave

Placeholder : —

Aide : Le bien dispose-t-il d'une cave privative ?

Écran : Création du bien

Ordre : 13

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
    
- Déduire automatiquement la présence d'une cave sans justification.