

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Frais d'acquisition".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

Les Frais d'acquisition représentent l'ensemble des frais supportés lors de l'acquisition du bien immobilier.

Ils peuvent notamment comprendre les frais de notaire, les droits d'enregistrement, les frais d'agence et les autres frais directement liés à l'achat.

Selon les Rules applicables, ils peuvent être immobilisés ou déduits.

---

# Entité

- Bien
    

---

# Nom métier

Frais d'acquisition

---

# Nom technique

acquisition_costs

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

0 €

---

# Source prioritaire

Document

---

# Sources autorisées

- Acte authentique
    
- Décompte notarial
    
- Facture d'agence
    
- Utilisateur
    

---

# Moteurs concernés

- OCR Engine
    
- Classification Engine
    
- Validation Engine
    
- Question Engine
    
- Calculation Engine
    
- Explanation Engine
    

---

# Features concernées

- F-002 Création du bien
    
- F-004 Analyse documentaire
    
- F-005 Compléter les informations
    
- F-006 Calcul fiscal
    
- F-007 Génération de la déclaration
    

---

# Rules concernées

Toutes les Rules relatives :

- aux frais d'acquisition ;
    
- à l'immobilisation ;
    
- aux amortissements ;
    
- aux charges.
    

---

# Validation

Le champ doit :

- être supérieur ou égal à zéro ;
    
- être cohérent avec les justificatifs ;
    
- être exprimé en euros.
    

---

# Dépendances

Impacte notamment :

- Base amortissable
    
- Calcul des amortissements
    
- Charges
    
- Déclaration fiscale
    

---

# Questions associées

Si la valeur est absente :

**"Quel est le montant total des frais d'acquisition (notaire, agence, autres frais) ?"**

---

# Documents pouvant fournir cette donnée

- Acte authentique
    
- Décompte du notaire
    
- Facture d'agence
    
- Appel de fonds
    

---

# Utilisation

Ce champ est utilisé pour :

- calculer la base immobilisable ;
    
- déterminer les amortissements ;
    
- appliquer les Rules fiscales ;
    
- alimenter les formulaires fiscaux.
    

---

# Traçabilité

Pour chaque valeur, Fiscal AI conserve :

- la valeur ;
    
- la source ;
    
- le document d'origine ;
    
- la date d'obtention ;
    
- le moteur ayant renseigné la donnée ;
    
- le niveau de confiance.
    

---

# Critères d'acceptation

✓ Une seule valeur officielle est conservée.

✓ La provenance est connue.

✓ Toute modification est historisée.

✓ Les justificatifs sont conservés.

---

# ❌ Erreurs d'implémentation interdites

- Mélanger les frais d'acquisition avec le prix d'achat.
    
- Modifier une valeur validée sans historisation.
    
- Utiliser une valeur sans justificatif lorsque celui-ci est disponible.
    
- Calculer les amortissements sans appliquer les Rules appropriées.
    
- Perdre la traçabilité de la provenance.