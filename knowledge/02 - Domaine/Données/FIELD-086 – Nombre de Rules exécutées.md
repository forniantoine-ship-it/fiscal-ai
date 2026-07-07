# FIELD-086 – Nombre de Rules exécutées

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Nombre de Rules exécutées".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

Le Nombre de Rules exécutées correspond au nombre total de Rules effectivement évaluées par le moteur de calcul lors d'une exécution.

Il inclut les Rules appliquées, ignorées, non applicables et celles ayant généré un avertissement ou une erreur. Cet indicateur permet de mesurer la complexité d'un calcul et de faciliter les audits ainsi que l'analyse des performances.

---

# Entité

- Calcul
    

---

# Nom métier

Nombre de Rules exécutées

---

# Nom technique

executed_rules_count

---

# Type

Nombre entier

---

# Format

Entier positif

---

# Unité

Rule

---

# Valeur obligatoire

Oui

---

# Valeur par défaut

Calculé automatiquement

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
    
- Monitoring Engine
    
- Audit Engine
    

---

# Features concernées

- F-006 Calcul fiscal
    
- Monitoring
    
- Audit
    

---

# Rules concernées

Toutes les Rules exécutées pendant le calcul.

---

# Validation

Le champ doit :

- être supérieur ou égal à 0 ;
    
- être calculé automatiquement ;
    
- correspondre au nombre réel de Rules exécutées.
    

---

# Dépendances

- FIELD-077 Rules utilisées
    

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

- mesurer la complexité d'un calcul ;
    
- analyser les performances ;
    
- comparer deux exécutions ;
    
- alimenter les tableaux de supervision.
    

---

# Traçabilité

Pour chaque calcul, Fiscal AI conserve :

- le nombre de Rules exécutées ;
    
- la liste des Rules concernées ;
    
- la date d'exécution ;
    
- la version du moteur.
    

---

# SQL

Nom de colonne : `executed_rules_count`

Type SQL : INTEGER

Nullable : Non

Default : Calculé automatiquement

Index : Oui

Unique : Non

Contraintes : Valeur ≥ 0.

---

# API

Lecture : Oui

Écriture : Non

Visible utilisateur : Oui

Exportable : Oui

Filtrable : Oui

Triable : Oui

---

# UI

Libellé : Rules exécutées

Placeholder : 127

Aide : Nombre total de Rules évaluées pendant le calcul.

Écran : Informations techniques

Ordre : 16

Composant : Compteur

---

# Tests

Cas nominal

127 Rules exécutées.

Cas limite

0 Rule.

Cas d'erreur

Nombre incohérent avec la liste des Rules utilisées.

---

# Critères d'acceptation

✓ Le nombre est calculé automatiquement.

✓ Il correspond à la liste des Rules exécutées.

✓ Il est historisé.

✓ Il est exploitable pour le monitoring et l'audit.

---

# ❌ Erreurs d'implémentation interdites

- Autoriser une modification manuelle.
    
- Afficher un nombre différent de la réalité.
    
- Ne pas mettre à jour le compteur après une exécution.
    
- Perdre la cohérence avec FIELD-077 Rules utilisées.