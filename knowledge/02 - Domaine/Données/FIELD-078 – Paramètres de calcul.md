# FIELD-078 – Paramètres de calcul

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Paramètres de calcul".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

Les Paramètres de calcul regroupent l'ensemble des valeurs utilisées pour exécuter un calcul fiscal.

Ils constituent le contexte exact dans lequel le moteur de calcul a travaillé et permettent de reproduire intégralement un résultat, même plusieurs années après son exécution.

Contrairement aux données métier (Bien, Financement, Travaux...), les paramètres représentent les réglages et options effectivement appliqués au moment du calcul.

---

# Entité

- Calcul
    

---

# Nom métier

Paramètres de calcul

---

# Nom technique

calculation_parameters

---

# Type

Collection

---

# Format

Objet JSON

---

# Unité

Aucune

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
    
- Workflow Engine
    

---

# Moteurs concernés

- Calculation Engine
    
- Rule Engine
    
- Explanation Engine
    
- Audit Engine
    

---

# Features concernées

- F-006 Calcul fiscal
    
- F-007 Génération de la déclaration
    

---

# Rules concernées

Toutes les Rules utilisant des paramètres d'exécution.

---

# Validation

Les paramètres doivent contenir uniquement :

- des paramètres connus ;
    
- des valeurs cohérentes ;
    
- une structure conforme au schéma officiel.
    

---

# Dépendances

- FIELD-075 Exercice fiscal
    
- FIELD-076 Régime fiscal
    
- FIELD-077 Rules utilisées
    

---

# Questions associées

Aucune.

---

# Documents pouvant fournir cette donnée

Aucun.

Les paramètres sont générés automatiquement lors de l'exécution.

---

# Utilisation

Ce champ est utilisé pour :

- reproduire exactement un calcul ;
    
- expliquer les résultats ;
    
- comparer deux calculs ;
    
- auditer le moteur ;
    
- diagnostiquer les écarts de résultats.
    

---

# Contenu typique

Les paramètres peuvent contenir notamment :

- exercice fiscal ;
    
- régime fiscal ;
    
- version du moteur ;
    
- version des Rules ;
    
- options fiscales activées ;
    
- seuils utilisés ;
    
- paramètres d'arrondi ;
    
- paramètres de simulation.
    

---

# Traçabilité

Pour chaque exécution, Fiscal AI conserve :

- l'ensemble des paramètres ;
    
- leur valeur ;
    
- leur provenance ;
    
- la date du calcul ;
    
- la version du moteur.
    

---

# SQL

Nom de colonne : `calculation_parameters`

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

Libellé : Paramètres de calcul

Placeholder : —

Aide : Paramètres utilisés lors de l'exécution du calcul.

Écran : Audit du calcul

Ordre : 8

Composant : Vue JSON structurée

---

# Tests

Cas nominal

Paramètres complets enregistrés.

Cas limite

Aucun paramètre optionnel.

Cas d'erreur

JSON invalide.

---

# Critères d'acceptation

✓ Tous les paramètres sont enregistrés.

✓ Les paramètres permettent de reproduire exactement le calcul.

✓ La structure est conforme au schéma officiel.

✓ Les paramètres sont entièrement historisés.

---

# ❌ Erreurs d'implémentation interdites

- Ne pas enregistrer les paramètres utilisés.
    
- Autoriser un JSON non conforme.
    
- Perdre les paramètres après une mise à jour.
    
- Exécuter un calcul sans conserver son contexte d'exécution.