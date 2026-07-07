# FIELD-048 – Version du calcul

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Version du calcul".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

La Version du calcul identifie la version du moteur de calcul et des Rules fiscales utilisées pour produire les résultats du dossier.

Elle garantit la reproductibilité des calculs et permet de savoir précisément avec quelles règles un résultat a été obtenu.

---

# Entité

- Dossier
    

---

# Nom métier

Version du calcul

---

# Nom technique

calculation_version

---

# Type

Texte

---

# Format

Version sémantique (ex : 1.0.0)

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
    
- Workflow Engine
    
- Explanation Engine
    

---

# Features concernées

- F-006 Calcul fiscal
    
- F-007 Génération de la déclaration
    
- Audit
    

---

# Rules concernées

Toutes les Rules du moteur de calcul.

---

# Validation

Le champ doit :

- être généré automatiquement ;
    
- correspondre à une version existante du moteur ;
    
- être figé une fois le calcul terminé.
    

---

# Dépendances

- ENT-007 Calcul
    

---

# Questions associées

Aucune.

---

# Documents pouvant fournir cette donnée

Aucun.

Cette valeur est générée automatiquement.

---

# Utilisation

Ce champ est utilisé pour :

- reproduire un calcul ;
    
- comparer deux calculs réalisés avec des versions différentes ;
    
- assurer l'auditabilité complète du dossier.
    

---

# Traçabilité

Pour chaque valeur, Fiscal AI conserve :

- la version ;
    
- la date d'utilisation ;
    
- le moteur ayant réalisé le calcul.
    

---

# SQL

Nom de colonne : `calculation_version`

Type SQL : VARCHAR(20)

Nullable : Non

Default : Version active

Index : Oui

Unique : Non

Contraintes : Format de version sémantique.

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

Libellé : Version du calcul

Placeholder : —

Aide : Version du moteur utilisée pour le calcul.

Écran : Détail du calcul

Ordre : 16

Composant : Texte en lecture seule

---

# Tests

Cas nominal

Version 1.4.2.

Cas limite

Migration vers une nouvelle version.

Cas d'erreur

Version inexistante.

---

# Critères d'acceptation

✓ La version est générée automatiquement.

✓ Elle permet de reproduire le calcul.

✓ Elle est historisée.

✓ Elle correspond exactement au moteur utilisé.

---

# ❌ Erreurs d'implémentation interdites

- Autoriser une modification manuelle.
    
- Utiliser une version inexistante.
    
- Perdre la version ayant servi au calcul.
    
- Modifier la version après validation du calcul.