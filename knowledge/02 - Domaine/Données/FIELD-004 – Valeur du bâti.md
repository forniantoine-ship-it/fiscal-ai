

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Valeur du bâti".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

La Valeur du bâti représente la part du prix d'acquisition attribuée à la construction.

Elle constitue la principale base amortissable du bien immobilier.

---

# Entité

- Bien
    

---

# Nom métier

Valeur du bâti

---

# Nom technique

building_value

---

# Type

Montant

---

# Format

Nombre décimal (EUR)

---

# Unité

Euro (€)

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

- Acte authentique
    
- Expertise
    
- Utilisateur
    
- Rule de ventilation
    

---

# Moteurs concernés

- Validation Engine
    
- Calculation Engine
    
- Explanation Engine
    

---

# Features concernées

- F-002 Création du bien
    
- F-005 Compléter les informations
    
- F-006 Calcul fiscal
    
- F-007 Génération de la déclaration
    

---

# Rules concernées

- Rules de ventilation terrain / bâti
    
- Rules d'amortissement
    
- Rules de calcul de la base amortissable
    

---

# Validation

Le champ doit :

- être supérieur à zéro ;
    
- être inférieur ou égal au prix d'acquisition ;
    
- être cohérent avec la valeur du terrain ;
    
- respecter les règles de ventilation retenues.
    

---

# Dépendances

Impacte notamment :

- Base amortissable
    
- Amortissement du bien
    
- Valeur nette comptable
    
- Déclaration fiscale
    

---

# Questions associées

Si la valeur ne peut être déterminée automatiquement :

**"Connaissez-vous la valeur du bâti indiquée dans votre acte ou votre expertise ?"**

---

# Documents pouvant fournir cette donnée

- Acte authentique
    
- Expertise immobilière
    
- Rapport d'évaluation
    
- Ventilation notariale
    

---

# Utilisation

Ce champ est utilisé pour :

- déterminer la base amortissable ;
    
- calculer les amortissements ;
    
- contrôler la cohérence de la ventilation ;
    
- alimenter les formulaires fiscaux.
    

---

# Traçabilité

Pour chaque valeur, Fiscal AI conserve :

- la valeur ;
    
- la source ;
    
- la Rule appliquée ;
    
- le document d'origine ;
    
- la date d'obtention ;
    
- le moteur ayant renseigné la donnée ;
    
- le niveau de confiance.
    

---

# Critères d'acceptation

✓ Une seule valeur officielle est conservée.

✓ La somme **Valeur du terrain + Valeur du bâti** est cohérente avec le prix d'acquisition (hors autres ventilations éventuelles).

✓ La provenance est connue.

✓ Les Rules utilisées sont historisées.

---

# ❌ Erreurs d'implémentation interdites

- Amortir le terrain au lieu du bâti.
    
- Accepter une valeur négative ou nulle.
    
- Modifier la valeur sans historisation.
    
- Utiliser une ventilation sans justification.
    
- Calculer les amortissements sans base amortissable valide.