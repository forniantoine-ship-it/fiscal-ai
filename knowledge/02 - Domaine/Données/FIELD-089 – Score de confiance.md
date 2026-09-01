# FIELD-089 – Score de confiance

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Score de confiance".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

Le Score de confiance représente le niveau global de fiabilité du calcul produit par Fiscal AI.

Il est calculé automatiquement à partir de nombreux indicateurs, notamment la qualité des documents importés, les scores OCR, les scores de classification IA, les données manquantes, les hypothèses appliquées, les avertissements et les éventuelles anomalies détectées.

Il permet à Fiscal AI d'indiquer à l'utilisateur dans quelle mesure il peut se fier au résultat obtenu.

---

# Entité

- Calcul
    

---

# Nom métier

Score de confiance

---

# Nom technique

confidence_score

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

Confidence Engine

---

# Sources autorisées

- Confidence Engine
    
- OCR Engine
    
- Classification Engine
    
- Validation Engine
    
- Calculation Engine
    

---

# Moteurs concernés

- Confidence Engine
    
- Calculation Engine
    
- Explanation Engine
    
- Workflow Engine
    
- Audit Engine
    

---

# Features concernées

- F-004 Analyse documentaire
    
- F-006 Calcul fiscal
    
- F-007 Génération de la déclaration
    

---

# Rules concernées

Toutes les Rules influençant la fiabilité du résultat.

---

# Validation

Le champ doit :

- être compris entre 0 et 100 ;
    
- être calculé automatiquement ;
    
- être recalculé à chaque nouvelle exécution.
    

---

# Dépendances

- FIELD-063 Score de confiance OCR
    
- FIELD-065 Score de confiance IA
    
- FIELD-067 Champs extraits
    
- FIELD-068 Anomalies détectées
    
- FIELD-087 Nombre d'erreurs
    
- FIELD-088 Nombre d'avertissements
    

---

# Questions associées

Aucune.

Si le score est inférieur au seuil défini par Fiscal AI, le système peut demander des documents complémentaires ou une validation utilisateur.

---

# Documents pouvant fournir cette donnée

Aucun.

Cette donnée est calculée automatiquement.

---

# Utilisation

Ce champ est utilisé pour :

- informer l'utilisateur de la fiabilité du calcul ;
    
- décider si une validation humaine est nécessaire ;
    
- piloter certains workflows ;
    
- mesurer la qualité globale du dossier ;
    
- produire des indicateurs qualité.
    

---

# Facteurs influençant le score

Le score peut être impacté par :

- la qualité OCR ;
    
- la qualité de la classification IA ;
    
- le nombre de données estimées ;
    
- le nombre d'anomalies ;
    
- le nombre d'erreurs ;
    
- le nombre d'avertissements ;
    
- la cohérence des informations extraites ;
    
- la qualité des documents.
    

---

# Traçabilité

Pour chaque calcul, Fiscal AI conserve :

- le score obtenu ;
    
- les facteurs ayant influencé le score ;
    
- la version du moteur de confiance ;
    
- la date du calcul.
    

---

# SQL

Nom de colonne : `confidence_score`

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

Libellé : Score de confiance

Placeholder : 98,60 %

Aide : Niveau global de fiabilité du calcul.

Écran : Résultats du calcul

Ordre : 19

Composant : Jauge de confiance avec code couleur

---

# Tests

Cas nominal

98,60 %.

Cas limite

100 %.

Cas d'erreur

Score supérieur à 100 % ou inférieur à 0 %.

---

# Critères d'acceptation

✓ Le score est calculé automatiquement.

✓ Il est compris entre 0 et 100.

✓ Les facteurs ayant conduit au score sont traçables.

✓ Il est recalculé à chaque nouvelle exécution.

---

# ❌ Erreurs d'implémentation interdites

- Autoriser une modification manuelle.
    
- Calculer le score sans prendre en compte les indicateurs de qualité.
    
- Produire un score hors de l'intervalle 0–100.
    
- Perdre la traçabilité des facteurs ayant influencé le score.