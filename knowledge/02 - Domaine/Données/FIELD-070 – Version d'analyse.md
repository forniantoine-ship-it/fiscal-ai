# FIELD-070 – Version d'analyse

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Version d'analyse".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

La Version d'analyse identifie précisément la version de la chaîne d'analyse documentaire utilisée pour traiter un document.

Elle référence l'ensemble des composants ayant participé au traitement (OCR, Classification IA, Extraction, Validation et Rules) afin de garantir la reproductibilité complète des résultats.

Cette donnée est essentielle pour comprendre pourquoi une même pièce peut produire un résultat différent après une évolution de Fiscal AI.

---

# Entité

- Document
    

---

# Nom métier

Version d'analyse

---

# Nom technique

analysis_version

---

# Type

Texte

---

# Format

Version sémantique (SemVer)

Exemple :

`2.4.1`

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

Analysis Engine

---

# Sources autorisées

- Analysis Engine
    

---

# Moteurs concernés

- OCR Engine
    
- Classification Engine
    
- Extraction Engine
    
- Validation Engine
    
- Rule Engine
    
- Explanation Engine
    

---

# Features concernées

- F-004 Analyse documentaire
    

---

# Rules concernées

Toutes les Rules exécutées pendant l'analyse documentaire.

---

# Validation

Le champ doit :

- être généré automatiquement ;
    
- correspondre à une version existante ;
    
- être figé après la fin de l'analyse.
    

---

# Dépendances

- FIELD-062 Statut OCR
    
- FIELD-064 Classification IA
    
- FIELD-067 Champs extraits
    
- FIELD-068 Anomalies détectées
    
- FIELD-069 Rules déclenchées
    

---

# Questions associées

Aucune.

---

# Documents pouvant fournir cette donnée

Aucun.

Cette valeur est produite automatiquement par Fiscal AI.

---

# Utilisation

Ce champ est utilisé pour :

- reproduire une analyse ;
    
- comparer deux analyses ;
    
- expliquer les différences de résultats ;
    
- faciliter les audits ;
    
- diagnostiquer les régressions après une mise à jour.
    

---

# Traçabilité

Pour chaque version, Fiscal AI conserve :

- la version de l'analyse ;
    
- les versions des moteurs utilisés ;
    
- la date d'exécution ;
    
- l'identifiant de l'analyse.
    

---

# SQL

Nom de colonne : `analysis_version`

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

Libellé : Version d'analyse

Placeholder : 2.4.1

Aide : Version de la chaîne d'analyse ayant traité ce document.

Écran : Informations techniques

Ordre : 19

Composant : Badge en lecture seule

---

# Tests

Cas nominal

Version 2.4.1.

Cas limite

Migration vers une nouvelle version de l'Analysis Engine.

Cas d'erreur

Version absente ou inconnue.

---

# Critères d'acceptation

✓ La version est générée automatiquement.

✓ Elle permet de reproduire exactement une analyse.

✓ Les versions des moteurs sont historisées.

✓ Elle est disponible pour tous les audits.

---

# ❌ Erreurs d'implémentation interdites

- Autoriser une modification manuelle.
    
- Perdre la version après une mise à jour.
    
- Utiliser une version inexistante.
    
- Modifier la version d'une analyse déjà terminée.