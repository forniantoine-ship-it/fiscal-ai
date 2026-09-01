# FIELD-040 – Nombre de propriétaires

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Nombre de propriétaires".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

Le Nombre de propriétaires correspond au nombre total de personnes détenant des droits de propriété sur le bien immobilier.

Cette donnée permet de contrôler la cohérence des quotes-parts, des déclarants et des calculs fiscaux.

---

# Entité

- Dossier
    

---

# Nom métier

Nombre de propriétaires

---

# Nom technique

owner_count

---

# Type

Nombre entier

---

# Format

Entier positif

---

# Unité

Propriétaire

---

# Valeur obligatoire

Oui

---

# Valeur par défaut

1

---

# Source prioritaire

Utilisateur

---

# Sources autorisées

- Acte authentique
    
- Utilisateur
    

---

# Moteurs concernés

- Validation Engine
    
- Workflow Engine
    
- Calculation Engine
    

---

# Features concernées

- F-001 Création d'un dossier
    
- F-005 Compléter les informations
    
- F-006 Calcul fiscal
    

---

# Rules concernées

Toutes les Rules impliquant la répartition des droits de propriété.

---

# Validation

Le champ doit :

- être un entier supérieur ou égal à 1 ;
    
- être cohérent avec les propriétaires enregistrés ;
    
- être cohérent avec les quotes-parts de détention.
    

---

# Dépendances

- FIELD-038 Utilisateur principal
    
- FIELD-039 Co-déclarant
    

---

# Questions associées

Si la valeur est absente :

**"Combien de propriétaires détiennent ce bien ?"**

---

# Documents pouvant fournir cette donnée

- Acte authentique
    
- Attestation notariale
    

---

# Utilisation

Ce champ est utilisé pour :

- contrôler la cohérence des quotes-parts ;
    
- appliquer certaines Rules fiscales ;
    
- vérifier la composition du dossier.
    

---

# Traçabilité

Pour chaque valeur, Fiscal AI conserve :

- la valeur ;
    
- la source ;
    
- le document d'origine ;
    
- la date de modification ;
    
- le moteur ayant validé la donnée.
    

---

# SQL

Nom de colonne : `owner_count`

Type SQL : SMALLINT

Nullable : Non

Default : 1

Index : Non

Unique : Non

Contraintes : Valeur ≥ 1.

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

Libellé : Nombre de propriétaires

Placeholder : 1

Aide : Nombre total de propriétaires du bien.

Écran : Informations du dossier

Ordre : 8

Composant : Champ numérique

---

# Tests

Cas nominal

1 propriétaire.

Cas limite

10 propriétaires.

Cas d'erreur

Valeur égale à 0 ou négative.

---

# Critères d'acceptation

✓ La valeur est supérieure ou égale à 1.

✓ Elle est cohérente avec les propriétaires enregistrés.

✓ La provenance est connue.

✓ Toute modification est historisée.

---

# ❌ Erreurs d'implémentation interdites

- Accepter une valeur inférieure à 1.
    
- Ne pas contrôler la cohérence avec les quotes-parts.
    
- Perdre la provenance.
    
- Modifier la valeur sans historisation.