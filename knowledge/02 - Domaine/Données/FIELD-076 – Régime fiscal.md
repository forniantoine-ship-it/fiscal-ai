# FIELD-076 – Régime fiscal

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Régime fiscal".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

Le Régime fiscal correspond au régime d'imposition effectivement utilisé par le moteur pour réaliser ce calcul.

Cette valeur est figée au moment de l'exécution. Même si le régime du dossier est modifié ultérieurement, le calcul conserve le régime utilisé afin de garantir une parfaite reproductibilité.

---

# Entité

- Calcul
    

---

# Nom métier

Régime fiscal

---

# Nom technique

tax_regime

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

Régime du dossier

---

# Source prioritaire

ENT-002 Dossier

---

# Sources autorisées

- ENT-002 Dossier
    
- Rule Engine
    

---

# Moteurs concernés

- Calculation Engine
    
- Rule Engine
    
- Workflow Engine
    
- Explanation Engine
    

---

# Features concernées

- F-006 Calcul fiscal
    
- F-007 Génération de la déclaration
    

---

# Rules concernées

Toutes les Rules fiscales dépendant du régime d'imposition.

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

# Validation

Le champ doit :

- appartenir à l'énumération officielle ;
    
- être cohérent avec le dossier ;
    
- être figé après le lancement du calcul.
    

---

# Dépendances

- ENT-002 Dossier
    
- FIELD-042 Régime fiscal global
    

---

# Questions associées

Aucune.

Cette valeur est récupérée automatiquement.

---

# Documents pouvant fournir cette donnée

- Dossier Fiscal AI
    
- Paramètres fiscaux
    

---

# Utilisation

Ce champ est utilisé pour :

- charger les bonnes Rules fiscales ;
    
- sélectionner les calculs applicables ;
    
- expliquer les résultats ;
    
- reproduire un calcul.
    

---

# Traçabilité

Pour chaque calcul, Fiscal AI conserve :

- le régime utilisé ;
    
- la date du calcul ;
    
- les Rules chargées ;
    
- le moteur ayant exécuté le calcul.
    

---

# SQL

Nom de colonne : `tax_regime`

Type SQL : ENUM

Nullable : Non

Default : Régime du dossier

Index : Oui

Unique : Non

Contraintes : Valeur appartenant à l'énumération officielle.

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

Libellé : Régime fiscal

Placeholder : LMNP Réel simplifié

Aide : Régime fiscal utilisé pour ce calcul.

Écran : Détail du calcul

Ordre : 6

Composant : Badge en lecture seule

---

# Tests

Cas nominal

LMNP Réel simplifié.

Cas limite

Calcul après changement de régime du dossier.

Cas d'erreur

Régime absent ou incompatible.

---

# Critères d'acceptation

✓ Le régime est figé au moment du calcul.

✓ Il est cohérent avec le dossier.

✓ Il est historisé.

✓ Il permet de reproduire exactement le calcul.

---

# ❌ Erreurs d'implémentation interdites

- Modifier le régime après le calcul.
    
- Utiliser un régime différent de celui chargé par le moteur.
    
- Perdre la traçabilité.
    
- Exécuter un calcul sans régime fiscal.