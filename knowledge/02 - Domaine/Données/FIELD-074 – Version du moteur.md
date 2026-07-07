# FIELD-074 – Version du moteur

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Version du moteur".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

La Version du moteur correspond à la version exacte du moteur de calcul ayant produit les résultats fiscaux.

Elle permet de garantir la reproductibilité des calculs, d'identifier précisément les algorithmes utilisés et de comparer des résultats obtenus avec différentes versions de Fiscal AI.

Cette information est indispensable pour les audits, le support technique et la conformité.

---

# Entité

- Calcul
    

---

# Nom métier

Version du moteur

---

# Nom technique

calculation_engine_version

---

# Type

Texte

---

# Format

Version sémantique (SemVer)

Exemple :

`3.2.1`

---

# Unité

Aucune

---

# Valeur obligatoire

Oui

---

# Valeur par défaut

Version active du moteur

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
    
- F-007 Génération de la déclaration
    

---

# Rules concernées

Toutes les Rules exécutées lors d'un calcul.

---

# Validation

Le champ doit :

- être généré automatiquement ;
    
- correspondre à une version existante ;
    
- être figé après l'exécution du calcul.
    

---

# Dépendances

- FIELD-071 Référence du calcul
    
- FIELD-072 Date du calcul
    

---

# Questions associées

Aucune.

---

# Documents pouvant fournir cette donnée

Aucun.

Cette valeur est produite automatiquement par le Calculation Engine.

---

# Utilisation

Ce champ est utilisé pour :

- reproduire un calcul à l'identique ;
    
- comparer les résultats entre deux versions ;
    
- faciliter les audits ;
    
- analyser les régressions après une mise à jour.
    

---

# Traçabilité

Pour chaque calcul, Fiscal AI conserve :

- la version du moteur ;
    
- la version des Rules ;
    
- la date d'exécution ;
    
- les composants utilisés.
    

---

# SQL

Nom de colonne : `calculation_engine_version`

Type SQL : VARCHAR(20)

Nullable : Non

Default : Version active

Index : Oui

Unique : Non

Contraintes : Format SemVer valide.

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

Libellé : Version du moteur

Placeholder : 3.2.1

Aide : Version du moteur ayant produit ce calcul.

Écran : Détail du calcul

Ordre : 4

Composant : Badge en lecture seule

---

# Tests

Cas nominal

Version 3.2.1.

Cas limite

Calcul exécuté juste après une mise à jour du moteur.

Cas d'erreur

Version absente ou inconnue.

---

# Critères d'acceptation

✓ La version est générée automatiquement.

✓ Elle est immuable après le calcul.

✓ Elle permet de reproduire exactement les résultats.

✓ Les versions des composants sont historisées.

---

# ❌ Erreurs d'implémentation interdites

- Autoriser une modification manuelle.
    
- Utiliser une version inexistante.
    
- Modifier la version après validation du calcul.
    
- Perdre la traçabilité des versions utilisées.