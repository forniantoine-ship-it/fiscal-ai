

Version : 1.0

Statut : 🔒 Entité métier

---

# Objectif

Définir l'entité Déclaration de Fiscal AI.

La Déclaration représente le livrable final produit par le système à partir des calculs validés.

---

# Description

Une Déclaration regroupe l'ensemble des formulaires fiscaux, annexes et justificatifs générés pour un dossier.

Elle constitue le résultat officiel du traitement réalisé par Fiscal AI.

---

# Cycle de vie

Créée

↓

Préparée

↓

Générée

↓

Contrôlée

↓

Disponible

↓

Exportée

↓

Archivée

---

# Relations

Appartient à :

- Dossier
    

Utilise :

- Calculs
    

Référence :

- Rules
    

Peut contenir :

- Formulaires
    
- Annexes
    
- Justificatifs
    
- Explications
    

---

# Attributs

## Identification

- Identifiant
    
- Référence
    
- Version
    

---

## Informations générales

- Année fiscale
    
- Régime fiscal
    
- Date de génération
    
- Statut
    

---

## Contenu

- Liste des formulaires
    
- Liste des annexes
    
- Liste des justificatifs
    
- Résumé de la déclaration
    

---

## Export

- Format
    
- Date d'export
    
- Version exportée
    
- Historique des exports
    

---

## Traçabilité

- Calculs utilisés
    
- Rules utilisées
    
- Journal de génération
    
- Historique des versions
    

---

# Provenance

Une Déclaration est générée exclusivement à partir :

- des Calculs ;
    
- des Rules ;
    
- des Données validées.
    

---

# Validation

Une Déclaration peut être :

- En préparation
    
- Générée
    
- Contrôlée
    
- Exportée
    
- Archivée
    

---

# Utilisation

Cette entité est utilisée par :

- Workflow Engine
    
- Explanation Engine
    

Elle constitue le résultat final remis à l'utilisateur.

---

# Interdictions

Ne jamais :

- modifier une déclaration sans recalcul ;
    
- modifier directement les formulaires générés ;
    
- générer une déclaration avec un dossier incomplet ;
    
- perdre la traçabilité des calculs utilisés.
    

---

# Critères d'acceptation

✓ Chaque déclaration est rattachée à un seul dossier.

✓ Chaque valeur provient d'un calcul traçable.

✓ Les formulaires sont cohérents avec les calculs.

✓ Les exports sont historisés.

✓ Les versions sont conservées.

---

# ❌ Erreurs d'implémentation interdites

- Générer une déclaration sans calcul validé.
    
- Modifier une déclaration après génération sans créer une nouvelle version.
    
- Supprimer l'historique des exports.
    
- Produire une déclaration non traçable.
    
- Générer une déclaration avec des données non validées.