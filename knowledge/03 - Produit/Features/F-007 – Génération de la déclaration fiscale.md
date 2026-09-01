

Version : 1.0

Statut : 🔒 Contrat fonctionnel

Priorité : Critique

---

# Mission

Générer automatiquement la déclaration fiscale et l'ensemble des documents associés à partir des résultats des calculs.

---

# Valeur utilisateur

Obtenir une déclaration complète, conforme et prête à être exploitée sans ressaisie.

---

# Déclencheur

Le Workflow détecte que tous les calculs sont terminés avec succès.

---

# Préconditions

- Les calculs sont terminés.
    
- Aucune erreur bloquante n'est présente.
    
- Toutes les données nécessaires sont disponibles.
    

---

# Résultat attendu

Les formulaires fiscaux sont générés.

Les annexes sont produites.

Le dossier est prêt à être consulté ou exporté.

---

# Objets métier concernés

- Dossier
    
- Calcul
    
- Déclaration
    

---

# Moteurs concernés

- ENG-001 Workflow Engine
    
- ENG-007 Calculation Engine
    
- ENG-008 Explanation Engine
    

---

# États concernés

- CALCUL_TERMINE
    
- DECLARATION_GENEREE
    

---

# Événements concernés

- DECLARATION_GENEREE
    

---

# Rules concernées

Toutes les Rules ayant participé aux calculs.

---

# Parcours utilisateur

1. Le Workflow vérifie que les calculs sont terminés.
    
2. Les données sont consolidées.
    
3. Les formulaires fiscaux sont générés.
    
4. Les annexes sont produites.
    
5. Les explications sont préparées.
    
6. La déclaration est disponible dans le dossier.
    

---

# Critères d'acceptation

✓ Tous les formulaires sont générés.

✓ Les données sont cohérentes avec les calculs.

✓ Les explications sont disponibles.

✓ Chaque valeur est traçable jusqu'à son origine.

✓ La déclaration est prête à être consultée ou exportée.

---

# Cas limites

- Génération incomplète.
    
- Donnée manquante.
    
- Incohérence détectée.
    
- Échec de génération d'un formulaire.
    

Le Workflow interrompt la génération et conserve les informations de diagnostic.

---

# Erreurs interdites

- Modifier les résultats des calculs.
    
- Inventer une donnée.
    
- Générer un formulaire incomplet.
    
- Générer une déclaration sans calcul terminé.
    
- Produire une explication sans justification.
    

---

# Dépendances

- F-001 – Création d'un dossier LMNP
    
- F-002 – Création d'un bien immobilier
    
- F-003 – Importer les documents
    
- F-004 – Analyse documentaire
    
- F-005 – Compléter les informations
    
- F-006 – Calcul fiscal
    

---

# Notes

Cette Feature produit les livrables fiscaux officiels du dossier.

Elle ne réalise aucun calcul supplémentaire.

Toute modification des résultats nécessite un nouveau passage par la Feature F-006.