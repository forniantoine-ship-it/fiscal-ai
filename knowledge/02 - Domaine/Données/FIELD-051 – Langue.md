# FIELD-051 – Langue

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Langue".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

La Langue correspond à la langue utilisée pour l'affichage de l'interface, les explications, les rapports et les documents générés pour ce dossier.

Elle n'a aucun impact sur les calculs fiscaux.

---

# Entité

- Dossier
    

---

# Nom métier

Langue

---

# Nom technique

language

---

# Type

Énumération

---

# Format

Code ISO 639-1

---

# Unité

Aucune

---

# Valeur obligatoire

Oui

---

# Valeur par défaut

fr

---

# Source prioritaire

Utilisateur

---

# Sources autorisées

- Utilisateur
    
- Paramètres du compte
    

---

# Moteurs concernés

- UI Engine
    
- Explanation Engine
    
- Export Engine
    

---

# Features concernées

- Toutes les Features affichant du contenu
    

---

# Rules concernées

Aucune Rule fiscale.

---

# Validation

Le champ doit :

- correspondre à un code ISO 639-1 valide ;
    
- être pris en charge par Fiscal AI.
    

---

# Dépendances

Aucune.

---

# Questions associées

Si la valeur est absente :

**"Dans quelle langue souhaitez-vous utiliser Fiscal AI ?"**

---

# Documents pouvant fournir cette donnée

Aucun.

---

# Utilisation

Ce champ est utilisé pour :

- afficher l'interface ;
    
- générer les rapports ;
    
- produire les explications.
    

---

# Traçabilité

Pour chaque valeur, Fiscal AI conserve :

- la valeur ;
    
- la date de modification ;
    
- l'auteur de la modification.
    

---

# SQL

Nom de colonne : `language`

Type SQL : CHAR(2)

Nullable : Non

Default : 'fr'

Index : Non

Unique : Non

Contraintes : Code ISO 639-1 valide.

---

# API

Lecture : Oui

Écriture : Oui

Visible utilisateur : Oui

Exportable : Oui

Filtrable : Oui

Triable : Non

---

# UI

Libellé : Langue

Placeholder : Français

Aide : Langue utilisée pour l'interface et les documents.

Écran : Paramètres du dossier

Ordre : 19

Composant : Liste déroulante

---

# Tests

Cas nominal

fr.

Cas limite

en.

Cas d'erreur

Code langue invalide.

---

# Critères d'acceptation

✓ La langue appartient à la liste des langues supportées.

✓ Elle est appliquée à toute l'interface.

✓ La provenance est connue.

✓ Toute modification est historisée.

---

# ❌ Erreurs d'implémentation interdites

- Accepter une langue non supportée.
    
- Modifier la langue sans historisation.
    
- Mélanger plusieurs langues dans un même dossier.
    
- Utiliser un code différent de la norme ISO 639-1.