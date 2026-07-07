# FIELD-064 – Classification IA

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Classification IA".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

La Classification IA correspond au résultat produit par le moteur d'intelligence artificielle chargé d'identifier automatiquement le contenu métier du document.

Contrairement au **Type de document**, qui représente la classification validée par le système, la **Classification IA** est la proposition initiale de l'IA accompagnée de son niveau de confiance.

Elle constitue une étape essentielle avant la validation finale.

---

# Entité

- Document
    

---

# Nom métier

Classification IA

---

# Nom technique

ai_classification

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

Non classé

---

# Source prioritaire

Classification Engine

---

# Sources autorisées

- Classification Engine
    

---

# Moteurs concernés

- Classification Engine
    
- OCR Engine
    
- Validation Engine
    
- Workflow Engine
    

---

# Features concernées

- F-004 Analyse documentaire
    

---

# Rules concernées

Toutes les Rules de classification documentaire.

---

# Validation

Le champ doit :

- être généré automatiquement ;
    
- appartenir à la taxonomie officielle des documents ;
    
- pouvoir être validé ou corrigé avant de devenir le Type de document.
    

---

# Valeurs autorisées

- Acte authentique
    
- Compromis de vente
    
- Bail
    
- Bail commercial
    
- Avis d'imposition
    
- Taxe foncière
    
- DPE
    
- Facture
    
- Tableau d'amortissement
    
- Contrat de prêt
    
- Devis
    
- Relevé bancaire
    
- Justificatif d'identité
    
- Assurance
    
- Autre
    
- Non classé
    

---

# Dépendances

- FIELD-062 Statut OCR
    
- FIELD-063 Score de confiance OCR
    

---

# Questions associées

Si le score de confiance est insuffisant :

**"Pouvez-vous confirmer le type de ce document ?"**

---

# Documents pouvant fournir cette donnée

Le document lui-même.

---

# Utilisation

Ce champ est utilisé pour :

- proposer automatiquement un type de document ;
    
- alimenter les traitements IA ;
    
- déclencher les moteurs d'extraction adaptés ;
    
- assister l'utilisateur.
    

---

# Traçabilité

Pour chaque valeur, Fiscal AI conserve :

- la classification proposée ;
    
- le moteur IA utilisé ;
    
- la version du modèle ;
    
- la date de classification.
    

---

# SQL

Nom de colonne : `ai_classification`

Type SQL : ENUM

Nullable : Non

Default : 'Non classé'

Index : Oui

Unique : Non

Contraintes : Valeur appartenant à la taxonomie officielle.

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

Libellé : Classification IA

Placeholder : Acte authentique

Aide : Proposition automatique du moteur d'intelligence artificielle.

Écran : Analyse documentaire

Ordre : 13

Composant : Badge avec indicateur IA

---

# Tests

Cas nominal

L'IA classe correctement un acte authentique.

Cas limite

Document ambigu nécessitant une validation.

Cas d'erreur

Classification absente ou incohérente.

---

# Critères d'acceptation

✓ La classification est générée automatiquement.

✓ Elle est traçable.

✓ Elle peut être validée ou corrigée.

✓ La version du modèle IA est conservée.

---

# ❌ Erreurs d'implémentation interdites

- Permettre une saisie manuelle comme première source.
    
- Perdre la version du modèle IA.
    
- Confondre la proposition IA avec la classification validée.
    
- Modifier la classification sans historisation.