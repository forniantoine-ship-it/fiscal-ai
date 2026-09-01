# FIELD-080 – Impôt estimé

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Impôt estimé".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

L'Impôt estimé correspond au montant total de l'impôt calculé par Fiscal AI pour l'exercice fiscal concerné.

Il représente le résultat final de l'application des règles fiscales sur les revenus, les charges, les amortissements, les crédits et les réductions d'impôt disponibles.

Cette estimation constitue une aide à la décision et permet de simuler différents scénarios fiscaux.

---

# Entité

- Calcul
    

---

# Nom métier

Impôt estimé

---

# Nom technique

estimated_tax

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
    
- Export Engine
    

---

# Features concernées

- F-006 Calcul fiscal
    
- F-007 Génération de la déclaration
    
- Simulations fiscales
    

---

# Rules concernées

Toutes les Rules ayant un impact sur le montant de l'impôt.

---

# Validation

Le champ doit :

- être calculé automatiquement ;
    
- être cohérent avec les Rules appliquées ;
    
- être exprimé dans la devise du dossier.
    

---

# Dépendances

- FIELD-076 Régime fiscal
    
- FIELD-077 Rules utilisées
    
- FIELD-079 Résultat global
    

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

- afficher l'impôt estimé ;
    
- comparer plusieurs simulations ;
    
- alimenter les rapports fiscaux ;
    
- préparer la déclaration.
    

---

# Traçabilité

Pour chaque calcul, Fiscal AI conserve :

- le montant calculé ;
    
- les Rules utilisées ;
    
- la date du calcul ;
    
- la version du moteur.
    

---

# SQL

Nom de colonne : `estimated_tax`

Type SQL : DECIMAL(15,2)

Nullable : Non

Default : Calculé automatiquement

Index : Oui

Unique : Non

Contraintes : Valeur ≥ 0 sauf cas particuliers (crédit d'impôt remboursable).

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

Libellé : Impôt estimé

Placeholder : 2 345,78 €

Aide : Montant estimé de l'impôt pour l'exercice fiscal.

Écran : Résultats du calcul

Ordre : 10

Composant : Carte de résultat

---

# Tests

Cas nominal

Impôt estimé de 3 250 €.

Cas limite

Impôt nul.

Cas d'erreur

Montant incohérent avec les résultats détaillés.

---

# Critères d'acceptation

✓ Le montant est calculé automatiquement.

✓ Il est cohérent avec les Rules exécutées.

✓ Il est exprimé dans la devise du dossier.

✓ Il est entièrement traçable.

---

# ❌ Erreurs d'implémentation interdites

- Autoriser une modification manuelle.
    
- Calculer un montant sans exécuter les Rules fiscales.
    
- Produire un résultat incohérent avec le détail du calcul.
    
- Perdre la traçabilité des éléments ayant conduit au montant final.