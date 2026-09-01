# FIELD-039 – Co-déclarant

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Co-déclarant".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

Le Co-déclarant est une personne associée au dossier fiscal en complément de l'utilisateur principal.

Il intervient notamment dans le cadre d'une déclaration commune, d'une indivision ou d'une propriété détenue à plusieurs.

---

# Entité

- Dossier
    

---

# Nom métier

Co-déclarant

---

# Nom technique

co_taxpayer_id

---

# Type

Référence

---

# Format

UUID

---

# Unité

Aucune

---

# Valeur obligatoire

Non

---

# Valeur par défaut

NULL

---

# Source prioritaire

Utilisateur

---

# Sources autorisées

- Utilisateur
    
- Workflow Engine
    

---

# Moteurs concernés

- Workflow Engine
    
- Validation Engine
    

---

# Features concernées

- F-001 Création d'un dossier
    
- F-005 Compléter les informations
    

---

# Rules concernées

Toutes les Rules nécessitant la connaissance des déclarants.

---

# Validation

Le champ doit :

- référencer un utilisateur existant ;
    
- être différent de l'utilisateur principal ;
    
- être cohérent avec le mode de détention du bien.
    

---

# Dépendances

- FIELD-038 Utilisateur principal
    
- ENT-004 Utilisateur
    

---

# Questions associées

Si nécessaire :

**"Le dossier comporte-t-il un co-déclarant ?"**

---

# Documents pouvant fournir cette donnée

- Déclaration fiscale
    
- Utilisateur
    

---

# Utilisation

Ce champ est utilisé pour :

- identifier les déclarants du dossier ;
    
- appliquer certaines Rules fiscales ;
    
- gérer les droits d'accès.
    

---

# Traçabilité

Pour chaque valeur, Fiscal AI conserve :

- l'identifiant du co-déclarant ;
    
- la date d'ajout ;
    
- l'auteur de la modification.
    

---

# SQL

Nom de colonne : `co_taxpayer_id`

Type SQL : UUID

Nullable : Oui

Default : NULL

Index : Oui

Unique : Non

Contraintes : Clé étrangère vers ENT-004 Utilisateur.

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

Libellé : Co-déclarant

Placeholder : Sélectionnez un co-déclarant

Aide : Personne associée à la déclaration fiscale.

Écran : Informations du dossier

Ordre : 7

Composant : Sélecteur d'utilisateur

---

# Tests

Cas nominal

Co-déclarant renseigné.

Cas limite

Aucun co-déclarant.

Cas d'erreur

Même utilisateur que l'utilisateur principal.

---

# Critères d'acceptation

✓ Le co-déclarant est facultatif.

✓ Il est différent de l'utilisateur principal.

✓ La relation est valide.

✓ Toute modification est historisée.

---

# ❌ Erreurs d'implémentation interdites

- Autoriser le même utilisateur comme principal et co-déclarant.
    
- Référencer un utilisateur inexistant.
    
- Modifier la référence sans historisation.
    
- Perdre la traçabilité.