

Version : 1.0

Statut : 🔒 Entité métier

---

# Objectif

Définir l'entité Financement de Fiscal AI.

Le Financement représente l'ensemble des informations relatives au mode de financement d'un investissement immobilier.

Cette entité constitue la référence unique pour les emprunts, assurances, frais financiers et charges d'emprunt.

---

# Description

Un Financement est associé à un Bien.

Dans le MVP, un Bien possède un seul financement.

Une évolution future permettra plusieurs financements pour un même Bien.

---

# Cycle de vie

Créé

↓

Complété

↓

Validé

↓

Utilisé dans les calculs

↓

Archivé

---

# Relations

Appartient à :

- Bien
    

Utilisé par :

- Calcul
    
- Rule
    

Alimente :

- Déclaration
    

---

# Attributs

## Identification

- Identifiant
    
- Référence
    
- Version
    

---

## Prêt

- Type de prêt
    
- Organisme prêteur
    
- Référence du prêt
    
- Date d'émission
    
- Date de signature
    
- Date de déblocage
    

---

## Caractéristiques financières

- Capital emprunté
    
- Capital débloqué
    
- Durée
    
- Nombre d'échéances
    
- Taux nominal
    
- TAEG
    
- Type de taux (fixe, variable, mixte)
    

---

## Mensualités

- Montant de l'échéance
    
- Part capital
    
- Part intérêts
    
- Part assurance
    
- Date de première échéance
    
- Date de dernière échéance
    

---

## Assurance

- Assurance emprunteur
    
- Compagnie
    
- Coût mensuel
    
- Coût annuel
    
- Quotité assurée
    

---

## Frais

- Frais de dossier
    
- Frais de garantie
    
- Frais de courtage
    
- Frais bancaires
    

---

## État du financement

- En cours
    
- Soldé
    
- Renégocié
    
- Remboursé par anticipation
    
- Suspendu
    

---

## Documents associés

- Offre de prêt
    
- Tableau d'amortissement
    
- Assurance
    
- Avenants
    

---

# Provenance des données

Les données peuvent provenir :

- des documents importés ;
    
- de l'utilisateur ;
    
- des Rules.
    

---

# Validation

Chaque donnée peut être :

- Obligatoire
    
- Facultative
    
- Calculée
    
- Déduite
    
- Vérifiée
    

---

# Utilisation

Cette entité est utilisée par :

- Validation Engine
    
- Question Engine
    
- Calculation Engine
    
- Explanation Engine
    

---

# Interdictions

Ne jamais :

- contenir un calcul fiscal ;
    
- contenir une décision métier ;
    
- dépendre d'une interface ;
    
- dépendre d'une base de données.
    

Le Financement décrit uniquement les caractéristiques du financement.

---

# Critères d'acceptation

✓ Un financement est associé à un seul Bien (MVP).

✓ Toutes les caractéristiques du prêt sont centralisées ici.

✓ Les documents justificatifs sont rattachés au financement.

✓ Les Rules utilisent exclusivement cette entité pour les calculs liés aux intérêts et aux frais financiers.

---

# ❌ Erreurs d'implémentation interdites

- Stocker les intérêts calculés dans cette entité.
    
- Ajouter des règles fiscales.
    
- Ajouter des calculs d'amortissement.
    
- Dupliquer des informations déjà présentes dans le Bien.
    
- Créer plusieurs financements pour un Bien dans le MVP sans faire évoluer cette entité.