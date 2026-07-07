# FIELD-023 – Année de construction

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Année de construction".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

L'Année de construction correspond à l'année d'achèvement initial du bâtiment.

Cette information permet de caractériser le bien, d'effectuer des contrôles de cohérence et d'alimenter certaines Rules fiscales ou statistiques.

---

# Entité

- Bien
    

---

# Nom métier

Année de construction

---

# Nom technique

construction_year

---

# Type

Nombre entier

---

# Format

AAAA

---

# Unité

Année

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
    
- DPE
    
- Diagnostic immobilier
    
- Cadastre
    
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

Toutes les Rules nécessitant l'ancienneté du bâtiment.

---

# Validation

Le champ doit :

- être une année valide ;
    
- être inférieure ou égale à l'année en cours ;
    
- être cohérente avec les documents fournis.
    

---

# Dépendances

Aucune.

---

# Questions associées

Si la valeur est absente :

**"Connaissez-vous l'année de construction du bien ?"**

---

# Documents pouvant fournir cette donnée

- Acte authentique
    
- DPE
    
- Diagnostic immobilier
    
- Cadastre
    

---

# Utilisation

Ce champ est utilisé pour :

- caractériser le bien ;
    
- effectuer des contrôles de cohérence ;
    
- alimenter certaines analyses et Rules.
    

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

Nom de colonne : `construction_year`

Type SQL : SMALLINT

Nullable : Oui

Default : NULL

Index : Non

Unique : Non

Contraintes : Valeur comprise entre 1800 et l'année en cours.

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

Libellé : Année de construction

Placeholder : 1998

Aide : Année d'achèvement initial du bâtiment.

Écran : Création du bien

Ordre : 17

Composant : Champ numérique

---

# Tests

Cas nominal

Cas limite

Cas d'erreur

Année future ou invalide.

---

# Critères d'acceptation

✓ L'année est valide.

✓ La provenance est connue.

✓ Toute modification est historisée.

---

# ❌ Erreurs d'implémentation interdites

- Accepter une année future.
    
- Accepter un format différent de AAAA.
    
- Perdre la provenance.
    
- Modifier la valeur sans historisation.