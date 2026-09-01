# FIELD-066 – Langue détectée

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Langue détectée".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

La Langue détectée correspond à la langue principale identifiée automatiquement dans le document par le moteur OCR.

Cette information permet de sélectionner les modèles OCR et IA appropriés, d'améliorer la qualité des extractions et de détecter les documents nécessitant un traitement spécifique.

---

# Entité

- Document
    

---

# Nom métier

Langue détectée

---

# Nom technique

detected_language

---

# Type

Énumération

---

# Format

Code ISO 639-1

---

# Unité

Aucune

---

# Valeur obligatoire

Oui

---

# Valeur par défaut

Détectée automatiquement

---

# Source prioritaire

OCR Engine

---

# Sources autorisées

- OCR Engine
    
- Language Detection Engine
    

---

# Moteurs concernés

- OCR Engine
    
- Language Detection Engine
    
- Classification Engine
    
- Validation Engine
    

---

# Features concernées

- F-004 Analyse documentaire
    

---

# Rules concernées

Toutes les Rules dépendant de la langue du document.

---

# Validation

Le champ doit :

- correspondre à un code ISO 639-1 valide ;
    
- être déterminé automatiquement ;
    
- être cohérent avec le contenu du document.
    

---

# Valeurs autorisées

- fr
    
- en
    
- es
    
- de
    
- it
    
- pt
    
- nl
    
- Autre
    

---

# Dépendances

- FIELD-062 Statut OCR
    

---

# Questions associées

Aucune.

Si la détection est incertaine, une validation utilisateur peut être demandée.

---

# Documents pouvant fournir cette donnée

Le document lui-même.

---

# Utilisation

Ce champ est utilisé pour :

- sélectionner le modèle OCR adapté ;
    
- choisir le modèle IA approprié ;
    
- améliorer les performances d'extraction ;
    
- produire des statistiques de qualité.
    

---

# Traçabilité

Pour chaque valeur, Fiscal AI conserve :

- la langue détectée ;
    
- le score de confiance associé ;
    
- la version du moteur de détection ;
    
- la date de détection.
    

---

# SQL

Nom de colonne : `detected_language`

Type SQL : CHAR(2)

Nullable : Non

Default : Détectée automatiquement

Index : Oui

Unique : Non

Contraintes : Code ISO 639-1 valide.

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

Libellé : Langue détectée

Placeholder : Français

Aide : Langue détectée automatiquement dans le document.

Écran : Analyse documentaire

Ordre : 15

Composant : Badge

---

# Tests

Cas nominal

fr.

Cas limite

Document multilingue.

Cas d'erreur

Langue non détectée.

---

# Critères d'acceptation

✓ La langue est détectée automatiquement.

✓ Elle correspond à un code ISO valide.

✓ Le moteur de détection est identifié.

✓ Toute détection est historisée.

---

# ❌ Erreurs d'implémentation interdites

- Autoriser une modification manuelle.
    
- Utiliser un code langue invalide.
    
- Perdre la version du moteur de détection.
    
- Continuer l'analyse sans connaître la langue lorsque celle-ci est indispensable.