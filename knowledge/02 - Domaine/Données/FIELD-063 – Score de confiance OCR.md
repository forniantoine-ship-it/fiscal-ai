# FIELD-063 – Score de confiance OCR

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Score de confiance OCR".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

Le Score de confiance OCR représente le niveau de fiabilité du texte extrait par le moteur OCR.

Il permet d'évaluer automatiquement la qualité de la reconnaissance de caractères et de décider si une validation humaine est nécessaire.

---

# Entité

- Document
    

---

# Nom métier

Score de confiance OCR

---

# Nom technique

ocr_confidence_score

---

# Type

Nombre décimal

---

# Format

Pourcentage

---

# Unité

%

---

# Valeur obligatoire

Oui

---

# Valeur par défaut

Calculé automatiquement

---

# Source prioritaire

OCR Engine

---

# Sources autorisées

- OCR Engine
    

---

# Moteurs concernés

- OCR Engine
    
- Validation Engine
    
- Workflow Engine
    
- Explanation Engine
    

---

# Features concernées

- F-004 Analyse documentaire
    

---

# Rules concernées

Toutes les Rules dépendant de la qualité de l'OCR.

---

# Validation

Le champ doit :

- être compris entre 0 et 100 ;
    
- être calculé automatiquement ;
    
- être cohérent avec le résultat OCR.
    

---

# Dépendances

- FIELD-062 Statut OCR
    

---

# Questions associées

Aucune.

---

# Documents pouvant fournir cette donnée

Aucun.

Cette donnée est produite par l'OCR Engine.

---

# Utilisation

Ce champ est utilisé pour :

- déterminer si une validation humaine est nécessaire ;
    
- prioriser les corrections ;
    
- mesurer la qualité des traitements OCR ;
    
- déclencher certaines Rules de validation.
    

---

# Traçabilité

Pour chaque valeur, Fiscal AI conserve :

- le score ;
    
- la date du calcul ;
    
- le moteur OCR utilisé ;
    
- la version du moteur OCR.
    

---

# SQL

Nom de colonne : `ocr_confidence_score`

Type SQL : DECIMAL(5,2)

Nullable : Non

Default : Calculé automatiquement

Index : Oui

Unique : Non

Contraintes : Valeur comprise entre 0 et 100.

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

Libellé : Score de confiance OCR

Placeholder : 98,75 %

Aide : Niveau de confiance du texte reconnu automatiquement.

Écran : Détail du document

Ordre : 12

Composant : Barre de progression avec couleur selon le score

---

# Tests

Cas nominal

98,40 %.

Cas limite

100 %.

Cas d'erreur

Score supérieur à 100 % ou inférieur à 0 %.

---

# Critères d'acceptation

✓ Le score est calculé automatiquement.

✓ Il est compris entre 0 et 100.

✓ Le calcul est traçable.

✓ Les Rules utilisent ce score pour décider d'une validation éventuelle.

---

# ❌ Erreurs d'implémentation interdites

- Autoriser une modification manuelle.
    
- Utiliser un score hors de l'intervalle 0–100.
    
- Perdre la version du moteur OCR.
    
- Déclencher une validation sans tenir compte du score.