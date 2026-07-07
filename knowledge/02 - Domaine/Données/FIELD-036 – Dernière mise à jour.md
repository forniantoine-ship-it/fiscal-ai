# FIELD-036 – Dernière mise à jour

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Dernière mise à jour".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

La Dernière mise à jour correspond à la date et à l'heure de la dernière modification du dossier.

Elle est mise à jour automatiquement par le système à chaque modification impactant le dossier ou l'une de ses entités liées.

---

# Entité

- Dossier
    

---

# Nom métier

Dernière mise à jour

---

# Nom technique

updated_at

---

# Type

Date et heure

---

# Format

ISO 8601 (AAAA-MM-JJTHH:MM:SSZ)

---

# Unité

Date / Heure

---

# Valeur obligatoire

Oui

---

# Valeur par défaut

Date de création du dossier

---

# Source prioritaire

Système

---

# Sources autorisées

- Workflow Engine
    
- Système
    

---

# Moteurs concernés

- Workflow Engine
    

---

# Features concernées

Toutes les Features modifiant le dossier.

---

# Rules concernées

Aucune Rule fiscale directe.

---

# Validation

Le champ doit :

- être mis à jour automatiquement ;
    
- être postérieur ou égal à la date de création ;
    
- respecter le format ISO 8601.
    

---

# Dépendances

- FIELD-035 Date de création
    

---

# Questions associées

Aucune.

Cette donnée est générée automatiquement.

---

# Documents pouvant fournir cette donnée

Aucun.

---

# Utilisation

Ce champ est utilisé pour :

- afficher l'activité récente du dossier ;
    
- trier les dossiers ;
    
- gérer les synchronisations ;
    
- alimenter les journaux d'audit.
    

---

# Traçabilité

Pour chaque valeur, Fiscal AI conserve :

- la date et l'heure ;
    
- le moteur ayant effectué la modification.
    

---

# SQL

Nom de colonne : `updated_at`

Type SQL : TIMESTAMP

Nullable : Non

Default : CURRENT_TIMESTAMP

Index : Oui

Unique : Non

Contraintes : Toujours ≥ `created_at`.

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

Libellé : Dernière mise à jour

Placeholder : —

Aide : Dernière modification du dossier.

Écran : Détail du dossier

Ordre : 4

Composant : Texte en lecture seule

---

# Tests

Cas nominal

Modification du dossier.

Cas limite

Création du dossier (date = Date de création).

Cas d'erreur

Date antérieure à la création.

---

# Critères d'acceptation

✓ La date est mise à jour automatiquement.

✓ Elle est toujours postérieure ou égale à la date de création.

✓ Elle est historisée.

✓ Elle est disponible pour l'audit.

---

# ❌ Erreurs d'implémentation interdites

- Autoriser une modification manuelle.
    
- Utiliser une date antérieure à `created_at`.
    
- Perdre la traçabilité.
    
- Ne pas mettre à jour ce champ après une modification du dossier.