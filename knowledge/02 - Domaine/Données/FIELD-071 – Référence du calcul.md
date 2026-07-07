# FIELD-071 – Référence du calcul

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Référence du calcul".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

La Référence du calcul est l'identifiant unique attribué à chaque exécution du moteur de calcul.

Chaque lancement produit une nouvelle référence, permettant de retrouver précisément les données utilisées, les Rules exécutées, les résultats obtenus et les explications générées.

Cette référence garantit une traçabilité complète et permet de reproduire un calcul à l'identique.

---

# Entité

- Calcul

---

# Nom métier

Référence du calcul

---

# Nom technique

calculation_reference

---

# Type

Texte

---

# Format

UUID

---

# Unité

Aucune

---

# Valeur obligatoire

Oui

---

# Valeur par défaut

Générée automatiquement

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

- être unique ;
- être généré automatiquement ;
- être immuable.

---

# Dépendances

Aucune.

---

# Questions associées

Aucune.

---

# Documents pouvant fournir cette donnée

Aucun.

---

# Utilisation

Ce champ est utilisé pour :

- identifier un calcul ;
- retrouver les résultats ;
- reproduire un calcul ;
- assurer l'audit complet.

---

# Traçabilité

Pour chaque calcul, Fiscal AI conserve :

- la référence ;
- la date de création ;
- le moteur ayant exécuté le calcul.

---

# SQL

Nom de colonne : `calculation_reference`

Type SQL : UUID

Nullable : Non

Default : Généré automatiquement

Index : Oui

Unique : Oui

Contraintes : Immuable.

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

Libellé : Référence du calcul

Placeholder : —

Aide : Identifiant unique du calcul.

Écran : Détail du calcul

Ordre : 1

Composant : Texte en lecture seule

---

# Tests

Cas nominal

Référence générée automatiquement.

Cas limite

Calculs simultanés.

Cas d'erreur

Référence dupliquée.

---

# Critères d'acceptation

✓ Chaque calcul possède une référence unique.

✓ La référence est immuable.

✓ Elle est utilisée dans tout le système.

✓ Elle permet de reproduire exactement un calcul.

---

# ❌ Erreurs d'implémentation interdites

- Autoriser une modification manuelle.
- Générer deux références identiques.
- Réutiliser une référence existante.
- Utiliser un identifiant non unique.