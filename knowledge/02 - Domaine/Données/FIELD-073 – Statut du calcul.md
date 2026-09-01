# FIELD-073 – Statut du calcul

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Statut du calcul".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

Le Statut du calcul indique l'état d'avancement de l'exécution du moteur de calcul.

Il permet au Workflow Engine, à l'utilisateur et aux autres moteurs de savoir immédiatement si un calcul est en attente, en cours, terminé ou s'il a échoué.

---

# Entité

- Calcul
    

---

# Nom métier

Statut du calcul

---

# Nom technique

calculation_status

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

En attente

---

# Source prioritaire

Calculation Engine

---

# Sources autorisées

- Calculation Engine
    
- Workflow Engine
    

---

# Moteurs concernés

- Calculation Engine
    
- Workflow Engine
    
- Validation Engine
    
- Explanation Engine
    

---

# Features concernées

- F-006 Calcul fiscal
    
- F-007 Génération de la déclaration
    

---

# Rules concernées

Toutes les Rules pilotant l'exécution des calculs.

---

# Validation

Le champ doit :

- appartenir à la liste officielle ;
    
- respecter les transitions autorisées ;
    
- être mis à jour automatiquement.
    

---

# Valeurs autorisées

- En attente
    
- En cours
    
- Terminé
    
- Terminé avec avertissements
    
- Échec
    
- Annulé
    

---

# Dépendances

- FIELD-071 Référence du calcul
    
- FIELD-072 Date du calcul
    

---

# Questions associées

Aucune.

---

# Documents pouvant fournir cette donnée

Aucun.

Cette donnée est produite automatiquement par le moteur de calcul.

---

# Utilisation

Ce champ est utilisé pour :

- afficher l'état du calcul ;
    
- piloter le Workflow Engine ;
    
- autoriser ou bloquer certaines actions ;
    
- informer l'utilisateur.
    

---

# Traçabilité

Pour chaque changement, Fiscal AI conserve :

- l'ancien statut ;
    
- le nouveau statut ;
    
- la date ;
    
- le moteur ayant effectué la transition.
    

---

# SQL

Nom de colonne : `calculation_status`

Type SQL : ENUM

Nullable : Non

Default : 'En attente'

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

Libellé : Statut du calcul

Placeholder : —

Aide : État actuel de l'exécution du calcul.

Écran : Détail du calcul

Ordre : 3

Composant : Badge avec code couleur

---

# Tests

Cas nominal

Calcul terminé.

Cas limite

Calcul terminé avec avertissements.

Cas d'erreur

Transition impossible (ex. : Échec → En cours sans relancer le calcul).

---

# Critères d'acceptation

✓ Le statut est mis à jour automatiquement.

✓ Les transitions sont historisées.

✓ Les valeurs appartiennent à l'énumération officielle.

✓ Le Workflow Engine utilise ce statut pour piloter les traitements.

---

# ❌ Erreurs d'implémentation interdites

- Autoriser une modification manuelle.
    
- Utiliser un statut non documenté.
    
- Perdre l'historique des transitions.
    
- Permettre une transition interdite.