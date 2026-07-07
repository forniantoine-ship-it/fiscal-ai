# FIELD-010 – Ville

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Ville".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

La Ville correspond à la commune dans laquelle est situé le bien immobilier.

Elle est utilisée pour identifier précisément la localisation du bien, effectuer des contrôles de cohérence et appliquer certaines Rules territoriales.

---

# Entité

- Bien
    

---

# Nom métier

Ville

---

# Nom technique

city

---

# Type

Texte

---

# Format

Chaîne de caractères

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
    
- correspondre au code postal ;
    
- être cohérent avec le pays.
    

---

# Dépendances

- FIELD-007 Adresse
    
- FIELD-009 Code postal
    
- FIELD-011 Pays
    

---

# Questions associées

Si la valeur est absente :

**"Dans quelle commune est situé le bien ?"**

---

# Documents pouvant fournir cette donnée

- Acte authentique
    
- Bail
    
- Avis de taxe foncière
    

---

# Utilisation

Ce champ est utilisé pour :

- identifier le bien ;
    
- vérifier la cohérence de l'adresse ;
    
- alimenter les formulaires fiscaux ;
    
- appliquer certaines Rules territoriales.
    

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

Nom de colonne : `city`

Type SQL : VARCHAR(100)

Nullable : Non

Default : Aucun

Index : Oui

Unique : Non

Contraintes : Doit être cohérente avec le code postal et le pays.

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

Libellé : Ville

Placeholder : Bordeaux

Aide : Commune où est situé le bien immobilier.

Écran : Création du bien

Ordre : 4

Composant : Champ texte

---

# Tests

Cas nominal

Ville valide correspondant au code postal.

Cas limite

Commune portant le même nom dans plusieurs départements.

Cas d'erreur

Ville incohérente avec le code postal.

---

# Critères d'acceptation

✓ La ville est renseignée.

✓ Elle est cohérente avec le code postal.

✓ La provenance est connue.

✓ Toute modification est historisée.

---

# ❌ Erreurs d'implémentation interdites

- Accepter une ville incohérente avec le code postal.
    
- Perdre la provenance.
    
- Modifier la valeur sans historisation.
    
- Utiliser une orthographe différente de la commune officielle sans justification.