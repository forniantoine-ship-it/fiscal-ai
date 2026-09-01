# FIELD-008 – Complément d'adresse

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Complément d'adresse".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

Le Complément d'adresse permet de préciser l'adresse principale du bien immobilier (bâtiment, résidence, escalier, étage, appartement, boîte aux lettres...).

Il complète l'adresse lorsque cela est nécessaire à l'identification précise du bien.

---

# Entité

- Bien
    

---

# Nom métier

Complément d'adresse

---

# Nom technique

address_complement

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
    
- Bail
    
- Avis de taxe foncière
    
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

Utilisé uniquement pour l'identification du bien.

---

# Validation

Le champ doit :

- être cohérent avec l'adresse principale ;
    
- ne pas dépasser la longueur maximale autorisée.
    

---

# Dépendances

- FIELD-007 Adresse
    

---

# Questions associées

Si la valeur est absente mais semble nécessaire :

**"Souhaitez-vous ajouter un complément d'adresse (bâtiment, appartement, étage…) ?"**

---

# Documents pouvant fournir cette donnée

- Acte authentique
    
- Bail
    
- Avis de taxe foncière
    

---

# Utilisation

Ce champ est utilisé pour :

- identifier précisément le bien ;
    
- compléter les formulaires ;
    
- améliorer la qualité des contrôles.
    

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

Nom de colonne : `address_complement`

Type SQL : VARCHAR(255)

Nullable : Oui

Default : NULL

Index : Non

Unique : Non

Contraintes : Longueur maximale 255 caractères.

---

# API

Lecture : Oui

Écriture : Oui

Visible utilisateur : Oui

Exportable : Oui

Filtrable : Non

Triable : Non

---

# UI

Libellé : Complément d'adresse

Placeholder : Appartement, bâtiment, résidence...

Aide : Facultatif.

Écran : Création du bien

Ordre : 2

Composant : Champ texte

---

# Tests

Cas nominal

Complément renseigné.

Cas limite

Complément très long.

Cas d'erreur

Caractères non autorisés.

---

# Critères d'acceptation

✓ Le champ est facultatif.

✓ La provenance est conservée.

✓ Toute modification est historisée.

---

# ❌ Erreurs d'implémentation interdites

- Rendre ce champ obligatoire.
    
- Utiliser le complément d'adresse à la place de l'adresse principale.
    
- Perdre la provenance.
    
- Dépasser la longueur maximale autorisée.