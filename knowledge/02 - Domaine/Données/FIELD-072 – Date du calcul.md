# FIELD-072 – Date du calcul

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Date du calcul".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

La Date du calcul correspond à la date et à l'heure exactes d'exécution du moteur de calcul.

Elle permet de savoir précisément quand les résultats ont été produits et constitue une information essentielle pour la traçabilité, les audits et la reproductibilité des calculs.

Chaque nouvelle exécution génère une nouvelle date.

---

# Entité

- Calcul
    

---

# Nom métier

Date du calcul

---

# Nom technique

calculation_date

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

Oui

---

# Valeur par défaut

Date et heure système

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
    
- Audit Engine
    

---

# Features concernées

- F-006 Calcul fiscal
    
- F-007 Génération de la déclaration
    

---

# Rules concernées

Aucune Rule fiscale directe.

---

# Validation

Le champ doit :

- être généré automatiquement ;
    
- être immuable une fois le calcul terminé ;
    
- respecter le format ISO 8601.
    

---

# Dépendances

- FIELD-071 Référence du calcul
    

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

- dater les résultats ;
    
- vérifier qu'un calcul est à jour ;
    
- comparer plusieurs calculs ;
    
- assurer la traçabilité complète.
    

---

# Traçabilité

Pour chaque calcul, Fiscal AI conserve :

- la date et l'heure ;
    
- le fuseau horaire ;
    
- le moteur ayant exécuté le calcul.
    

---

# SQL

Nom de colonne : `calculation_date`

Type SQL : TIMESTAMP

Nullable : Non

Default : CURRENT_TIMESTAMP

Index : Oui

Unique : Non

Contraintes : Immuable après validation.

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

Libellé : Date du calcul

Placeholder : —

Aide : Date et heure de la dernière exécution du calcul.

Écran : Détail du calcul

Ordre : 2

Composant : Texte en lecture seule

---

# Tests

Cas nominal

Calcul exécuté avec succès.

Cas limite

Calculs successifs espacés de quelques secondes.

Cas d'erreur

Date modifiée manuellement.

---

# Critères d'acceptation

✓ La date est générée automatiquement.

✓ Elle est exacte à la milliseconde si disponible.

✓ Elle est historisée.

✓ Elle permet d'ordonner chronologiquement les calculs.

---

# ❌ Erreurs d'implémentation interdites

- Autoriser une modification manuelle.
    
- Modifier la date après validation du calcul.
    
- Utiliser une date différente de l'exécution réelle.
    
- Perdre la traçabilité temporelle du calcul.