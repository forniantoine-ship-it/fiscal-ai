

Version : 1.0

Statut : 🔒 Contrat fonctionnel

Priorité : Critique

---

# Mission

Calculer automatiquement la situation fiscale du dossier LMNP à partir des données validées et des Rules métier.

---

# Valeur utilisateur

Obtenir un calcul fiscal fiable, reproductible et entièrement automatisé.

L'utilisateur ne réalise aucun calcul manuel.

---

# Déclencheur

Le Workflow détecte que le dossier est complet et prêt pour le calcul.

---

# Préconditions

- Le dossier est complet.
    
- Toutes les données sont validées.
    
- Aucune information obligatoire n'est manquante.
    
- Les Rules applicables sont disponibles.
    

---

# Résultat attendu

Tous les calculs sont exécutés.

Les résultats sont enregistrés.

Le Workflow peut passer à la génération de la déclaration.

---

# Objets métier concernés

- Dossier
    
- Bien
    
- Rule
    
- Calcul
    

---

# Moteurs concernés

- ENG-001 Workflow Engine
    
- ENG-007 Calculation Engine
    

---

# États concernés

- DOSSIER_COMPLET
    
- CALCUL_EN_COURS
    
- CALCUL_TERMINE
    

---

# Événements concernés

- CALCUL_DEMARRE
    
- CALCUL_TERMINE
    
- CALCUL_ECHEC
    

---

# Rules concernées

Toutes les Rules nécessaires au calcul du dossier.

---

# Parcours utilisateur

1. Le Workflow vérifie que le dossier est complet.
    
2. Le Calculation Engine charge les Rules applicables.
    
3. Les calculs sont exécutés.
    
4. Les résultats sont enregistrés.
    
5. Un journal de calcul est généré.
    
6. Le Workflow poursuit vers la génération de la déclaration.
    

---

# Critères d'acceptation

✓ Les calculs sont entièrement automatisés.

✓ Les résultats sont reproductibles.

✓ Chaque résultat est traçable jusqu'à la Rule utilisée.

✓ Aucun calcul n'est effectué avec des données incomplètes.

✓ Un journal de calcul est disponible.

---

# Cas limites

- Rule absente.
    
- Donnée obligatoire manquante.
    
- Calcul impossible.
    
- Résultat incohérent.
    
- Erreur technique.
    

Le Workflow interrompt le calcul et conserve la traçabilité de l'erreur.

---

# Erreurs interdites

- Calculer avec un dossier incomplet.
    
- Contenir des règles fiscales directement dans le moteur.
    
- Modifier les données du dossier pendant le calcul.
    
- Ignorer une erreur de calcul.
    
- Produire un résultat non traçable.
    

---

# Dépendances

- F-001 – Création d'un dossier LMNP
    
- F-002 – Création d'un bien immobilier
    
- F-003 – Importer les documents
    
- F-004 – Analyse documentaire
    
- F-005 – Compléter les informations
    

---

# Notes

Cette Feature produit exclusivement les résultats fiscaux.

La génération des formulaires et des documents officiels est réalisée par la Feature suivante.