# FIELD-046 – Nombre d'anomalies

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Nombre d'anomalies".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

Le Nombre d'anomalies correspond au nombre total d'anomalies détectées dans le dossier.

Une anomalie est toute incohérence, information manquante, erreur de validation ou blocage empêchant Fiscal AI de produire un résultat fiable.

---

# Entité

- Dossier
    

---

# Nom métier

Nombre d'anomalies

---

# Nom technique

anomaly_count

---

# Type

Nombre entier

---

# Format

Entier positif

---

# Unité

Anomalie

---

# Valeur obligatoire

Oui

---

# Valeur par défaut

0

---

# Source prioritaire

Validation Engine

---

# Sources autorisées

- Validation Engine
    
- Workflow Engine
    
- Rule Engine
    

---

# Moteurs concernés

- Validation Engine
    
- Workflow Engine
    
- Explanation Engine
    

---

# Features concernées

- F-004 Analyse documentaire
    
- F-005 Compléter les informations
    
- F-006 Calcul fiscal
    
- Tableau de bord
    

---

# Rules concernées

Toutes les Rules de validation.

---

# Validation

Le champ doit :

- être supérieur ou égal à 0 ;
    
- être recalculé automatiquement après chaque validation.
    

---

# Dépendances

- Toutes les entités du dossier
    

---

# Questions associées

Aucune.

---

# Documents pouvant fournir cette donnée

Aucun.

Cette valeur est calculée automatiquement.

---

# Utilisation

Ce champ est utilisé pour :

- afficher la santé du dossier ;
    
- empêcher certains traitements tant que des anomalies critiques existent ;
    
- guider l'utilisateur vers les corrections à effectuer.
    

---

# Traçabilité

Pour chaque valeur, Fiscal AI conserve :

- le nombre d'anomalies ;
    
- la date du calcul ;
    
- les Rules ayant détecté les anomalies ;
    
- le moteur ayant effectué le contrôle.
    

---

# SQL

Nom de colonne : `anomaly_count`

Type SQL : INTEGER

Nullable : Non

Default : 0

Index : Non

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

Libellé : Anomalies

Placeholder : —

Aide : Nombre d'anomalies détectées dans le dossier.

Écran : Tableau de bord

Ordre : 14

Composant : Compteur avec indicateur d'alerte

---

# Tests

Cas nominal

3 anomalies détectées.

Cas limite

0 anomalie.

Cas d'erreur

Valeur négative.

---

# Critères d'acceptation

✓ Le compteur est exact.

✓ Il est recalculé automatiquement.

✓ Les anomalies sont traçables.

✓ Toute modification est historisée.

---

# ❌ Erreurs d'implémentation interdites

- Permettre une modification manuelle.
    
- Accepter une valeur négative.
    
- Ne pas recalculer après une validation.
    
- Afficher un compteur incohérent avec les anomalies réelles.