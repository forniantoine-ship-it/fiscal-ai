# FIELD-085 – Temps de calcul

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Temps de calcul".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

Le Temps de calcul correspond à la durée totale nécessaire au moteur Fiscal AI pour produire un résultat complet.

Cette durée est mesurée automatiquement entre le démarrage et la fin du calcul. Elle constitue un indicateur essentiel de performance, de supervision et d'audit.

---

# Entité

- Calcul
    

---

# Nom métier

Temps de calcul

---

# Nom technique

calculation_duration

---

# Type

Nombre décimal

---

# Format

Millisecondes

---

# Unité

ms

---

# Valeur obligatoire

Oui

---

# Valeur par défaut

Calculé automatiquement

---

# Source prioritaire

Calculation Engine

---

# Sources autorisées

- Calculation Engine
    

---

# Moteurs concernés

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

Aucune Rule fiscale.

---

# Validation

Le champ doit :

- être supérieur ou égal à 0 ;
    
- être calculé automatiquement ;
    
- correspondre au temps réel d'exécution.
    

---

# Dépendances

- FIELD-072 Date du calcul
    
- FIELD-073 Statut du calcul
    

---

# Questions associées

Aucune.

---

# Documents pouvant fournir cette donnée

Aucun.

Cette donnée est produite automatiquement.

---

# Utilisation

Ce champ est utilisé pour :

- mesurer les performances ;
    
- détecter les ralentissements ;
    
- optimiser le moteur de calcul ;
    
- alimenter les tableaux de supervision.
    

---

# Traçabilité

Pour chaque calcul, Fiscal AI conserve :

- la durée ;
    
- la date d'exécution ;
    
- la version du moteur ;
    
- les composants ayant participé au calcul.
    

---

# SQL

Nom de colonne : `calculation_duration`

Type SQL : BIGINT

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

Libellé : Temps de calcul

Placeholder : 438 ms

Aide : Durée totale du calcul.

Écran : Informations techniques

Ordre : 15

Composant : Texte en lecture seule

---

# Tests

Cas nominal

438 ms.

Cas limite

0 ms.

Cas d'erreur

Durée négative.

---

# Critères d'acceptation

✓ La durée est calculée automatiquement.

✓ Elle correspond au temps réel d'exécution.

✓ Elle est historisée.

✓ Elle est exploitable pour le monitoring.

---

# ❌ Erreurs d'implémentation interdites

- Autoriser une modification manuelle.
    
- Enregistrer une durée négative.
    
- Calculer une durée différente du temps réel.
    
- Perdre les données de performance.