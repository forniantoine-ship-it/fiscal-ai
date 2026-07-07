

Version : 1.0

Statut : 🔒 Gouvernance

---

# Objectif

Garantir que toute nouvelle connaissance ajoutée à Fiscal AI soit documentée de manière cohérente, unique et réutilisable.

Chaque information doit avoir une seule source de vérité.

---

# Principe fondamental

Avant de créer une note, se poser systématiquement les questions suivantes :

- Cette information existe-t-elle déjà ?
    
- Claude peut-il la déduire tout seul ?
    
- Cette information sera-t-elle réutilisée ailleurs ?
    
- Son absence peut-elle entraîner une erreur d'architecture ou de calcul ?
    

Si la réponse est **non** à toutes ces questions, ne pas créer de nouvelle note.

---

# Où ajouter une nouvelle connaissance ?

## C'est une donnée métier ?

➡️ Créer un **FIELD** dans le Data Dictionary.

Exemple :

- Date d'acquisition
    
- Prix d'acquisition
    
- Valeur du terrain
    

---

## C'est un concept métier ?

➡️ Ajouter ou compléter une **ENTITY**.

Exemple :

- Bien
    
- Financement
    
- Travaux
    
- Mobilier
    

---

## C'est une logique fiscale ?

➡️ Créer une **RULE**.

Exemple :

- Calcul de l'amortissement
    
- Ventilation terrain / bâti
    
- Déductibilité des charges
    

---

## C'est une capacité visible pour l'utilisateur ?

➡️ Créer une **FEATURE**.

Exemple :

- Importer des documents
    
- Calcul fiscal
    
- Génération de la déclaration
    

---

## C'est un moteur fonctionnel ?

➡️ Créer un **ENGINE**.

Exemple :

- Workflow Engine
    
- Calculation Engine
    
- Question Engine
    

---

## C'est un changement d'état ?

➡️ Ajouter un **STATE**.

---

## C'est un événement système ?

➡️ Ajouter un **EVENT**.

---

## C'est une suite d'actions métier ?

➡️ Ajouter un **SCENARIO**.

---

# Règles de conception

Une information n'existe qu'à un seul endroit.

Une Rule ne contient jamais de code.

Une Entity ne contient jamais de calcul.

Une Feature ne contient jamais de logique fiscale.

Un Engine ne contient jamais de connaissance métier.

Un Field est la seule référence officielle d'une donnée.

---

# Avant toute création

Toujours vérifier :

- Le Data Dictionary
    
- Le Domain Model
    
- Les Rules
    
- Les Features
    
- Les Engines
    

afin d'éviter les doublons.

---

# Philosophie

Le cerveau Fiscal AI n'est pas une documentation.

C'est une base de connaissances destinée à permettre à un humain ou à une IA de comprendre, faire évoluer et développer Fiscal AI sans avoir à réinventer son architecture.