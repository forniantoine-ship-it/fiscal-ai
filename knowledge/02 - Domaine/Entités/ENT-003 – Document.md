

Version : 1.0

Statut : 🔒 Entité métier

---

# Objectif

Définir l'entité Document de Fiscal AI.

Le Document constitue la principale source d'information du système.

Toutes les données fiscales doivent, autant que possible, provenir des documents avant d'être demandées à l'utilisateur.

---

# Description

Un Document représente un fichier importé dans un dossier fiscal.

Il est associé à un seul Dossier.

Il peut être utilisé pour alimenter une ou plusieurs informations métier.

---

# Cycle de vie

Importé

↓

Stocké

↓

OCR terminé

↓

Classifié

↓

Informations extraites

↓

Validé

↓

Archivé

---

# Relations

Appartient à :

- Dossier
    

Alimente :

- Bien
    
- Questions
    
- Calculs
    

Est utilisé par :

- Rules
    

---

# Attributs

## Identification

- Identifiant
    
- Nom d'origine
    
- Nom interne
    
- Référence
    
- Version
    

---

## Fichier

- Type MIME
    
- Extension
    
- Taille
    
- Nombre de pages
    
- Empreinte (hash)
    

---

## Provenance

- Date d'import
    
- Utilisateur
    
- Origine (manuel, API...)
    

---

## Analyse

- Statut OCR
    
- Statut classification
    
- Statut validation
    
- Niveau de confiance OCR
    
- Niveau de confiance Classification
    

---

## Contenu

- Texte OCR
    
- Langue détectée
    
- Résumé (V2)
    
- Mots-clés (V2)
    

---

## Métadonnées

- Date de création du document
    
- Date de dernière modification
    
- Date d'archivage
    

---

# Provenance des données

Les informations d'un Document peuvent provenir :

- de l'utilisateur ;
    
- du Document Engine ;
    
- de l'OCR Engine ;
    
- du Classification Engine ;
    
- du Validation Engine.
    

---

# Validation

Chaque document possède un état de validation.

Le document peut être :

- conforme ;
    
- incomplet ;
    
- illisible ;
    
- corrompu ;
    
- rejeté.
    

---

# Utilisation

Cette entité est utilisée par :

- Workflow Engine
    
- Document Engine
    
- OCR Engine
    
- Classification Engine
    
- Validation Engine
    
- Question Engine
    

---

# Interdictions

Ne jamais :

- stocker des calculs fiscaux ;
    
- stocker des décisions métier ;
    
- stocker des explications ;
    
- modifier le fichier original après son import.
    

Le Document est une source.

Jamais une décision.

---

# Critères d'acceptation

✓ Chaque document possède un identifiant unique.

✓ Chaque document est rattaché à un seul dossier.

✓ Le fichier original est conservé.

✓ Toutes les analyses sont traçables.

✓ L'origine des données est conservée.

---

# ❌ Erreurs d'implémentation interdites

- Modifier le document original.
    
- Écraser un document existant.
    
- Supprimer un document utilisé dans un calcul sans traçabilité.
    
- Ajouter des données métier directement dans le document.
    
- Mélanger contenu du fichier et résultats des calculs.