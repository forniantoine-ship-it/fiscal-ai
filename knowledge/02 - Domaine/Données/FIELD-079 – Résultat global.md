# FIELD-079 – Résultat global

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Résultat global".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

Le Résultat global représente la synthèse finale produite par le moteur de calcul.

Il regroupe l'ensemble des résultats fiscaux calculés (amortissements, charges, résultat fiscal, impôt estimé, économie d'impôt...) et constitue la vue consolidée utilisée par l'utilisateur et les autres moteurs.

Ce champ est entièrement calculé et ne peut jamais être modifié manuellement.

---

# Entité

- Calcul
    

---

# Nom métier

Résultat global

---

# Nom technique

calculation_result

---

# Type

Objet

---

# Format

JSON

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
    

---

# Moteurs concernés

- Calculation Engine
    
- Explanation Engine
    
- Export Engine
    
- Audit Engine
    

---

# Features concernées

- F-006 Calcul fiscal
    
- F-007 Génération de la déclaration
    
- Tableau de bord
    

---

# Rules concernées

Toutes les Rules ayant participé au calcul.

---

# Validation

Le résultat doit :

- être produit automatiquement ;
    
- être cohérent avec les résultats détaillés ;
    
- respecter le schéma officiel.
    

---

# Dépendances

- FIELD-080 Impôt estimé
    
- FIELD-081 Économie d'impôt
    
- FIELD-082 Amortissements calculés
    
- FIELD-083 Charges retenues
    
- FIELD-084 Résultat fiscal
    

---

# Questions associées

Aucune.

---

# Documents pouvant fournir cette donnée

Aucun.

Cette donnée est générée exclusivement par le moteur de calcul.

---

# Utilisation

Ce champ est utilisé pour :

- afficher le résumé des résultats ;
    
- générer les rapports ;
    
- produire les déclarations fiscales ;
    
- alimenter le tableau de bord.
    

---

# Contenu typique

Le résultat global peut contenir notamment :

- impôt estimé ;
    
- économie d'impôt ;
    
- amortissements ;
    
- charges déductibles ;
    
- résultat fiscal ;
    
- alertes éventuelles ;
    
- indicateurs de performance.
    

---

# Traçabilité

Pour chaque calcul, Fiscal AI conserve :

- le résultat complet ;
    
- la version du moteur ;
    
- les Rules utilisées ;
    
- la date de génération.
    

---

# SQL

Nom de colonne : `calculation_result`

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

Filtrable : Non

Triable : Non

---

# UI

Libellé : Résultat global

Placeholder : —

Aide : Résumé complet des résultats du calcul fiscal.

Écran : Résultats du calcul

Ordre : 9

Composant : Carte de synthèse

---

# Tests

Cas nominal

Résultat complet généré.

Cas limite

Aucun impôt dû.

Cas d'erreur

JSON incomplet.

---

# Critères d'acceptation

✓ Le résultat est généré automatiquement.

✓ Toutes les valeurs sont cohérentes.

✓ Les données sont entièrement traçables.

✓ Le résultat est reproductible.

---

# ❌ Erreurs d'implémentation interdites

- Autoriser une modification manuelle.
    
- Générer un résultat incomplet.
    
- Perdre le lien avec les résultats détaillés.
    
- Produire un résultat non reproductible.