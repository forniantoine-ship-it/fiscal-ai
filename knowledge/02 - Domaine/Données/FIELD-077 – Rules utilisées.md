# FIELD-077 – Rules utilisées

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Rules utilisées".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

Les Rules utilisées correspondent à l'ensemble des règles métier, fiscales et techniques exécutées par le moteur de calcul pour produire le résultat final.

Cette liste constitue le véritable raisonnement de Fiscal AI. Elle permet de comprendre pourquoi un calcul aboutit à un résultat donné et garantit une explicabilité complète.

Chaque Rule est versionnée et historisée.

---

# Entité

- Calcul
    

---

# Nom métier

Rules utilisées

---

# Nom technique

applied_rules

---

# Type

Collection

---

# Format

Liste d'objets JSON

---

# Unité

Aucune

---

# Valeur obligatoire

Oui

---

# Valeur par défaut

Collection vide

---

# Source prioritaire

Rule Engine

---

# Sources autorisées

- Rule Engine
    

---

# Moteurs concernés

- Rule Engine
    
- Calculation Engine
    
- Explanation Engine
    
- Audit Engine
    

---

# Features concernées

- F-006 Calcul fiscal
    
- F-007 Génération de la déclaration
    

---

# Rules concernées

Toutes les Rules fiscales exécutées lors du calcul.

---

# Validation

Chaque Rule doit contenir :

- son identifiant ;
    
- son nom ;
    
- sa version ;
    
- son statut d'exécution ;
    
- son résultat ;
    
- son temps d'exécution.
    

---

# Dépendances

- FIELD-075 Exercice fiscal
    
- FIELD-076 Régime fiscal
    

---

# Questions associées

Aucune.

---

# Documents pouvant fournir cette donnée

Aucun.

Cette donnée est produite automatiquement par le Rule Engine.

---

# Utilisation

Ce champ est utilisé pour :

- expliquer chaque résultat fiscal ;
    
- reproduire un calcul ;
    
- auditer le moteur ;
    
- déboguer les calculs ;
    
- comparer deux exécutions.
    

---

# Traçabilité

Pour chaque Rule, Fiscal AI conserve :

- son identifiant ;
    
- sa version ;
    
- son résultat ;
    
- sa durée d'exécution ;
    
- le moteur ayant exécuté la Rule ;
    
- la date d'exécution.
    

---

# SQL

Nom de colonne : `applied_rules`

Type SQL : JSONB

Nullable : Non

Default : []

Index : Oui (GIN)

Unique : Non

Contraintes : Structure JSON conforme au schéma officiel.

---

# API

Lecture : Oui

Écriture : Non

Visible utilisateur : Oui

Exportable : Oui

Filtrable : Oui

Triable : Non

---

# UI

Libellé : Rules utilisées

Placeholder : —

Aide : Ensemble des règles ayant participé au calcul.

Écran : Explication du calcul

Ordre : 7

Composant : Tableau interactif

---

# Tests

Cas nominal

127 Rules exécutées.

Cas limite

Aucune Rule.

Cas d'erreur

Rule sans identifiant ou sans version.

---

# Critères d'acceptation

✓ Chaque Rule est identifiée.

✓ Chaque Rule possède une version.

✓ Les résultats sont historisés.

✓ Le raisonnement complet est reproductible.

---

# ❌ Erreurs d'implémentation interdites

- Exécuter une Rule sans l'enregistrer.
    
- Perdre la version d'une Rule.
    
- Ne pas enregistrer le résultat d'une Rule.
    
- Supprimer l'historique des Rules exécutées.