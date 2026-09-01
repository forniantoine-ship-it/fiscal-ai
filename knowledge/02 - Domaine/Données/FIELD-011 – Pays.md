# FIELD-011 – Pays

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Pays".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

Le Pays correspond au pays dans lequel est situé le bien immobilier.

Il permet de déterminer les règles territoriales applicables, de valider l'adresse et de préparer les futures évolutions internationales de Fiscal AI.

---

# Entité

- Bien
    

---

# Nom métier

Pays

---

# Nom technique

country

---

# Type

Texte

---

# Format

Code ISO 3166-1 alpha-2

---

# Unité

Aucune

---

# Valeur obligatoire

Oui

---

# Valeur par défaut

FR

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

Toutes les Rules dépendant de la localisation du bien.

---

# Validation

Le champ doit :

- être renseigné ;
    
- correspondre à un code ISO valide ;
    
- être cohérent avec l'adresse, le code postal et la ville.
    

---

# Dépendances

- FIELD-007 Adresse
    
- FIELD-009 Code postal
    
- FIELD-010 Ville
    

---

# Questions associées

Si la valeur est absente :

**"Dans quel pays est situé le bien ?"**

---

# Documents pouvant fournir cette donnée

- Acte authentique
    
- Bail
    
- Avis de taxe foncière
    

---

# Utilisation

Ce champ est utilisé pour :

- déterminer le cadre géographique ;
    
- appliquer les Rules territoriales ;
    
- valider l'adresse ;
    
- préparer les futures versions internationales de Fiscal AI.
    

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

Nom de colonne : `country`

Type SQL : CHAR(2)

Nullable : Non

Default : 'FR'

Index : Oui

Unique : Non

Contraintes : Code ISO 3166-1 alpha-2 valide.

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

Libellé : Pays

Placeholder : France

Aide : Pays dans lequel est situé le bien immobilier.

Écran : Création du bien

Ordre : 5

Composant : Liste déroulante

---

# Tests

Cas nominal

Pays valide (FR).

Cas limite

Bien situé à l'étranger.

Cas d'erreur

Code ISO invalide.

---

# Critères d'acceptation

✓ Le pays est renseigné.

✓ Il correspond à un code ISO valide.

✓ Il est cohérent avec l'adresse complète.

✓ Toute modification est historisée.

---

# ❌ Erreurs d'implémentation interdites

- Accepter un code pays invalide.
    
- Perdre la provenance de la donnée.
    
- Modifier la valeur sans historisation.
    
- Utiliser un format différent du standard ISO.