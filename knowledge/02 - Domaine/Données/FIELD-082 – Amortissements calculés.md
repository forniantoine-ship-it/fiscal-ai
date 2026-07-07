# FIELD-082 – Amortissements calculés

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Amortissements calculés".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

Les Amortissements calculés correspondent à l'ensemble des amortissements déterminés automatiquement par Fiscal AI pour un calcul donné.

Ils regroupent les amortissements du bien immobilier, des travaux, du mobilier et de tout autre actif amortissable, conformément aux règles fiscales applicables.

Chaque amortissement est détaillé afin d'assurer une parfaite transparence et une justification complète du résultat fiscal.

---

# Entité

- Calcul
    

---

# Nom métier

Amortissements calculés

---

# Nom technique

calculated_depreciation

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
    
- Explanation Engine
    
- Audit Engine
    

---

# Features concernées

- F-006 Calcul fiscal
    
- Simulations fiscales
    
- Génération de la déclaration
    

---

# Rules concernées

Toutes les Rules relatives aux amortissements.

---

# Validation

Les amortissements doivent :

- être calculés automatiquement ;
    
- respecter les durées d'amortissement définies ;
    
- être cohérents avec les immobilisations concernées.
    

---

# Dépendances

- ENT-001 Bien
    
- ENT-010 Travaux
    
- ENT-011 Mobilier
    
- FIELD-076 Régime fiscal
    
- FIELD-077 Rules utilisées
    

---

# Questions associées

Aucune.

---

# Documents pouvant fournir cette donnée

Aucun.

Cette donnée est produite exclusivement par le moteur de calcul.

---

# Utilisation

Ce champ est utilisé pour :

- calculer le résultat fiscal ;
    
- expliquer les amortissements retenus ;
    
- produire les tableaux d'amortissement ;
    
- générer les annexes fiscales.
    

---

# Contenu typique

Chaque élément contient notamment :

- l'immobilisation concernée ;
    
- la base amortissable ;
    
- la durée ;
    
- le taux ;
    
- le montant annuel ;
    
- le cumul ;
    
- la valeur nette comptable restante.
    

---

# Traçabilité

Pour chaque amortissement, Fiscal AI conserve :

- les données d'origine ;
    
- les Rules appliquées ;
    
- la méthode de calcul ;
    
- la version du moteur ;
    
- la date du calcul.
    

---

# SQL

Nom de colonne : `calculated_depreciation`

Type SQL : JSONB

Nullable : Non

Default : {}

Index : Oui (GIN)

Unique : Non

Contraintes : Structure conforme au schéma officiel.

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

Libellé : Amortissements calculés

Placeholder : —

Aide : Détail des amortissements retenus pour ce calcul.

Écran : Détail du calcul > Amortissements

Ordre : 12

Composant : Tableau détaillé avec sous-totaux

---

# Tests

Cas nominal

Amortissements du bien, des travaux et du mobilier correctement calculés.

Cas limite

Aucun amortissement applicable.

Cas d'erreur

Montant d'amortissement supérieur à la base amortissable.

---

# Critères d'acceptation

✓ Tous les amortissements sont calculés automatiquement.

✓ Chaque montant est justifiable.

✓ Les durées et taux appliqués sont traçables.

✓ Le résultat est reproductible.

---

# ❌ Erreurs d'implémentation interdites

- Autoriser une modification manuelle.
    
- Calculer un amortissement sans immobilisation associée.
    
- Dépasser la base amortissable.
    
- Perdre la traçabilité des méthodes de calcul.