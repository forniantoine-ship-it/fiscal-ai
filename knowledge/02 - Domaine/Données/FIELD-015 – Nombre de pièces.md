# FIELD-015 – Nombre de pièces

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Nombre de pièces".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

Le Nombre de pièces correspond au nombre de pièces principales composant le bien immobilier.

Cette information permet de caractériser le bien, d'effectuer des contrôles de cohérence et d'alimenter certaines analyses.

---

# Entité

- Bien
    

---

# Nom métier

Nombre de pièces

---

# Nom technique

room_count

---

# Type

Nombre entier

---

# Format

Entier positif

---

# Unité

Pièce

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

Toutes les Rules utilisant les caractéristiques du bien.

---

# Validation

Le champ doit :

- être un entier supérieur à zéro ;
    
- être cohérent avec la surface habitable ;
    
- être cohérent avec les documents fournis.
    

---

# Dépendances

- FIELD-012 Type de bien
    
- FIELD-013 Surface habitable
    

---

# Questions associées

Si la valeur est absente :

**"Combien de pièces principales comporte le bien ?"**

---

# Documents pouvant fournir cette donnée

- Acte authentique
    
- DPE
    
- Plans
    
- Annonce immobilière
    

---

# Utilisation

Ce champ est utilisé pour :

- caractériser le bien ;
    
- contrôler la cohérence des informations ;
    
- alimenter certaines analyses et statistiques.
    

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

Nom de colonne : `room_count`

Type SQL : SMALLINT

Nullable : Non

Default : Aucun

Index : Non

Unique : Non

Contraintes : Valeur > 0.

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

Libellé : Nombre de pièces

Placeholder : 3

Aide : Nombre de pièces principales du logement.

Écran : Création du bien

Ordre : 9

Composant : Champ numérique

---

# Tests

Cas nominal

Appartement T3.

Cas limite

Studio (1 pièce).

Cas d'erreur

Valeur nulle, négative ou décimale.

---

# Critères d'acceptation

✓ Le nombre de pièces est un entier positif.

✓ Il est cohérent avec les autres caractéristiques du bien.

✓ La provenance est connue.

✓ Toute modification est historisée.

---

# ❌ Erreurs d'implémentation interdites

- Accepter une valeur décimale.
    
- Accepter une valeur négative ou nulle.
    
- Perdre la provenance.
    
- Modifier la valeur sans historisation.