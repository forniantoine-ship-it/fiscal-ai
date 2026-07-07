# FIELD-084 – Résultat fiscal

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Résultat fiscal".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

Le Résultat fiscal correspond au résultat imposable calculé par Fiscal AI après application de l'ensemble des règles fiscales.

Il est obtenu à partir des recettes, des charges déductibles, des amortissements, des réintégrations et des déductions autorisées.

Il constitue la donnée centrale utilisée pour déterminer l'impôt dû et remplir les déclarations fiscales.

---

# Entité

- Calcul
    

---

# Nom métier

Résultat fiscal

---

# Nom technique

tax_result

---

# Type

Nombre décimal

---

# Format

Monétaire

---

# Unité

Devise du dossier

---

# Valeur obligatoire

Oui

---

# Valeur par défaut

Calculé automatiquement

---

# Source prioritaire

Calculation Engine

---

# Sources autorisées

- Calculation Engine
    

---

# Moteurs concernés

- Calculation Engine
    
- Rule Engine
    
- Explanation Engine
    
- Export Engine
    
- Audit Engine
    

---

# Features concernées

- F-006 Calcul fiscal
    
- F-007 Génération de la déclaration
    
- Simulations fiscales
    

---

# Rules concernées

Toutes les Rules participant au calcul du résultat fiscal.

---

# Validation

Le champ doit :

- être calculé automatiquement ;
    
- être cohérent avec les recettes, charges et amortissements ;
    
- respecter les règles fiscales applicables au régime concerné.
    

---

# Dépendances

- FIELD-082 Amortissements calculés
    
- FIELD-083 Charges retenues
    
- FIELD-077 Rules utilisées
    
- FIELD-076 Régime fiscal
    

---

# Questions associées

Aucune.

---

# Documents pouvant fournir cette donnée

Aucun.

Cette donnée est produite exclusivement par le moteur de calcul.

---

# Utilisation

Ce champ est utilisé pour :

- déterminer la base imposable ;
    
- calculer l'impôt ;
    
- générer les formulaires fiscaux ;
    
- expliquer le calcul réalisé.
    

---

# Formule générale

Résultat fiscal =

Recettes

− Charges retenues

− Amortissements

± Réintégrations fiscales

± Déductions fiscales

(selon les Rules applicables)

---

# Traçabilité

Pour chaque calcul, Fiscal AI conserve :

- le résultat obtenu ;
    
- le détail des composantes ;
    
- les Rules appliquées ;
    
- la version du moteur ;
    
- la date du calcul.
    

---

# SQL

Nom de colonne : `tax_result`

Type SQL : DECIMAL(15,2)

Nullable : Non

Default : Calculé automatiquement

Index : Oui

Unique : Non

Contraintes : Valeur calculée uniquement par le moteur.

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

Libellé : Résultat fiscal

Placeholder : 12 845,37 €

Aide : Résultat fiscal retenu pour ce calcul.

Écran : Résultats du calcul

Ordre : 14

Composant : Carte de résultat

---

# Tests

Cas nominal

Résultat fiscal positif.

Cas limite

Résultat nul.

Cas d'erreur

Résultat incohérent avec les charges et amortissements.

---

# Critères d'acceptation

✓ Le résultat est calculé automatiquement.

✓ Toutes les composantes sont justifiables.

✓ Les Rules appliquées sont traçables.

✓ Le résultat est totalement reproductible.

---

# ❌ Erreurs d'implémentation interdites

- Autoriser une modification manuelle.
    
- Calculer un résultat sans exécuter les Rules.
    
- Produire un résultat incohérent avec les données du dossier.
    
- Perdre le détail ayant conduit au résultat fiscal.