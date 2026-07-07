# FIELD-050 – Pays fiscal

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Pays fiscal".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

Le Pays fiscal correspond au pays dont les règles fiscales s'appliquent au dossier.

Il détermine les moteurs de calcul, les formulaires disponibles, les règles fiscales applicables et les obligations déclaratives.

---

# Entité

- Dossier
    

---

# Nom métier

Pays fiscal

---

# Nom technique

tax_country

---

# Type

Énumération

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

Utilisateur

---

# Sources autorisées

- Utilisateur
    
- Système
    

---

# Moteurs concernés

- Workflow Engine
    
- Validation Engine
    
- Calculation Engine
    
- Explanation Engine
    

---

# Features concernées

- Toutes les Features fiscales
    

---

# Rules concernées

Toutes les Rules dépendant de la législation du pays.

---

# Validation

Le champ doit :

- correspondre à un code ISO 3166-1 alpha-2 valide ;
    
- être cohérent avec la devise et les formulaires utilisés.
    

---

# Dépendances

- FIELD-049 Devise
    

---

# Questions associées

Si la valeur est absente :

**"Dans quel pays est imposé ce dossier ?"**

---

# Documents pouvant fournir cette donnée

- Déclaration fiscale
    
- Avis d'imposition
    

---

# Utilisation

Ce champ est utilisé pour :

- sélectionner les règles fiscales ;
    
- déterminer les formulaires ;
    
- configurer le moteur de calcul.
    

---

# Traçabilité

Pour chaque valeur, Fiscal AI conserve :

- la valeur ;
    
- la date de modification ;
    
- l'auteur de la modification.
    

---

# SQL

Nom de colonne : `tax_country`

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

Libellé : Pays fiscal

Placeholder : France

Aide : Pays dont la législation fiscale s'applique au dossier.

Écran : Paramètres du dossier

Ordre : 18

Composant : Liste déroulante

---

# Tests

Cas nominal

FR.

Cas limite

BE.

Cas d'erreur

Code pays invalide.

---

# Critères d'acceptation

✓ Le pays correspond à un code ISO valide.

✓ Il est cohérent avec la devise et les Rules.

✓ La provenance est connue.

✓ Toute modification est historisée.

---

# ❌ Erreurs d'implémentation interdites

- Accepter un code pays invalide.
    
- Utiliser des Rules d'un autre pays.
    
- Perdre la provenance.
    
- Modifier le pays sans historisation.