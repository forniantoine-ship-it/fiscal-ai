

Version : 1.0

Statut : 🔒 Entité métier

---

# Objectif

Définir l'entité Réponse de Fiscal AI.

Une Réponse représente une information validée fournie par l'utilisateur en réponse à une Question.

---

# Description

Une Réponse complète les informations du dossier lorsque celles-ci ne peuvent être obtenues automatiquement.

Elle est toujours rattachée à une seule Question.

---

# Cycle de vie

Créée

↓

Saisie

↓

Contrôlée

↓

Validée

↓

Utilisée

↓

Archivée

---

# Relations

Appartient à :

- Question
    

Concerne :

- Dossier
    
- Bien
    

Peut être utilisée par :

- Rules
    
- Calculs
    

---

# Attributs

## Identification

- Identifiant
    
- Référence
    
- Version
    

---

## Valeur

- Valeur
    
- Type de donnée
    
- Unité
    
- Format
    

---

## Provenance

- Utilisateur
    
- Date de saisie
    
- Mode de saisie
    

---

## Validation

- Statut
    
- Date de validation
    
- Moteur de validation
    
- Motif de refus éventuel
    

---

## Traçabilité

- Historique des modifications
    
- Dernière modification
    
- Utilisateur ayant effectué la modification
    

---

# Provenance

Une Réponse provient exclusivement :

- de l'utilisateur.
    

Elle peut être validée par le Validation Engine.

---

# Validation

Une Réponse peut être :

- en attente ;
    
- valide ;
    
- invalide ;
    
- obsolète.
    

---

# Utilisation

Cette entité est utilisée par :

- Workflow Engine
    
- Validation Engine
    
- Question Engine
    
- Calculation Engine
    

---

# Interdictions

Ne jamais :

- modifier silencieusement une réponse utilisateur ;
    
- inventer une valeur ;
    
- supprimer une réponse utilisée par un calcul sans traçabilité ;
    
- mélanger plusieurs réponses dans une seule entité.
    

---

# Critères d'acceptation

✓ Chaque réponse est liée à une seule question.

✓ L'origine est toujours connue.

✓ Toute modification est historisée.

✓ Une réponse validée peut être utilisée par les Rules.

✓ Les réponses restent traçables après la génération de la déclaration.

---

# ❌ Erreurs d'implémentation interdites

- Modifier automatiquement une réponse.
    
- Remplacer une réponse sans conserver l'historique.
    
- Utiliser une réponse non validée dans un calcul.
    
- Partager une même réponse entre plusieurs questions.
    
- Perdre la provenance d'une réponse.