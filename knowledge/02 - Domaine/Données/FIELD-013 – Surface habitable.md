# FIELD-013 – Surface habitable

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Surface habitable".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

La Surface habitable correspond à la surface du bien définie par la réglementation en vigueur.

Elle est utilisée pour identifier le bien, effectuer des contrôles de cohérence et alimenter certaines Rules fiscales et statistiques.

---

# Entité

- Bien
    

---

# Nom métier

Surface habitable

---

# Nom technique

living_area

---

# Type

Nombre décimal

---

# Format

m²

---

# Unité

Mètre carré (m²)

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
    
- Diagnostic immobilier
    
- Utilisateur
    

---

# Moteurs concernés

- OCR Engine
    
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

Toutes les Rules utilisant la surface du bien.

---

# Validation

Le champ doit :

- être supérieur à zéro ;
    
- être exprimé en m² ;
    
- être cohérent avec les documents fournis.
    

---

# Dépendances

- FIELD-014 Surface annexe
    
- FIELD-012 Type de bien
    

---

# Questions associées

Si la valeur est absente :

**"Quelle est la surface habitable du bien ?"**

---

# Documents pouvant fournir cette donnée

- Acte authentique
    
- DPE
    
- Plans
    
- Diagnostic immobilier
    

---

# Utilisation

Ce champ est utilisé pour :

- identifier les caractéristiques du bien ;
    
- contrôler la cohérence du dossier ;
    
- alimenter certaines Rules ;
    
- compléter les formulaires fiscaux.
    

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

Nom de colonne : `living_area`

Type SQL : DECIMAL(6,2)

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

Libellé : Surface habitable

Placeholder : 68,50

Aide : Surface habitable en mètres carrés.

Écran : Création du bien

Ordre : 7

Composant : Champ numérique

---

# Tests

Cas nominal

Surface de 68,50 m².

Cas limite

Surface de 9,00 m².

Cas d'erreur

Valeur négative, nulle ou non numérique.

---

# Critères d'acceptation

✓ La surface est supérieure à zéro.

✓ L'unité est le m².

✓ La provenance est connue.

✓ Toute modification est historisée.

---

# ❌ Erreurs d'implémentation interdites

- Accepter une valeur négative.
    
- Mélanger surface habitable et surface annexe.
    
- Perdre la provenance.
    
- Modifier la valeur sans historisation.