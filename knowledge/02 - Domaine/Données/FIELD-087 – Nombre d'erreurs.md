# FIELD-087 – Nombre d'erreurs

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Nombre d'erreurs".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

Le Nombre d'erreurs correspond au nombre total d'erreurs bloquantes détectées pendant l'exécution d'un calcul.

Une erreur empêche le moteur Fiscal AI de produire un résultat totalement fiable ou de terminer normalement le calcul.

Ce champ constitue un indicateur majeur de qualité et permet d'orienter rapidement les actions correctives.

---

# Entité

- Calcul
    

---

# Nom métier

Nombre d'erreurs

---

# Nom technique

error_count

---

# Type

Nombre entier

---

# Format

Entier positif

---

# Unité

Erreur

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
    
- Rule Engine
    
- Calculation Engine
    

---

# Moteurs concernés

- Validation Engine
    
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

Toutes les Rules pouvant produire une erreur bloquante.

---

# Validation

Le champ doit :

- être supérieur ou égal à 0 ;
    
- être calculé automatiquement ;
    
- être cohérent avec les erreurs enregistrées.
    

---

# Dépendances

- FIELD-073 Statut du calcul
    
- FIELD-077 Rules utilisées
    

---

# Questions associées

Aucune.

---

# Documents pouvant fournir cette donnée

Aucun.

Cette donnée est générée automatiquement pendant l'exécution.

---

# Utilisation

Ce champ est utilisé pour :

- déterminer si un calcul est exploitable ;
    
- afficher les erreurs détectées ;
    
- alimenter les tableaux de supervision ;
    
- faciliter les audits.
    

---

# Traçabilité

Pour chaque calcul, Fiscal AI conserve :

- le nombre d'erreurs ;
    
- la liste détaillée des erreurs ;
    
- les Rules concernées ;
    
- la date d'exécution ;
    
- la version du moteur.
    

---

# SQL

Nom de colonne : `error_count`

Type SQL : INTEGER

Nullable : Non

Default : 0

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

Libellé : Erreurs

Placeholder : 0

Aide : Nombre d'erreurs détectées pendant le calcul.

Écran : Informations techniques

Ordre : 17

Composant : Compteur avec indicateur rouge

---

# Tests

Cas nominal

0 erreur.

Cas limite

15 erreurs.

Cas d'erreur

Compteur différent du nombre réel d'erreurs.

---

# Critères d'acceptation

✓ Le compteur est calculé automatiquement.

✓ Il correspond exactement aux erreurs enregistrées.

✓ Les erreurs sont historisées.

✓ Le compteur est exploitable pour le monitoring et l'audit.

---

# ❌ Erreurs d'implémentation interdites

- Autoriser une modification manuelle.
    
- Afficher un compteur incohérent.
    
- Perdre les erreurs après le calcul.
    
- Marquer un calcul comme réussi alors que des erreurs bloquantes existent.