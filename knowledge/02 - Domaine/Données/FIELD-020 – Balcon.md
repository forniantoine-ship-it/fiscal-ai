# FIELD-020 – Balcon

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Balcon".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

Le champ Balcon indique si le bien dispose d'un balcon privatif rattaché au lot principal.

Cette information permet de caractériser le bien et pourra être utilisée dans de futures analyses patrimoniales et de valorisation.

---

# Entité

- Bien
    

---

# Nom métier

Balcon

---

# Nom technique

has_balcony

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

---

# Validation

Le champ doit :

- prendre uniquement la valeur Oui ou Non ;
    
- être cohérent avec les documents fournis.
    

---

# Dépendances

- FIELD-014 Surface annexe
    

---

# Questions associées

Si la valeur est absente :

**"Le bien dispose-t-il d'un balcon ?"**

---

# Documents pouvant fournir cette donnée

- Acte authentique
    
- Plans
    
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

Nom de colonne : `has_balcony`

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

Libellé : Balcon

Placeholder : —

Aide : Le bien dispose-t-il d'un balcon ?

Écran : Création du bien

Ordre : 14

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
    
- Déduire automatiquement la présence d'un balcon sans justification.