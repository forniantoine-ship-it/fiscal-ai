

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Valeur du terrain".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

La Valeur du terrain représente la part du prix d'acquisition attribuée au terrain.

Cette valeur n'est jamais amortissable.

Elle est indispensable pour déterminer la base amortissable du bâti.

---

# Entité

- Bien
    

---

# Nom métier

Valeur du terrain

---

# Nom technique

land_value

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

Toutes les Rules de ventilation du prix d'acquisition.

Toutes les Rules d'amortissement.

---

# Validation

Le champ doit :

- être supérieur ou égal à zéro ;
    
- être inférieur au prix d'acquisition ;
    
- être cohérent avec la valeur du bâti ;
    
- respecter les règles de ventilation applicables.
    

---

# Dépendances

Impacte notamment :

- Valeur du bâti
    
- Base amortissable
    
- Calcul des amortissements
    
- Déclaration fiscale
    

---

# Questions associées

Si la valeur ne peut être déterminée automatiquement :

**"Connaissez-vous la valeur du terrain indiquée dans votre acte d'acquisition ?"**

---

# Documents pouvant fournir cette donnée

- Acte authentique
    
- Expertise immobilière
    
- Évaluation notariale
    

---

# Utilisation

Ce champ est utilisé pour :

- déterminer la base amortissable ;
    
- contrôler la ventilation terrain/bâti ;
    
- calculer les amortissements ;
    
- justifier les calculs auprès de l'utilisateur.
    

---

# Traçabilité

Pour chaque valeur, Fiscal AI conserve :

- la valeur ;
    
- la source ;
    
- la Rule utilisée ;
    
- le document d'origine ;
    
- la date d'obtention ;
    
- le moteur ayant renseigné la donnée ;
    
- le niveau de confiance.
    

---

# Critères d'acceptation

✓ Une seule valeur officielle est conservée.

✓ La ventilation est traçable.

✓ La provenance est connue.

✓ Les Rules utilisées sont historisées.

---

# ❌ Erreurs d'implémentation interdites

- Amortir la valeur du terrain.
    
- Accepter une valeur supérieure au prix d'acquisition.
    
- Modifier la valeur sans historisation.
    
- Utiliser une ventilation sans justification.
    
- Calculer les amortissements sans valeur du terrain (sauf Rule spécifique documentée).