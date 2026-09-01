# FIELD-075 – Exercice fiscal

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Exercice fiscal".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

L'Exercice fiscal correspond à l'année fiscale utilisée pour réaliser le calcul.

Chaque exécution du moteur est toujours associée à un exercice précis. Deux calculs identiques réalisés sur des exercices différents peuvent produire des résultats différents en raison de l'évolution des règles fiscales.

Cette donnée garantit que les calculs sont reproductibles dans leur contexte réglementaire.

---

# Entité

- Calcul
    

---

# Nom métier

Exercice fiscal

---

# Nom technique

tax_year

---

# Type

Nombre entier

---

# Format

AAAA

---

# Unité

Année

---

# Valeur obligatoire

Oui

---

# Valeur par défaut

Exercice du dossier

---

# Source prioritaire

ENT-002 Dossier

---

# Sources autorisées

- ENT-002 Dossier
    
- Workflow Engine
    

---

# Moteurs concernés

- Workflow Engine
    
- Calculation Engine
    
- Rule Engine
    

---

# Features concernées

- F-006 Calcul fiscal
    
- F-007 Génération de la déclaration
    

---

# Rules concernées

Toutes les Rules fiscales dépendant de l'exercice.

---

# Validation

Le champ doit :

- être une année valide ;
    
- être cohérent avec le dossier ;
    
- être renseigné avant le lancement du calcul.
    

---

# Dépendances

- ENT-002 Dossier
    
- FIELD-041 Exercice fiscal
    

---

# Questions associées

Aucune.

Cette valeur est héritée du dossier.

---

# Documents pouvant fournir cette donnée

- Dossier Fiscal AI
    
- Déclaration fiscale
    

---

# Utilisation

Ce champ est utilisé pour :

- charger les Rules applicables ;
    
- sélectionner les formulaires fiscaux ;
    
- reproduire les calculs ;
    
- historiser les résultats.
    

---

# Traçabilité

Pour chaque calcul, Fiscal AI conserve :

- l'exercice fiscal ;
    
- la date d'utilisation ;
    
- le moteur ayant utilisé cette valeur.
    

---

# SQL

Nom de colonne : `tax_year`

Type SQL : SMALLINT

Nullable : Non

Default : Exercice du dossier

Index : Oui

Unique : Non

Contraintes : Année valide.

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

Libellé : Exercice fiscal

Placeholder : 2026

Aide : Exercice utilisé pour ce calcul.

Écran : Détail du calcul

Ordre : 5

Composant : Lecture seule

---

# Tests

Cas nominal

Cas limite

Calcul d'un exercice antérieur.

Cas d'erreur

Exercice absent.

---

# Critères d'acceptation

✓ L'exercice est toujours renseigné.

✓ Il est cohérent avec le dossier.

✓ Il est historisé.

✓ Il permet de reproduire exactement le calcul.

---

# ❌ Erreurs d'implémentation interdites

- Modifier l'exercice après le lancement du calcul.
    
- Lancer un calcul sans exercice.
    
- Utiliser un exercice incohérent avec le dossier.
    
- Perdre la traçabilité de l'exercice utilisé.