# FIELD-049 – Devise

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Devise".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

La Devise correspond à la monnaie de référence utilisée pour l'ensemble des montants du dossier fiscal.

Elle garantit que tous les calculs, affichages et exports utilisent une unité monétaire cohérente.

---

# Entité

- Dossier
    

---

# Nom métier

Devise

---

# Nom technique

currency

---

# Type

Énumération

---

# Format

Code ISO 4217

---

# Unité

Aucune

---

# Valeur obligatoire

Oui

---

# Valeur par défaut

EUR

---

# Source prioritaire

Système

---

# Sources autorisées

- Système
    
- Utilisateur
    

---

# Moteurs concernés

- Calculation Engine
    
- Validation Engine
    
- Export Engine
    

---

# Features concernées

- Toutes les Features manipulant des montants
    

---

# Rules concernées

Toutes les Rules utilisant des montants financiers.

---

# Validation

Le champ doit :

- correspondre à un code ISO 4217 valide ;
    
- être cohérent avec le pays fiscal.
    

---

# Dépendances

- FIELD-050 Pays fiscal
    

---

# Questions associées

Si nécessaire :

**"Quelle devise souhaitez-vous utiliser pour ce dossier ?"**

---

# Documents pouvant fournir cette donnée

Aucun.

---

# Utilisation

Ce champ est utilisé pour :

- afficher les montants ;
    
- effectuer les calculs ;
    
- générer les exports.
    

---

# Traçabilité

Pour chaque valeur, Fiscal AI conserve :

- la valeur ;
    
- la date de modification ;
    
- l'auteur de la modification.
    

---

# SQL

Nom de colonne : `currency`

Type SQL : CHAR(3)

Nullable : Non

Default : 'EUR'

Index : Oui

Unique : Non

Contraintes : Code ISO 4217 valide.

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

Libellé : Devise

Placeholder : EUR

Aide : Devise utilisée pour le dossier.

Écran : Paramètres du dossier

Ordre : 17

Composant : Liste déroulante

---

# Tests

Cas nominal

EUR.

Cas limite

USD.

Cas d'erreur

Code devise invalide.

---

# Critères d'acceptation

✓ La devise appartient à la norme ISO 4217.

✓ Elle est cohérente avec le dossier.

✓ La provenance est connue.

✓ Toute modification est historisée.

---

# ❌ Erreurs d'implémentation interdites

- Accepter une devise invalide.
    
- Perdre la traçabilité.
    
- Modifier la devise sans historisation.
    
- Utiliser plusieurs devises dans un même dossier sans conversion.