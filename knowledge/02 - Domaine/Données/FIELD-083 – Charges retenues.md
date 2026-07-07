# FIELD-083 – Charges retenues

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Charges retenues".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

Les Charges retenues correspondent à l'ensemble des dépenses déductibles effectivement prises en compte par Fiscal AI lors du calcul fiscal.

Chaque charge est analysée, contrôlée, validée selon les Rules fiscales applicables, puis intégrée ou rejetée avec une justification explicite.

Cette donnée constitue l'une des composantes majeures du résultat fiscal.

---

# Entité

- Calcul
    

---

# Nom métier

Charges retenues

---

# Nom technique

allowed_expenses

---

# Type

Collection

---

# Format

Objet JSON

---

# Unité

Devise du dossier

---

# Valeur obligatoire

Oui

---

# Valeur par défaut

{}

---

# Source prioritaire

Calculation Engine

---

# Sources autorisées

- Calculation Engine
    

---

# Moteurs concernés

- Calculation Engine
    
- Rule Engine
    
- Validation Engine
    
- Explanation Engine
    

---

# Features concernées

- F-006 Calcul fiscal
    
- Génération de la déclaration
    
- Simulations fiscales
    

---

# Rules concernées

Toutes les Rules relatives à la déductibilité des charges.

---

# Validation

Chaque charge doit contenir :

- sa nature ;
    
- son montant déclaré ;
    
- son montant retenu ;
    
- son statut (acceptée, partiellement retenue, refusée) ;
    
- la Rule ayant conduit à cette décision.
    

---

# Dépendances

- ENT-003 Document
    
- ENT-009 Financement
    
- ENT-010 Travaux
    
- FIELD-077 Rules utilisées
    

---

# Questions associées

En cas d'information insuffisante :

**"Pouvez-vous préciser la nature de cette dépense ?"**

---

# Documents pouvant fournir cette donnée

- Factures
    
- Contrats
    
- Relevés bancaires
    
- Appels de fonds
    
- Justificatifs fiscaux
    

---

# Utilisation

Ce champ est utilisé pour :

- calculer le résultat fiscal ;
    
- justifier les déductions ;
    
- produire les annexes fiscales ;
    
- expliquer chaque décision prise par Fiscal AI.
    

---

# Contenu typique

Chaque charge contient notamment :

- catégorie ;
    
- montant déclaré ;
    
- montant retenu ;
    
- montant refusé ;
    
- justification ;
    
- Rule appliquée.
    

---

# Traçabilité

Pour chaque charge, Fiscal AI conserve :

- la valeur d'origine ;
    
- la décision prise ;
    
- la Rule appliquée ;
    
- la version du moteur ;
    
- la date du calcul.
    

---

# SQL

Nom de colonne : `allowed_expenses`

Type SQL : JSONB

Nullable : Non

Default : {}

Index : Oui (GIN)

Unique : Non

Contraintes : Structure JSON conforme au schéma officiel.

---

# API

Lecture : Oui

Écriture : Non

Visible utilisateur : Oui

Exportable : Oui

Filtrable : Oui

Triable : Non

---

# UI

Libellé : Charges retenues

Placeholder : —

Aide : Ensemble des charges prises en compte dans le calcul fiscal.

Écran : Détail du calcul > Charges

Ordre : 13

Composant : Tableau détaillé avec filtres

---

# Tests

Cas nominal

Toutes les charges sont correctement retenues.

Cas limite

Aucune charge déductible.

Cas d'erreur

Charge retenue sans justificatif.

---

# Critères d'acceptation

✓ Chaque charge est justifiée.

✓ Chaque décision est reliée à une Rule.

✓ Les montants retenus sont cohérents.

✓ Les calculs sont entièrement reproductibles.

---

# ❌ Erreurs d'implémentation interdites

- Retenir une charge sans justificatif.
    
- Retenir une charge sans Rule.
    
- Modifier une charge manuellement après calcul.
    
- Perdre la justification d'une décision.