# FIELD-088 – Nombre d'avertissements

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Nombre d'avertissements".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

Le Nombre d'avertissements correspond au nombre total d'avertissements non bloquants générés lors de l'exécution d'un calcul.

Contrairement aux erreurs, les avertissements n'empêchent pas Fiscal AI de produire un résultat, mais signalent une situation nécessitant une attention particulière, une vérification ou une optimisation.

---

# Entité

- Calcul
    

---

# Nom métier

Nombre d'avertissements

---

# Nom technique

warning_count

---

# Type

Nombre entier

---

# Format

Entier positif

---

# Unité

Avertissement

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
    
- Explanation Engine
    
- Audit Engine
    

---

# Features concernées

- F-006 Calcul fiscal
    
- Monitoring
    
- Audit
    

---

# Rules concernées

Toutes les Rules pouvant produire un avertissement.

---

# Validation

Le champ doit :

- être supérieur ou égal à 0 ;
    
- être calculé automatiquement ;
    
- être cohérent avec les avertissements enregistrés.
    

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

Cette donnée est produite automatiquement pendant le calcul.

---

# Utilisation

Ce champ est utilisé pour :

- informer l'utilisateur de points d'attention ;
    
- améliorer la qualité des données ;
    
- alimenter les tableaux de supervision ;
    
- faciliter les audits.
    

---

# Exemples d'avertissements

- Document de faible qualité OCR.
    
- Valeur estimée à partir d'une Rule.
    
- Information manquante remplacée par une hypothèse.
    
- Document ancien.
    
- Donnée incohérente mais non bloquante.
    

---

# Traçabilité

Pour chaque calcul, Fiscal AI conserve :

- le nombre d'avertissements ;
    
- leur liste détaillée ;
    
- les Rules concernées ;
    
- la date d'exécution ;
    
- la version du moteur.
    

---

# SQL

Nom de colonne : `warning_count`

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

Libellé : Avertissements

Placeholder : 2

Aide : Nombre d'avertissements générés pendant le calcul.

Écran : Informations techniques

Ordre : 18

Composant : Compteur avec indicateur orange

---

# Tests

Cas nominal

2 avertissements.

Cas limite

0 avertissement.

Cas d'erreur

Compteur différent du nombre réel d'avertissements.

---

# Critères d'acceptation

✓ Le compteur est calculé automatiquement.

✓ Il correspond exactement aux avertissements enregistrés.

✓ Les avertissements sont historisés.

✓ Le compteur est exploitable pour le monitoring et l'audit.

---

# ❌ Erreurs d'implémentation interdites

- Autoriser une modification manuelle.
    
- Afficher un compteur incohérent.
    
- Perdre les avertissements après le calcul.
    
- Confondre avertissements et erreurs bloquantes.