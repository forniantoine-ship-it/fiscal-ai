

Version : 1.0

Statut : 🔒 Entité métier

---

# Objectif

Définir l'entité Calcul de Fiscal AI.

Un Calcul représente le résultat produit par l'exécution d'une ou plusieurs Rules sur un dossier fiscal.

---

# Description

Un Calcul est une donnée produite par le système.

Il est entièrement reproductible.

Chaque résultat doit pouvoir être justifié et recalculé à partir des mêmes données d'entrée.

---

# Cycle de vie

Initialisé

↓

Exécuté

↓

Calculé

↓

Validé

↓

Utilisé

↓

Archivé

---

# Relations

Appartient à :

- Dossier
    

Concerne :

- Bien
    

Utilise :

- Rules
    

Alimente :

- Déclaration
    

Est expliqué par :

- Explanation Engine
    

---

# Attributs

## Identification

- Identifiant
    
- Référence
    
- Version
    

---

## Résultat

- Valeur calculée
    
- Type de calcul
    
- Unité
    
- Devise
    
- Arrondi appliqué
    

---

## Données utilisées

- Données d'entrée
    
- Rules exécutées
    
- Paramètres fiscaux
    
- Hypothèses
    

---

## Exécution

- Date d'exécution
    
- Durée
    
- Statut
    
- Version du moteur
    

---

## Traçabilité

- Journal de calcul
    
- Historique
    
- Auteur (système)
    
- Dernière exécution
    

---

# Provenance

Un Calcul est produit exclusivement par le Calculation Engine.

---

# Validation

Un Calcul peut être :

- En attente
    
- En cours
    
- Calculé
    
- Validé
    
- Rejeté
    
- Obsolète
    

---

# Utilisation

Cette entité est utilisée par :

- Workflow Engine
    
- Calculation Engine
    
- Explanation Engine
    

---

# Interdictions

Ne jamais :

- modifier manuellement un résultat calculé ;
    
- supprimer le journal de calcul ;
    
- perdre la liste des Rules exécutées ;
    
- produire un calcul sans données validées.
    

---

# Critères d'acceptation

✓ Chaque calcul est traçable.

✓ Chaque calcul est reproductible.

✓ Chaque calcul référence les Rules utilisées.

✓ Les données d'entrée sont conservées.

✓ Le journal de calcul est disponible.

---

# ❌ Erreurs d'implémentation interdites

- Modifier un résultat sans relancer un calcul.
    
- Produire deux résultats différents avec les mêmes données d'entrée.
    
- Exécuter un calcul avec des données non validées.
    
- Supprimer la traçabilité.
    
- Calculer sans enregistrer les Rules utilisées.