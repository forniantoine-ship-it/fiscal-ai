# FIELD-030 – Régime fiscal

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Régime fiscal".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

Le Régime fiscal correspond au régime d'imposition applicable au bien dans le cadre de son exploitation.

Il détermine les Rules fiscales, les calculs, les formulaires et les déclarations applicables.

---

# Entité

- Bien
    

---

# Nom métier

Régime fiscal

---

# Nom technique

tax_regime

---

# Type

Énumération

---

# Format

Liste de valeurs

---

# Unité

Aucune

---

# Valeur obligatoire

Oui

---

# Valeur par défaut

Aucune

---

# Source prioritaire

Rule

---

# Sources autorisées

- Déclaration fiscale
    
- Utilisateur
    
- Rule
    

---

# Valeurs autorisées

- LMNP Micro-BIC
    
- LMNP Réel simplifié
    
- LMP
    
- Revenus fonciers
    
- Autre
    

---

# Moteurs concernés

- Workflow Engine
    
- Validation Engine
    
- Calculation Engine
    
- Explanation Engine
    

---

# Features concernées

- F-005 Compléter les informations
    
- F-006 Calcul fiscal
    
- F-007 Génération de la déclaration
    

---

# Rules concernées

Toutes les Rules fiscales.

---

# Validation

Le champ doit :

- appartenir à la liste officielle ;
    
- être cohérent avec le type de location et la situation fiscale du dossier.
    

---

# Dépendances

- FIELD-025 Type de location
    

---

# Questions associées

Si la valeur est absente :

**"Sous quel régime fiscal est exploité ce bien ?"**

---

# Documents pouvant fournir cette donnée

- Déclaration fiscale
    
- Option fiscale
    
- Courrier de l'administration fiscale
    

---

# Utilisation

Ce champ est utilisé pour :

- sélectionner les Rules fiscales ;
    
- déterminer les calculs ;
    
- générer les formulaires adéquats.
    

---

# Traçabilité

Pour chaque valeur, Fiscal AI conserve :

- la valeur ;
    
- la source ;
    
- la Rule appliquée ;
    
- la date d'obtention ;
    
- le moteur ayant renseigné la donnée.
    

---

# SQL

Nom de colonne : `tax_regime`

Type SQL : ENUM

Nullable : Non

Default : Aucun

Index : Oui

Unique : Non

Contraintes : Valeur appartenant à l'énumération officielle.

---

# API

Lecture : Oui

Écriture : Oui

Visible utilisateur : Oui

Exportable : Oui

Filtrable : Oui

Triable : Oui

---

# UI

Libellé : Régime fiscal

Placeholder : Sélectionnez un régime fiscal

Aide : Régime d'imposition applicable au bien.

Écran : Fiscalité

Ordre : 24

Composant : Liste déroulante

---

# Tests

Cas nominal

LMNP Réel simplifié.

Cas limite

Changement de régime.

Cas d'erreur

Valeur hors de l'énumération.

---

# Critères d'acceptation

✓ Une seule valeur est autorisée.

✓ La valeur est cohérente avec le dossier.

✓ La provenance est connue.

✓ Toute modification est historisée.

---

# ❌ Erreurs d'implémentation interdites

- Accepter une valeur libre.
    
- Modifier l'énumération sans mettre à jour le Data Dictionary.
    
- Perdre la provenance.
    
- Appliquer des Rules d'un autre régime fiscal.