# FIELD-044 – Pourcentage de complétude

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Pourcentage de complétude".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

Le Pourcentage de complétude représente le niveau d'avancement global du dossier.

Il est calculé automatiquement par Fiscal AI en fonction des informations renseignées, des documents analysés et des anomalies restantes.

---

# Entité

- Dossier
    

---

# Nom métier

Pourcentage de complétude

---

# Nom technique

completion_rate

---

# Type

Nombre décimal

---

# Format

Pourcentage

---

# Unité

%

---

# Valeur obligatoire

Oui

---

# Valeur par défaut

0 %

---

# Source prioritaire

Workflow Engine

---

# Sources autorisées

- Workflow Engine
    
- Validation Engine
    

---

# Moteurs concernés

- Workflow Engine
    
- Validation Engine
    
- Explanation Engine
    

---

# Features concernées

- F-005 Compléter les informations
    
- Tableau de bord
    

---

# Rules concernées

Toutes les Rules de complétude du dossier.

---

# Validation

Le champ doit :

- être compris entre 0 et 100 ;
    
- être calculé automatiquement ;
    
- être mis à jour à chaque modification du dossier.
    

---

# Dépendances

- Toutes les entités du dossier
    

---

# Questions associées

Aucune.

---

# Documents pouvant fournir cette donnée

Aucun.

Cette donnée est calculée.

---

# Utilisation

Ce champ est utilisé pour :

- afficher l'avancement du dossier ;
    
- guider l'utilisateur ;
    
- piloter le Workflow Engine.
    

---

# Traçabilité

Pour chaque valeur, Fiscal AI conserve :

- le pourcentage calculé ;
    
- la date du calcul ;
    
- les éléments pris en compte ;
    
- le moteur ayant effectué le calcul.
    

---

# SQL

Nom de colonne : `completion_rate`

Type SQL : DECIMAL(5,2)

Nullable : Non

Default : 0

Index : Non

Unique : Non

Contraintes : Valeur comprise entre 0 et 100.

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

Libellé : Complétude

Placeholder : —

Aide : Pourcentage d'avancement du dossier.

Écran : Tableau de bord

Ordre : 12

Composant : Barre de progression

---

# Tests

Cas nominal

Complétude de 78 %.

Cas limite

0 % et 100 %.

Cas d'erreur

Valeur inférieure à 0 % ou supérieure à 100 %.

---

# Critères d'acceptation

✓ Le pourcentage est toujours compris entre 0 et 100.

✓ Il est recalculé automatiquement.

✓ Le calcul est traçable.

✓ Toute modification est historisée.

---

# ❌ Erreurs d'implémentation interdites

- Permettre une modification manuelle.
    
- Dépasser 100 %.
    
- Utiliser un calcul non traçable.
    
- Ne pas recalculer après une modification du dossier.