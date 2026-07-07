# FIELD-031 – Durée d'amortissement

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Durée d'amortissement".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

La Durée d'amortissement correspond à la durée retenue pour amortir un actif conformément aux Rules fiscales et comptables applicables.

Cette durée est utilisée pour calculer le plan d'amortissement et ne résulte pas d'une simple saisie utilisateur. Elle est déterminée par les Rules de Fiscal AI selon la nature de l'actif.

---

# Entité

- Bien
    

---

# Nom métier

Durée d'amortissement

---

# Nom technique

depreciation_period

---

# Type

Nombre entier

---

# Format

Années

---

# Unité

Année

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
    
- Paramétrage Fiscal AI
    
- Validation utilisateur (si autorisée)
    

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

Toutes les Rules relatives aux amortissements.

---

# Validation

Le champ doit :

- être un entier strictement positif ;
    
- être cohérent avec la nature de l'actif ;
    
- être conforme aux Rules fiscales applicables.
    

---

# Dépendances

- FIELD-012 Type de bien
    
- FIELD-024 État du bien
    
- ENT-010 Travaux
    
- ENT-011 Mobilier
    

---

# Questions associées

Aucune.

La durée est déterminée automatiquement par Fiscal AI.

---

# Documents pouvant fournir cette donnée

Aucun.

Cette donnée est calculée à partir des Rules.

---

# Utilisation

Ce champ est utilisé pour :

- calculer les amortissements ;
    
- construire le plan d'amortissement ;
    
- alimenter les déclarations fiscales.
    

---

# Traçabilité

Pour chaque valeur, Fiscal AI conserve :

- la durée retenue ;
    
- la Rule appliquée ;
    
- la date de calcul ;
    
- le moteur ayant produit la valeur.
    

---

# SQL

Nom de colonne : `depreciation_period`

Type SQL : SMALLINT

Nullable : Non

Default : Aucun

Index : Non

Unique : Non

Contraintes : Valeur > 0.

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

Libellé : Durée d'amortissement

Placeholder : —

Aide : Déterminée automatiquement selon les Rules fiscales.

Écran : Fiscalité

Ordre : 25

Composant : Champ en lecture seule

---

# Tests

Cas nominal

Durée déterminée automatiquement.

Cas limite

Changement de Rule.

Cas d'erreur

Durée incohérente avec la nature de l'actif.

---

# Critères d'acceptation

✓ La durée provient d'une Rule.

✓ Elle est traçable.

✓ Elle est cohérente avec l'actif concerné.

✓ Toute modification est historisée.

---

# ❌ Erreurs d'implémentation interdites

- Permettre une saisie libre par défaut.
    
- Utiliser une durée sans Rule associée.
    
- Modifier la valeur sans historisation.
    
- Calculer un amortissement sans durée valide.