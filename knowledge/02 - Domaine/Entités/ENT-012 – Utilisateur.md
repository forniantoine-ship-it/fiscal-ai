

Version : 1.0

Statut : 🔒 Entité métier

---

# Objectif

Définir l'entité Utilisateur de Fiscal AI.

L'Utilisateur représente la personne utilisant Fiscal AI et propriétaire d'un ou plusieurs dossiers fiscaux.

---

# Description

Un Utilisateur est le point d'entrée du système.

Il peut posséder plusieurs dossiers fiscaux.

Il fournit certaines informations directement et valide les informations extraites automatiquement.

---

# Cycle de vie

Créé

↓

Authentifié

↓

Actif

↓

Suspendu

↓

Archivé

---

# Relations

Possède :

- Dossiers
    

Répond à :

- Questions
    

Importe :

- Documents
    

---

# Attributs

## Identification

- Identifiant
    
- Nom
    
- Prénom
    
- Date de naissance
    

---

## Coordonnées

- Email
    
- Téléphone
    

---

## Adresse

- Adresse
    
- Code postal
    
- Ville
    
- Pays
    

---

## Authentification

- Identifiant de connexion
    
- Statut du compte
    
- Dernière connexion
    

---

## Préférences

- Langue
    
- Fuseau horaire
    
- Préférences de notification
    

---

## Traçabilité

- Date de création
    
- Dernière modification
    
- Dernière connexion
    

---

# Provenance des données

Les informations proviennent :

- de l'utilisateur ;
    
- du système d'authentification.
    

---

# Validation

Chaque donnée peut être :

- Obligatoire
    
- Facultative
    
- Vérifiée
    

---

# Utilisation

Cette entité est utilisée par :

- Workflow Engine
    
- Question Engine
    
- Document Engine
    

---

# Interdictions

Ne jamais :

- stocker des informations fiscales propres au dossier ;
    
- stocker des calculs ;
    
- stocker des Rules ;
    
- dépendre d'une technologie d'authentification.
    

---

# Critères d'acceptation

✓ Un utilisateur peut posséder plusieurs dossiers.

✓ Les informations personnelles sont centralisées.

✓ L'authentification est découplée du métier.

✓ Les données sont historisées.

---

# ❌ Erreurs d'implémentation interdites

- Mélanger les données utilisateur et les données fiscales.
    
- Stocker des informations de calcul.
    
- Faire dépendre cette entité d'un fournisseur d'authentification.
    
- Dupliquer des informations présentes dans les dossiers.