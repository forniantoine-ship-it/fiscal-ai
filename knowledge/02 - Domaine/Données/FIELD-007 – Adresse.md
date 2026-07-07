# FIELD-007 – Adresse

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Adresse".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

L'adresse correspond à la localisation postale du bien immobilier.

Elle permet d'identifier précisément le bien et est utilisée pour les contrôles de cohérence, les formulaires fiscaux et certaines Rules.

---

# Entité

- Bien
    

---

# Nom métier

Adresse

---

# Nom technique

street_address

---

# Type

Texte

---

# Format

Chaîne de caractères

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
    
- Avis de taxe foncière
    
- Bail
    
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

Toutes les Rules nécessitant l'identification du bien.

---

# Validation

Le champ doit :

- être renseigné ;
    
- contenir une adresse postale valide ;
    
- être cohérent avec le code postal et la ville.
    

---

# Dépendances

- FIELD-009 Code postal
    
- FIELD-010 Ville
    
- FIELD-011 Pays
    

---

# Questions associées

Si la valeur est absente :

**"Quelle est l'adresse complète du bien ?"**

---

# Documents pouvant fournir cette donnée

- Acte authentique
    
- Bail
    
- Avis de taxe foncière
    

---

# Utilisation

Ce champ est utilisé pour :

- identifier le bien ;
    
- vérifier la cohérence des informations ;
    
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

Nom de colonne : `street_address`

Type SQL : VARCHAR(255)

Nullable : Non

Default : Aucun

Index : Non

Unique : Non

Contraintes : Longueur maximale 255 caractères.

---

# API

Lecture : Oui

Écriture : Oui

Visible utilisateur : Oui

Exportable : Oui

Filtrable : Oui

Triable : Non

---

# UI

Libellé : Adresse

Placeholder : Saisissez l'adresse complète

Aide : Adresse postale du bien immobilier.

Écran : Création du bien

Ordre : 1

Composant : Champ texte

---

# Tests

Cas nominal

Adresse complète valide.

Cas limite

Adresse très longue.

Cas d'erreur

Adresse vide.

---

# Critères d'acceptation

✓ L'adresse est renseignée.

✓ La provenance est connue.

✓ Toute modification est historisée.

✓ Le champ est cohérent avec le code postal et la ville.

---

# ❌ Erreurs d'implémentation interdites

- Accepter une adresse vide.
    
- Perdre la provenance.
    
- Modifier la valeur sans historisation.
    
- Utiliser une adresse incohérente avec la ville ou le code postal.