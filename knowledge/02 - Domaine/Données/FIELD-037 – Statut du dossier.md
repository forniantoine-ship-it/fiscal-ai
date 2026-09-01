# FIELD-037 – Statut du dossier

Version : 1.1

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Statut du dossier".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

**Note de version 1.1** : les valeurs autorisées ont été alignées sur [[STATE-001 – Cycle de vie d'un dossier]], seule source de vérité du cycle de vie du Dossier. La version 1.0 de ce champ utilisait une énumération à 8 valeurs, distincte à la fois de STATE-001 (13 états) et de l'ancien modèle d'ARCH-001 (9 états) — une troisième divergence, non détectée lors de la synchronisation initiale car ce document appartient au Data Dictionary, hors du périmètre alors vérifié.

---

# Description

Le Statut du dossier indique l'état d'avancement global du dossier fiscal.

Il permet au Workflow Engine de piloter les traitements et à l'utilisateur de connaître immédiatement l'état de son dossier.

---

# Entité

- Dossier
    

---

# Nom métier

Statut du dossier

---

# Nom technique

folder_status

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

Créé

---

# Source prioritaire

Workflow Engine

---

# Sources autorisées

- Workflow Engine
    
- Rule
    

---

# Valeurs autorisées

Identiques aux 13 états de [[STATE-001 – Cycle de vie d'un dossier]] :

- DOSSIER_CREE
    
- INFORMATIONS_GENERALES
    
- BIEN_EN_COURS
    
- BIEN_COMPLETE
    
- DOCUMENTS_EN_ATTENTE
    
- DOCUMENTS_IMPORTES
    
- ANALYSE_DOCUMENTAIRE
    
- INFORMATIONS_MANQUANTES
    
- DOSSIER_COMPLET
    
- CALCUL_EN_COURS
    
- CALCUL_TERMINE
    
- DECLARATION_GENEREE
    
- DOSSIER_TERMINE
    

---

# Moteurs concernés

- Workflow Engine
    
- Validation Engine
    
- Calculation Engine
    
- Explanation Engine
    

---

# Features concernées

Toutes les Features manipulant le dossier.

---

# Rules concernées

Toutes les Rules pilotant le workflow.

---

# Validation

Le champ doit :

- appartenir à la liste officielle ;
    
- respecter les transitions autorisées du Workflow Engine.
    

---

# Dépendances

- FIELD-044 Pourcentage de complétude
    
- FIELD-046 Nombre d'anomalies
    
- FIELD-047 Dernier calcul
    

---

# Questions associées

Aucune.

Le statut est piloté automatiquement.

---

# Documents pouvant fournir cette donnée

Aucun.

---

# Utilisation

Ce champ est utilisé pour :

- piloter le Workflow Engine ;
    
- afficher l'état du dossier ;
    
- déterminer les prochaines actions à effectuer.
    

---

# Traçabilité

Pour chaque changement, Fiscal AI conserve :

- l'ancien statut ;
    
- le nouveau statut ;
    
- la date ;
    
- le moteur ayant effectué la transition.
    

---

# SQL

Nom de colonne : `folder_status`

Type SQL : ENUM

Nullable : Non

Default : 'Créé'

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

Libellé : Statut du dossier

Placeholder : —

Aide : État actuel du traitement du dossier.

Écran : Tableau de bord

Ordre : 5

Composant : Badge de statut

---

# Tests

Cas nominal

Transition de "En cours" vers "Calcul terminé".

Cas limite

Retour à "Informations manquantes".

Cas d'erreur

Transition interdite.

---

# Critères d'acceptation

✓ Le statut est toujours cohérent avec le workflow.

✓ Les transitions sont historisées.

✓ Le statut est piloté automatiquement.

✓ Les transitions invalides sont refusées.

---

# ❌ Erreurs d'implémentation interdites

- Autoriser une saisie libre du statut.
    
- Effectuer une transition non prévue.
    
- Perdre l'historique des changements.
    
- Avoir un statut incohérent avec l'état réel du dossier.