# FIELD-047 – Dernier calcul

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Dernier calcul".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

Le Dernier calcul correspond à la date et à l'heure du dernier calcul fiscal exécuté avec succès sur le dossier.

Il permet de savoir immédiatement si les résultats affichés sont à jour.

---

# Entité

- Dossier
    

---

# Nom métier

Dernier calcul

---

# Nom technique

last_calculation_at

---

# Type

Date et heure

---

# Format

ISO 8601 (AAAA-MM-JJTHH:MM:SSZ)

---

# Unité

Date / Heure

---

# Valeur obligatoire

Non

---

# Valeur par défaut

NULL

---

# Source prioritaire

Calculation Engine

---

# Sources autorisées

- Calculation Engine
    

---

# Moteurs concernés

- Calculation Engine
    
- Workflow Engine
    
- Explanation Engine
    

---

# Features concernées

- F-006 Calcul fiscal
    
- F-007 Génération de la déclaration
    
- Tableau de bord
    

---

# Rules concernées

Toutes les Rules exécutées lors d'un calcul fiscal.

---

# Validation

Le champ doit :

- être généré automatiquement ;
    
- être mis à jour uniquement après un calcul réussi ;
    
- respecter le format ISO 8601.
    

---

# Dépendances

- ENT-007 Calcul
    

---

# Questions associées

Aucune.

---

# Documents pouvant fournir cette donnée

Aucun.

Cette valeur est générée automatiquement.

---

# Utilisation

Ce champ est utilisé pour :

- afficher la fraîcheur des résultats ;
    
- détecter la nécessité d'un nouveau calcul ;
    
- alimenter le tableau de bord.
    

---

# Traçabilité

Pour chaque valeur, Fiscal AI conserve :

- la date et l'heure ;
    
- le moteur ayant effectué le calcul ;
    
- l'identifiant du calcul.
    

---

# SQL

Nom de colonne : `last_calculation_at`

Type SQL : TIMESTAMP

Nullable : Oui

Default : NULL

Index : Oui

Unique : Non

Contraintes : Aucune.

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

Libellé : Dernier calcul

Placeholder : —

Aide : Date du dernier calcul fiscal réalisé.

Écran : Tableau de bord

Ordre : 15

Composant : Texte en lecture seule

---

# Tests

Cas nominal

Calcul effectué aujourd'hui.

Cas limite

Aucun calcul réalisé.

Cas d'erreur

Date mise à jour après un calcul échoué.

---

# Critères d'acceptation

✓ La date est mise à jour uniquement après un calcul réussi.

✓ La valeur est traçable.

✓ Elle correspond au dernier calcul exécuté.

✓ Toute modification est historisée.

---

# ❌ Erreurs d'implémentation interdites

- Mettre à jour la date après un calcul échoué.
    
- Autoriser une modification manuelle.
    
- Perdre la traçabilité.
    
- Utiliser une date différente du calcul réellement exécuté.