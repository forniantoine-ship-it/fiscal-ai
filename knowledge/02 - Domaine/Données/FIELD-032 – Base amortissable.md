# FIELD-032 – Base amortissable

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Base amortissable".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

La Base amortissable représente le montant total pouvant être amorti fiscalement.

Elle est déterminée automatiquement par Fiscal AI à partir du prix d'acquisition, de la ventilation terrain/bâti, des frais immobilisables et des Rules fiscales applicables.

Elle constitue la donnée d'entrée principale du calcul des amortissements.

---

# Entité

- Bien
    

---

# Nom métier

Base amortissable

---

# Nom technique

depreciable_base

---

# Type

Montant

---

# Format

Nombre décimal (EUR)

---

# Unité

Euro (€)

---

# Valeur obligatoire

Oui

---

# Valeur par défaut

Aucune

---

# Source prioritaire

Rule

---

# Sources autorisées

- Rule
    
- Calculation Engine
    

---

# Moteurs concernés

- Calculation Engine
    
- Validation Engine
    
- Explanation Engine
    

---

# Features concernées

- F-006 Calcul fiscal
    
- F-007 Génération de la déclaration
    

---

# Rules concernées

Toutes les Rules relatives :

- à la ventilation terrain / bâti ;
    
- aux frais immobilisables ;
    
- aux amortissements.
    

---

# Validation

Le champ doit :

- être supérieur ou égal à zéro ;
    
- être cohérent avec les valeurs du terrain, du bâti et des frais ;
    
- être calculé exclusivement par les Rules de Fiscal AI.
    

---

# Dépendances

- FIELD-002 Prix d'acquisition
    
- FIELD-003 Valeur du terrain
    
- FIELD-004 Valeur du bâti
    
- FIELD-006 Frais d'acquisition
    
- FIELD-031 Durée d'amortissement
    

---

# Questions associées

Aucune.

Cette valeur est entièrement calculée.

---

# Documents pouvant fournir cette donnée

Aucun.

Elle est produite par le Calculation Engine.

---

# Utilisation

Ce champ est utilisé pour :

- calculer les amortissements ;
    
- construire le plan d'amortissement ;
    
- alimenter les déclarations fiscales ;
    
- expliquer les calculs à l'utilisateur.
    

---

# Traçabilité

Pour chaque valeur, Fiscal AI conserve :

- la valeur calculée ;
    
- les FIELD utilisés ;
    
- les Rules appliquées ;
    
- la date du calcul ;
    
- le moteur ayant effectué le calcul.
    

---

# SQL

Nom de colonne : `depreciable_base`

Type SQL : DECIMAL(15,2)

Nullable : Non

Default : Aucun

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

Libellé : Base amortissable

Placeholder : —

Aide : Calculée automatiquement par Fiscal AI.

Écran : Fiscalité

Ordre : 26

Composant : Champ monétaire en lecture seule

---

# Tests

Cas nominal

Base calculée à partir des données du dossier.

Cas limite

Base égale à 0 €.

Cas d'erreur

Base supérieure au prix d'acquisition ou incohérente avec les Rules.

---

# Critères d'acceptation

✓ La base est calculée automatiquement.

✓ Toutes les Rules appliquées sont traçables.

✓ Les FIELD ayant participé au calcul sont identifiés.

✓ Toute modification est historisée.

---

# ❌ Erreurs d'implémentation interdites

- Permettre une saisie manuelle de la base amortissable.
    
- Calculer la base sans appliquer les Rules de ventilation.
    
- Perdre la traçabilité des calculs.
    
- Utiliser une base incohérente avec les données du dossier.