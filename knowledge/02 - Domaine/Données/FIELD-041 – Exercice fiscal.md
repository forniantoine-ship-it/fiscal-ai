# FIELD-041 – Exercice fiscal

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Exercice fiscal".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

L'Exercice fiscal correspond à la période fiscale concernée par le dossier.

Il détermine les règles fiscales applicables, les formulaires à générer, les échéances déclaratives et les calculs réalisés.

---

# Entité

- Dossier
    

---

# Nom métier

Exercice fiscal

---

# Nom technique

tax_year

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

Oui

---

# Valeur par défaut

Année en cours

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
    
- Calculation Engine
    
- Explanation Engine
    

---

# Features concernées

- F-001 Création d'un dossier
    
- F-006 Calcul fiscal
    
- F-007 Génération de la déclaration
    

---

# Rules concernées

Toutes les Rules fiscales dépendant de l'exercice concerné.

---

# Validation

Le champ doit :

- être une année valide ;
    
- correspondre à un exercice autorisé par Fiscal AI ;
    
- être cohérent avec les documents importés.
    

---

# Dépendances

- FIELD-030 Régime fiscal
    

---

# Questions associées

Si la valeur est absente :

**"Pour quel exercice fiscal souhaitez-vous réaliser votre déclaration ?"**

---

# Documents pouvant fournir cette donnée

- Déclaration fiscale
    
- Avis d'imposition
    

---

# Utilisation

Ce champ est utilisé pour :

- sélectionner les Rules applicables ;
    
- déterminer les formulaires fiscaux ;
    
- organiser les calculs par exercice.
    

---

# Traçabilité

Pour chaque valeur, Fiscal AI conserve :

- la valeur ;
    
- la date de modification ;
    
- l'auteur de la modification.
    

---

# SQL

Nom de colonne : `tax_year`

Type SQL : SMALLINT

Nullable : Non

Default : Année en cours

Index : Oui

Unique : Non

Contraintes : Valeur ≥ 2000.

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

Libellé : Exercice fiscal

Placeholder : 2026

Aide : Année concernée par la déclaration.

Écran : Paramètres du dossier

Ordre : 9

Composant : Liste déroulante / Champ numérique

---

# Tests

Cas nominal

Cas limite

Exercice antérieur.

Cas d'erreur

Année invalide.

---

# Critères d'acceptation

✓ L'exercice est valide.

✓ Il est cohérent avec les données du dossier.

✓ La provenance est connue.

✓ Toute modification est historisée.

---

# ❌ Erreurs d'implémentation interdites

- Accepter un exercice invalide.
    
- Modifier la valeur sans historisation.
    
- Perdre la provenance.
    
- Lancer un calcul sur un exercice non défini.