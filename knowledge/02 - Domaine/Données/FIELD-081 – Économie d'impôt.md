# FIELD-081 – Économie d'impôt

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Économie d'impôt".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

L'Économie d'impôt correspond au montant d'impôt économisé grâce aux dispositifs fiscaux, aux amortissements, aux charges déductibles, aux crédits et aux réductions d'impôt pris en compte par Fiscal AI.

Elle est calculée par comparaison entre une situation de référence et la situation réellement calculée.

Cette donnée constitue l'un des principaux indicateurs de valeur de Fiscal AI.

---

# Entité

- Calcul
    

---

# Nom métier

Économie d'impôt

---

# Nom technique

tax_saving

---

# Type

Nombre décimal

---

# Format

Monétaire

---

# Unité

Devise du dossier (EUR par défaut)

---

# Valeur obligatoire

Oui

---

# Valeur par défaut

Calculée automatiquement

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
    
- Simulation Engine
    

---

# Features concernées

- F-006 Calcul fiscal
    
- Simulations fiscales
    
- Tableau de bord
    

---

# Rules concernées

Toutes les Rules ayant un impact sur l'économie d'impôt.

---

# Validation

Le champ doit :

- être calculé automatiquement ;
    
- être cohérent avec le scénario de référence ;
    
- être exprimé dans la devise du dossier.
    

---

# Dépendances

- FIELD-080 Impôt estimé
    
- FIELD-079 Résultat global
    
- FIELD-077 Rules utilisées
    

---

# Questions associées

Aucune.

---

# Documents pouvant fournir cette donnée

Aucun.

Cette donnée est calculée exclusivement par le Calculation Engine.

---

# Utilisation

Ce champ est utilisé pour :

- mesurer le gain fiscal ;
    
- comparer plusieurs stratégies ;
    
- produire les rapports de simulation ;
    
- expliquer l'intérêt des optimisations fiscales.
    

---

# Traçabilité

Pour chaque calcul, Fiscal AI conserve :

- le montant économisé ;
    
- le scénario de référence utilisé ;
    
- les Rules ayant produit cette économie ;
    
- la date du calcul ;
    
- la version du moteur.
    

---

# SQL

Nom de colonne : `tax_saving`

Type SQL : DECIMAL(15,2)

Nullable : Non

Default : Calculée automatiquement

Index : Oui

Unique : Non

Contraintes : Valeur ≥ 0 sauf cas particuliers explicitement documentés.

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

Libellé : Économie d'impôt

Placeholder : 4 280,50 €

Aide : Gain fiscal estimé obtenu grâce aux optimisations appliquées.

Écran : Résultats du calcul

Ordre : 11

Composant : Carte de résultat avec indicateur positif

---

# Tests

Cas nominal

Économie d'impôt de 4 280 €.

Cas limite

Aucune économie d'impôt.

Cas d'erreur

Économie supérieure à l'impôt de référence sans justification.

---

# Critères d'acceptation

✓ Le montant est calculé automatiquement.

✓ Il est cohérent avec le scénario de référence.

✓ Les éléments ayant généré cette économie sont traçables.

✓ Le résultat est reproductible.

---

# ❌ Erreurs d'implémentation interdites

- Autoriser une modification manuelle.
    
- Calculer une économie sans scénario de référence.
    
- Produire une économie incohérente avec les Rules exécutées.
    
- Perdre la traçabilité des éléments ayant conduit au résultat.