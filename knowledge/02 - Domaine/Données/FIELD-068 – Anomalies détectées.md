# FIELD-068 – Anomalies détectées

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Anomalies détectées".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

Les Anomalies détectées regroupent l'ensemble des incohérences, erreurs, informations manquantes ou situations inhabituelles identifiées lors de l'analyse d'un document.

Chaque anomalie est décrite, classifiée, priorisée et reliée à une ou plusieurs Rules afin de permettre une correction rapide et totalement traçable.

---

# Entité

- Document
    

---

# Nom métier

Anomalies détectées

---

# Nom technique

detected_anomalies

---

# Type

Collection

---

# Format

Liste d'objets JSON

---

# Unité

Aucune

---

# Valeur obligatoire

Oui

---

# Valeur par défaut

Collection vide

---

# Source prioritaire

Validation Engine

---

# Sources autorisées

- Validation Engine
    
- OCR Engine
    
- Extraction Engine
    
- Rule Engine
    

---

# Moteurs concernés

- Validation Engine
    
- Workflow Engine
    
- Explanation Engine
    

---

# Features concernées

- F-004 Analyse documentaire
    
- F-005 Compléter les informations
    
- F-006 Calcul fiscal
    

---

# Rules concernées

Toutes les Rules de validation documentaire.

---

# Validation

Chaque anomalie doit contenir :

- un identifiant unique ;
    
- une Rule ayant déclenché l'anomalie ;
    
- un niveau de gravité ;
    
- une description ;
    
- un statut ;
    
- une proposition de correction.
    

---

# Dépendances

- FIELD-067 Champs extraits
    
- FIELD-069 Rules déclenchées
    

---

# Questions associées

Selon l'anomalie détectée.

Exemple :

**"Le prix d'acquisition détecté est-il bien de 245 000 € ?"**

---

# Documents pouvant fournir cette donnée

Tous les documents analysés.

---

# Utilisation

Ce champ est utilisé pour :

- bloquer un calcul si nécessaire ;
    
- guider l'utilisateur dans les corrections ;
    
- améliorer la qualité des données ;
    
- produire des rapports d'audit.
    

---

# Traçabilité

Pour chaque anomalie, Fiscal AI conserve :

- son identifiant ;
    
- la Rule concernée ;
    
- la date de détection ;
    
- le moteur ayant détecté l'anomalie ;
    
- son historique de résolution.
    

---

# SQL

Nom de colonne : `detected_anomalies`

Type SQL : JSONB

Nullable : Non

Default : []

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

Libellé : Anomalies détectées

Placeholder : —

Aide : Liste des anomalies identifiées lors de l'analyse du document.

Écran : Analyse documentaire

Ordre : 17

Composant : Tableau des anomalies avec filtres et niveau de gravité

---

# Tests

Cas nominal

3 anomalies détectées.

Cas limite

Aucune anomalie.

Cas d'erreur

Anomalie sans Rule associée.

---

# Critères d'acceptation

✓ Chaque anomalie est reliée à une Rule.

✓ Chaque anomalie possède un niveau de gravité.

✓ Son statut est historisé.

✓ Une correction peut être proposée automatiquement.

---

# ❌ Erreurs d'implémentation interdites

- Stocker une anomalie sans Rule associée.
    
- Ne pas définir de niveau de gravité.
    
- Perdre l'historique de résolution.
    
- Autoriser une anomalie sans description.