# FIELD-069 – Rules déclenchées

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Rules déclenchées".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

Les Rules déclenchées représentent l'ensemble des règles métier exécutées lors de l'analyse d'un document.

Chaque Rule appliquée est enregistrée afin de garantir la transparence des traitements, la reproductibilité des résultats et l'explicabilité des décisions prises par Fiscal AI.

---

# Entité

- Document
    

---

# Nom métier

Rules déclenchées

---

# Nom technique

triggered_rules

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
    
- Validation Engine
    
- Workflow Engine
    
- Explanation Engine
    

---

# Features concernées

- F-004 Analyse documentaire
    
- F-005 Compléter les informations
    
- F-006 Calcul fiscal
    

---

# Rules concernées

Toutes les Rules exécutées pendant le traitement du document.

---

# Validation

Chaque Rule enregistrée doit contenir :

- un identifiant unique ;
    
- un nom ;
    
- une version ;
    
- un statut d'exécution ;
    
- le résultat obtenu ;
    
- la date d'exécution.
    

---

# Dépendances

- FIELD-067 Champs extraits
    
- FIELD-068 Anomalies détectées
    

---

# Questions associées

Aucune.

---

# Documents pouvant fournir cette donnée

Tous les documents analysés.

---

# Utilisation

Ce champ est utilisé pour :

- expliquer les décisions prises ;
    
- assurer l'audit complet des traitements ;
    
- reproduire une analyse ;
    
- faciliter le débogage.
    

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

Nom de colonne : `triggered_rules`

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

Libellé : Rules déclenchées

Placeholder : —

Aide : Ensemble des règles exécutées pendant l'analyse.

Écran : Analyse documentaire

Ordre : 18

Composant : Tableau interactif

---

# Tests

Cas nominal

45 Rules exécutées.

Cas limite

Aucune Rule.

Cas d'erreur

Rule sans identifiant.

---

# Critères d'acceptation

✓ Chaque Rule est identifiée.

✓ La version de chaque Rule est conservée.

✓ Les résultats sont historisés.

✓ L'ordre d'exécution est conservé.

---

# ❌ Erreurs d'implémentation interdites

- Exécuter une Rule sans la journaliser.
    
- Perdre la version d'une Rule.
    
- Ne pas enregistrer le résultat.
    
- Supprimer l'historique des exécutions.