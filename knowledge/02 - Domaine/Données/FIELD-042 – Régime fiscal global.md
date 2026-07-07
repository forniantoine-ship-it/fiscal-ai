# FIELD-042 – Régime fiscal global

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Régime fiscal global".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

Le Régime fiscal global correspond au régime fiscal retenu pour l'ensemble du dossier au titre de l'exercice fiscal concerné.

Il constitue la référence principale utilisée par Fiscal AI pour sélectionner les Rules, les calculs, les formulaires et les contrôles applicables.

---

# Entité

- Dossier
    

---

# Nom métier

Régime fiscal global

---

# Nom technique

global_tax_regime

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

Déterminée automatiquement

---

# Source prioritaire

Rule

---

# Sources autorisées

- Rule
    
- Utilisateur
    
- Paramètres du dossier
    

---

# Valeurs autorisées

- LMNP Micro-BIC
    
- LMNP Réel simplifié
    
- LMP
    
- SCI à l'IR
    
- SCI à l'IS
    
- Revenus fonciers
    
- Autre
    

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

Toutes les Rules dépendant du régime fiscal.

---

# Validation

Le champ doit :

- appartenir à la liste officielle ;
    
- être cohérent avec les biens du dossier ;
    
- être cohérent avec l'exercice fiscal.
    

---

# Dépendances

- FIELD-041 Exercice fiscal
    
- FIELD-030 Régime fiscal
    

---

# Questions associées

Si la détermination automatique échoue :

**"Quel régime fiscal souhaitez-vous appliquer à ce dossier ?"**

---

# Documents pouvant fournir cette donnée

- Déclaration fiscale
    
- Option fiscale
    
- Courrier de l'administration fiscale
    

---

# Utilisation

Ce champ est utilisé pour :

- sélectionner les Rules applicables ;
    
- déterminer les calculs ;
    
- générer les formulaires ;
    
- piloter le Workflow Engine.
    

---

# Traçabilité

Pour chaque valeur, Fiscal AI conserve :

- la valeur ;
    
- la Rule ayant permis sa détermination ;
    
- la date de calcul ;
    
- le moteur ayant produit la valeur.
    

---

# SQL

Nom de colonne : `global_tax_regime`

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

Libellé : Régime fiscal

Placeholder : Sélectionnez un régime fiscal

Aide : Régime fiscal appliqué à l'ensemble du dossier.

Écran : Paramètres du dossier

Ordre : 10

Composant : Liste déroulante

---

# Tests

Cas nominal

LMNP Réel simplifié.

Cas limite

Changement de régime.

Cas d'erreur

Valeur hors de l'énumération.

---

# Critères d'acceptation

✓ Une seule valeur est autorisée.

✓ Le régime est cohérent avec le dossier.

✓ La Rule de détermination est traçable.

✓ Toute modification est historisée.

---

# ❌ Erreurs d'implémentation interdites

- Accepter une valeur libre.
    
- Utiliser un régime incompatible avec le dossier.
    
- Modifier la valeur sans historisation.
    
- Appliquer les Rules d'un régime différent.