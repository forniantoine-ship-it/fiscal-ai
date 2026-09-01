# FIELD-024 – État du bien

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "État du bien".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

L'État du bien décrit l'état général du logement au moment de son acquisition ou de sa mise en exploitation.

Cette information permet de caractériser le bien, de justifier certains travaux et d'alimenter des Rules de cohérence.

---

# Entité

- Bien
    

---

# Nom métier

État du bien

---

# Nom technique

property_condition

---

# Type

Énumération

---

# Format

Liste de valeurs

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
    
- État des lieux
    
- Diagnostic immobilier
    
- Rapport d'expertise
    
- Utilisateur
    

---

# Valeurs autorisées

- Neuf
    
- Excellent état
    
- Bon état
    
- À rafraîchir
    
- À rénover
    
- À réhabiliter
    

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

Toutes les Rules liées aux travaux, à la cohérence du dossier et aux futures analyses.

---

# Validation

Le champ doit :

- appartenir à la liste officielle ;
    
- être cohérent avec les documents importés ;
    
- être cohérent avec les travaux déclarés.
    

---

# Dépendances

- ENT-010 Travaux
    

---

# Questions associées

Si la valeur est absente :

**"Dans quel état se trouvait le bien au moment de son acquisition ?"**

---

# Documents pouvant fournir cette donnée

- Acte authentique
    
- Diagnostic immobilier
    
- Rapport d'expertise
    
- État des lieux
    

---

# Utilisation

Ce champ est utilisé pour :

- caractériser le bien ;
    
- contrôler la cohérence avec les travaux ;
    
- alimenter certaines analyses ;
    
- préparer les futures Rules.
    

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

Nom de colonne : `property_condition`

Type SQL : ENUM

Nullable : Non

Default : Aucun

Index : Oui

Unique : Non

Contraintes : Valeur appartenant à l'énumération officielle.

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

Libellé : État du bien

Placeholder : Sélectionnez l'état du bien

Aide : État général du logement au moment de l'acquisition.

Écran : Création du bien

Ordre : 18

Composant : Liste déroulante

---

# Tests

Cas nominal

Bon état.

Cas limite

À réhabiliter.

Cas d'erreur

Valeur hors de l'énumération.

---

# Critères d'acceptation

✓ Une seule valeur est autorisée.

✓ La valeur est cohérente avec les documents et les travaux.

✓ La provenance est connue.

✓ Toute modification est historisée.

---

# ❌ Erreurs d'implémentation interdites

- Accepter une valeur libre.
    
- Modifier l'énumération sans mettre à jour le Data Dictionary.
    
- Perdre la provenance.
    
- Utiliser une valeur non documentée.