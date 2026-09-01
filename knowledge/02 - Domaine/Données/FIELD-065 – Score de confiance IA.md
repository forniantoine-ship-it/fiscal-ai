# FIELD-065 – Score de confiance IA

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Score de confiance IA".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

Le Score de confiance IA représente le niveau de certitude du moteur d'intelligence artificielle concernant la classification du document.

Il permet de mesurer la fiabilité de la décision prise par l'IA et de déterminer si une validation humaine est nécessaire avant de poursuivre les traitements.

---

# Entité

- Document
    

---

# Nom métier

Score de confiance IA

---

# Nom technique

ai_confidence_score

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

Classification Engine

---

# Sources autorisées

- Classification Engine
    

---

# Moteurs concernés

- Classification Engine
    
- Validation Engine
    
- Workflow Engine
    
- Explanation Engine
    

---

# Features concernées

- F-004 Analyse documentaire
    

---

# Rules concernées

Toutes les Rules de validation de la classification IA.

---

# Validation

Le champ doit :

- être compris entre 0 et 100 ;
    
- être calculé automatiquement ;
    
- être cohérent avec la classification proposée.
    

---

# Dépendances

- FIELD-064 Classification IA
    

---

# Questions associées

Aucune.

Si le score est inférieur au seuil défini par les Rules, une validation utilisateur est demandée automatiquement.

---

# Documents pouvant fournir cette donnée

Aucun.

Cette donnée est produite par le moteur de classification IA.

---

# Utilisation

Ce champ est utilisé pour :

- déterminer si la classification peut être validée automatiquement ;
    
- déclencher une validation humaine ;
    
- mesurer la qualité des modèles IA ;
    
- alimenter les statistiques de performance.
    

---

# Traçabilité

Pour chaque valeur, Fiscal AI conserve :

- le score ;
    
- la date du calcul ;
    
- le modèle IA utilisé ;
    
- la version du modèle ;
    
- le moteur ayant produit le résultat.
    

---

# SQL

Nom de colonne : `ai_confidence_score`

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

Libellé : Score de confiance IA

Placeholder : 96,85 %

Aide : Niveau de confiance de la classification automatique.

Écran : Analyse documentaire

Ordre : 14

Composant : Barre de progression avec code couleur

---

# Tests

Cas nominal

97,40 %.

Cas limite

100 %.

Cas d'erreur

Score inférieur à 0 % ou supérieur à 100 %.

---

# Critères d'acceptation

✓ Le score est calculé automatiquement.

✓ Il est compris entre 0 et 100.

✓ Le modèle IA ayant produit le score est identifié.

✓ Les décisions automatiques utilisent ce score.

---

# ❌ Erreurs d'implémentation interdites

- Autoriser une modification manuelle.
    
- Utiliser un score hors de l'intervalle 0–100.
    
- Perdre la version du modèle IA.
    
- Valider automatiquement une classification sans tenir compte du score.