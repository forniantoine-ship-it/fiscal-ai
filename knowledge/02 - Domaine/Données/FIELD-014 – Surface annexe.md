# FIELD-014 – Surface annexe

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Surface annexe".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

La Surface annexe correspond à la somme des surfaces non habitables associées au bien (balcon, terrasse, cave, garage, cellier, combles, etc.).

Elle est conservée séparément de la surface habitable afin d'éviter toute confusion dans les calculs et les analyses.

---

# Entité

- Bien
    

---

# Nom métier

Surface annexe

---

# Nom technique

ancillary_area

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

Non

---

# Valeur par défaut

0

---

# Source prioritaire

Document

---

# Sources autorisées

- Acte authentique
    
- Plans
    
- DPE
    
- Diagnostic immobilier
    
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

Toutes les Rules utilisant les surfaces annexes.

---

# Validation

Le champ doit :

- être supérieur ou égal à zéro ;
    
- être exprimé en m² ;
    
- être cohérent avec les documents fournis.
    

---

# Dépendances

- FIELD-013 Surface habitable
    

---

# Questions associées

Si la valeur est absente :

**"Le bien possède-t-il des surfaces annexes (balcon, terrasse, cave, garage...) ? Si oui, quelle est leur surface totale ?"**

---

# Documents pouvant fournir cette donnée

- Acte authentique
    
- Plans
    
- DPE
    
- Diagnostic immobilier
    

---

# Utilisation

Ce champ est utilisé pour :

- décrire précisément le bien ;
    
- contrôler la cohérence des surfaces ;
    
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

Nom de colonne : `ancillary_area`

Type SQL : DECIMAL(6,2)

Nullable : Oui

Default : 0

Index : Non

Unique : Non

Contraintes : Valeur ≥ 0.

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

Libellé : Surface annexe

Placeholder : 12,50

Aide : Surface totale des annexes en m².

Écran : Création du bien

Ordre : 8

Composant : Champ numérique

---

# Tests

Cas nominal

Surface annexe de 12,50 m².

Cas limite

0 m².

Cas d'erreur

Valeur négative.

---

# Critères d'acceptation

✓ La valeur est supérieure ou égale à zéro.

✓ Elle est distincte de la surface habitable.

✓ La provenance est connue.

✓ Toute modification est historisée.

---

# ❌ Erreurs d'implémentation interdites

- Additionner automatiquement cette surface à la surface habitable.
    
- Accepter une valeur négative.
    
- Perdre la provenance.
    
- Modifier la valeur sans historisation.