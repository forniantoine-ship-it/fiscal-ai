# Workflow Engine

Version : 1.0

Statut : Document Fondateur

Dépend de :

- Architecture Métier
    
- Domain Model
    
- PRD
    

Impacte :

- Tous les moteurs
    
- Tous les modules
    
- Tous les écrans
    

---

# 1. Objectif

Le Workflow Engine est le chef d'orchestre de Fiscal AI.

Il ne réalise aucun calcul.

Il ne prend aucune décision fiscale.

Il ne lit aucun document.

Sa seule responsabilité est de savoir :

- où se trouve le dossier ;
    
- quelle est la prochaine étape ;
    
- quel moteur doit intervenir ;
    
- quand le dossier peut avancer.
    

Le Workflow Engine pilote le parcours complet de l'utilisateur.

---

# 2. Philosophie

Fiscal AI est un parcours.

Pas une suite d'écrans.

Le Workflow Engine ne pense jamais en termes de pages.

Il pense en termes d'états.

Chaque dossier possède un état.

Le workflow décide uniquement du passage d'un état au suivant.

---

# 3. Responsabilités

Le Workflow Engine doit :

- créer un nouveau dossier ;
    
- connaître l'état actuel du dossier ;
    
- autoriser ou refuser une transition ;
    
- déclencher les moteurs nécessaires ;
    
- attendre leur résultat ;
    
- enregistrer les événements ;
    
- décider de la prochaine étape.
    

---

# 4. Ce que le Workflow Engine ne fait jamais

Il ne calcule pas.

Il ne classe pas les documents.

Il ne pose pas directement les questions.

Il ne génère pas la liasse.

Il ne décide jamais d'une règle fiscale.

Il orchestre.

Rien d'autre.

---

# 5. Cycle de vie d'un dossier

État 1

Créé

↓

État 2

Informations générales

↓

État 3

Import des documents

↓

État 4

Analyse documentaire

↓

État 5

Questions complémentaires

↓

État 6

Calcul fiscal

↓

État 7

Validation

↓

État 8

Déclaration prête

↓

État 9

Génération

↓

État 10

Archivé

---

# 6. Les transitions

Chaque transition répond toujours à trois conditions.

## Condition 1

Toutes les données obligatoires sont présentes.

## Condition 2

Le moteur précédent a terminé.

## Condition 3

Aucune erreur bloquante n'est détectée.

Si une seule condition est fausse,

la transition est refusée.

---

# 7. Les événements

Le Workflow Engine fonctionne par événements.

Exemples :

DOSSIER_CREE

DOCUMENT_IMPORTE

OCR_TERMINE

CLASSIFICATION_TERMINEE

QUESTION_REPONDUE

CALCUL_TERMINE

VALIDATION_TERMINEE

DECLARATION_GENEREE

Chaque événement peut déclencher une nouvelle action.

---

# 8. Gestion des erreurs

Le Workflow Engine ne corrige jamais une erreur.

Il détecte uniquement qu'une erreur bloque le processus.

Il confie ensuite la résolution au moteur concerné.

---

# 9. Gestion des reprises

L'utilisateur peut quitter Fiscal AI à tout moment.

Au retour,

le Workflow Engine reprend exactement à la dernière étape valide.

Aucune information n'est perdue.

---

# 10. Philosophie UX

L'utilisateur ne doit jamais se demander :

"Quelle est la prochaine étape ?"

Le Workflow Engine connaît toujours la prochaine action.

Le logiciel guide.

L'utilisateur suit.

---

# 11. Critères d'acceptation

Le Workflow Engine est terminé lorsque :

✓ aucun dossier ne peut entrer dans un état incohérent ;

✓ toutes les transitions sont contrôlées ;

✓ chaque événement est historisé ;

✓ chaque moteur peut être remplacé sans modifier le workflow ;

✓ le parcours reste compréhensible pour l'utilisateur.

---

# 12. Vision à long terme

Le Workflow Engine n'est pas spécifique au LMNP.

Il est conçu pour piloter n'importe quel parcours Fiscal AI.

LMNP est simplement le premier workflow implémenté.