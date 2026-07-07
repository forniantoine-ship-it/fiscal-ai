# FIELD-009 – Code postal

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Code postal".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

Le Code postal correspond au code postal officiel de la commune où est situé le bien immobilier.

Il est utilisé pour identifier la localisation du bien, effectuer des contrôles de cohérence et appliquer certaines Rules territoriales.

---

# Entité

- Bien
    

---

# Nom métier

Code postal

---

# Nom technique

postal_code

---

# Type

Texte

---

# Format

Code postal

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

Document

---

# Sources autorisées

- Acte authentique
    
- Bail
    
- Avis de taxe foncière
    
- Utilisateur
    

---

# Moteurs concernés

- OCR Engine
    
- Classification Engine
    
- Validation Engine
    
- Question Engine
    

---

# Features concernées

- F-002 Création du bien
    
- F-004 Analyse documentaire
    
- F-005 Compléter les informations
    

---

# Rules concernées

Toutes les Rules utilisant la localisation du bien.

---

# Validation

Le champ doit :

- être renseigné ;
    
- respecter le format du pays concerné ;
    
- être cohérent avec la ville et le pays.
    

---

# Dépendances

- FIELD-007 Adresse
    
- FIELD-010 Ville
    
- FIELD-011 Pays
    

---

# Questions associées

Si la valeur est absente :

**"Quel est le code postal du bien ?"**

---

# Documents pouvant fournir cette donnée

- Acte authentique
    
- Bail
    
- Avis de taxe foncière
    

---

# Utilisation

Ce champ est utilisé pour :

- identifier la commune ;
    
- vérifier la cohérence de l'adresse ;
    
- appliquer certaines Rules géographiques.
    

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

# SQL

Nom de colonne : `postal_code`

Type SQL : VARCHAR(10)

Nullable : Non

Default : Aucun

Index : Oui

Unique : Non

Contraintes : Format valide selon le pays.

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

Libellé : Code postal

Placeholder : 33000

Aide : Code postal du bien immobilier.

Écran : Création du bien

Ordre : 3

Composant : Champ texte

---

# Tests

Cas nominal

Code postal valide.

Cas limite

Code postal étranger.

Cas d'erreur

Code postal invalide.

---

# Critères d'acceptation

✓ Le code postal est valide.

✓ Il est cohérent avec la ville et le pays.

✓ La provenance est connue.

✓ Toute modification est historisée.

---

# ❌ Erreurs d'implémentation interdites

- Accepter un code postal invalide.
    
- Perdre la provenance.
    
- Modifier la valeur sans historisation.
    
- Accepter une incohérence avec la ville ou le pays.