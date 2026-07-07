---
id: ADR-001
title: Extension du Classification Engine à la granularité transactionnelle
type: adr
status: pending-decision
version: "1.0"
created: 2026-06-30
updated: 2026-06-30
owner: product-owner
tags: [adr, classification-engine, architecture, engines]
triggers: [F-010, F-011, F-012]
engines_concernés: [ENG-004]
---

# ADR-001 — Extension du Classification Engine à la granularité transactionnelle

---

# Statut

🟡 **En attente de décision** — ADR préparatoire. Aucune modification du KS ni des Engines n'est effectuée à ce stade.

---

# Contexte

Le Classification Engine (ENG-004) a été conçu autour d'un contrat simple et strict :

> **"Quel est ce document ?"**

Il opère au niveau du document entier. Il identifie un type (Acte notarié, Tableau d'amortissement, Facture…), attribue un niveau de confiance, et émet `CLASSIFICATION_TERMINE`. Son slogan — *"Identifier. Jamais interpréter."* — reflète une séparation nette entre identification et traitement.

Cette conception s'est révélée correcte pour les premiers assistants :
- F-009 : un document INPI → un type → une extraction uniforme
- F-010 : un acte notarié → un type → une extraction guidée par le même type

---

# Problème

La conception de F-010, F-011 et F-012 a révélé une limite structurelle du Classification Engine sur **trois occurrences successives**.

## Occurrence 1 — F-010 : sous-types d'actes notariaux

Un acte notarié de vente classique et un procès-verbal de livraison VEFA sont tous deux classifiés "Acte notarié". Mais les règles d'extraction sont fondamentalement différentes :
- Acte de vente : chercher prix, date, frais, ventilation terrain/bâti
- PV de livraison VEFA : chercher date de livraison, conformité, appels de fonds cumulés

Le Classification Engine retourne un type unique. La pipeline RT-003 ne sait pas quelle règle d'extraction appliquer.

## Occurrence 2 — F-011 : sous-types de documents financiers

Un "Tableau d'amortissement" d'un prêt amortissable et celui d'un prêt in fine ont des structures radicalement différentes. Un relevé de gestion annuel contient des lignes de natures multiples (honoraires, frais d'état des lieux, commissions). La classification du document entier est correcte mais insuffisante pour orienter l'extraction ligne par ligne.

## Occurrence 3 — F-012 : classification au niveau transaction (décompte de syndic)

C'est l'occurrence la plus révélatrice. Un décompte annuel de syndic est classifié "Appel de charges" — c'est juste. Mais il contient des lignes de natures fiscales **différentes** :

| Ligne du décompte | Traitement fiscal |
|---|---|
| Provisions pour charges courantes | Déductible comme charge |
| Régularisation annuelle | Déductible comme charge |
| Fonds de travaux ALUR | **Non déductible** (épargne, pas une dépense) |
| Appel de fonds gros travaux | **JUG nécessaire** (charge ou amortissement) |

Le Classification Engine retourne "Appel de charges" pour l'ensemble du document. Aucun Engine ne prend ensuite la responsabilité de distinguer ces quatre types à l'intérieur du document. Cette responsabilité n'est pas documentée.

## Formulation du problème

La question **"Quel est ce document ?"** est nécessaire mais insuffisante pour les documents multi-lignes à contenu hétérogène. Pour ces documents, la question pertinente est :

> **"Quel est ce document, et de quel type est chaque ligne qu'il contient ?"**

Cette extension n'a pas été anticipée dans la spécification initiale d'ENG-004.

---

# Ce qui se passe sans décision

Sans résolution, la responsabilité de la classification transactionnelle reste non assignée. En pratique, elle sera absorbée de manière ad hoc — soit par le Calculation Engine (qui calulera sans avoir qualifié), soit par le Question Engine (qui posera des questions que le système pourrait éviter), soit par du code implicite dans la pipeline RT-003 qui ne correspond à aucun Engine documenté.

Ce "flottement" de responsabilité est un risque d'architecture concret sur F-012 et tous les assistants futurs impliquant des documents multi-lignes.

---

# Solutions envisagées

## Option A — Étendre ENG-004 à la classification de transactions

Le Classification Engine opère déjà en deux étapes implicites : identifier le type du document, puis (pour les documents multi-lignes) identifier le type de chaque ligne.

**Pro :**
- Minimal comme changement conceptuel — c'est toujours de l'identification, pas de l'interprétation
- Le slogan "Identifier. Jamais interpréter." reste valide — identifier une ligne comme "fonds de travaux" n'est pas interpréter ses conséquences fiscales
- Un seul Engine reste responsable de toute la classification
- La pipeline RT-003 consomme une liste enrichie (document_type + lines[{line_type}]) sans changer d'architecture

**Con :**
- ENG-004 devient plus complexe
- Nécessite une taxonomie de types de lignes en plus de la taxonomie de types de documents

## Option B — Créer un Engine dédié à la classification de transactions

Un neuvième Engine — "Transaction Classification Engine" — serait appelé après ENG-004 pour les documents multi-lignes.

**Pro :**
- Séparation stricte des responsabilités
- ENG-004 reste inchangé

**Con :**
- Un Engine supplémentaire pour un besoin qui est une extension naturelle de la classification existante
- Introduit une dépendance ordonnée entre deux Engines de même nature
- Le Workflow Engine devrait savoir quand appeler l'un vs. l'autre — ce qui lui impose une décision de routing métier, contre son contrat

## Option C — Assigner la classification de lignes au Calculation Engine

Le Calculation Engine applique les règles fiscales — il pourrait "savoir" qu'une ligne "fonds de travaux" n'est pas déductible.

**Pro :** aucun Engine supplémentaire

**Con :**
- Mélange classification et calcul — viole la séparation des responsabilités
- Le Calculation Engine deviendrait dépendant de la sémantique des libellés de lignes
- Si le libellé change (banque qui renomme une ligne), le calcul fiscal change — couplage fragile

## Option D — Assigner la classification de lignes au Question Engine

Pour les lignes ambiguës, poser une question à l'utilisateur : "Cette ligne est-elle X ou Y ?"

**Pro :** simple à implémenter

**Con :**
- Impose à l'utilisateur de classifier ce que le système devrait pouvoir identifier
- Contraire à la Constitution P19 (moindre friction) et P16 (ne pas supposer que l'utilisateur sait)
- Applicable seulement aux cas vraiment ambigus — ne résout pas le cas général

---

# Solution recommandée

**Option A — Extension d'ENG-004 à deux niveaux de classification.**

### Justification

La classification d'une ligne de décompte de syndic comme "fonds de travaux ALUR" est **de la même nature** que la classification d'un document comme "Acte notarié" — c'est de l'identification basée sur des patterns textuels, sans calcul ni interprétation fiscale.

Le slogan "Identifier. Jamais interpréter." reste entièrement valide. La différence est granulométrique, pas conceptuelle.

L'Option A préserve la cohérence architecturale (un Engine, une responsabilité) tout en adressant le problème réel. Les Options B et C introduisent soit de la complexité injustifiée (B), soit un couplage dangereux (C). L'Option D dégrade l'expérience utilisateur.

### Structure étendue d'ENG-004

Le contrat étendu aurait la forme suivante :

**Niveau 1 — Classification du document (inchangé)**
> Entrée : texte OCR + métadonnées
> Sortie : {document_type, confidence}
> Question : "Quel est ce document ?"

**Niveau 2 — Classification des transactions (nouveau)**
> Applicable uniquement aux documents multi-lignes à contenu hétérogène
> Entrée : lignes extraites par RT-003 + type de document (Niveau 1)
> Sortie : {lines: [{line_description, line_type, confidence}]}
> Question : "Quel est le type fiscal de chaque ligne de ce document ?"

La **taxonomie des types de lignes** devra être documentée séparément de la taxonomie des types de documents. Elle doit rester factuelle (fonds de travaux, provision courante, régularisation…) sans porter de conséquence fiscale — c'est le rôle du Calculation Engine d'appliquer la règle associée au type identifié.

---

# Conséquences de la décision (si validée)

**Sur ENG-004 :**
- Ajout d'une section "Classification transactionnelle" avec son contrat, ses interdictions et sa taxonomie de types de lignes
- Le slogan et la philosophie restent inchangés

**Sur RT-003 :**
- Le pipeline doit être étendu pour consommer les résultats de la classification transactionnelle
- Les `CandidateValues` devront porter le `line_type` en plus du `Field` et du `value`

**Sur les futurs Assistants :**
- F-013 (Travaux), F-014 (Résultat), F-015 (Liasse) pourront s'appuyer sur la classification transactionnelle pour les documents multi-lignes
- Les formulaires de déclaration fiscale (liasse 2033) sont eux-mêmes des documents multi-lignes — cette extension sera utile pour la génération en sens inverse (lecture d'une liasse existante)

**Sur les Engines voisins :**
- Le Calculation Engine reçoit un `line_type` et applique la règle fiscale correspondante — il ne classe plus
- Le Question Engine n'est mobilisé que pour les lignes dont le `line_type` est "AMBIGU" — ce qui était le cas de l'appel de fonds gros travaux dans F-012

**Ce qui ne change pas :**
- Le contrat d'ENG-004 en mode Niveau 1 reste identique
- Le principe "Identifier. Jamais interpréter." reste valide aux deux niveaux
- ENG-004 ne prend jamais de décision fiscale — il identifie des types, il ne calcule pas les conséquences

---

# Questions ouvertes avant décision

1. La taxonomie des types de lignes doit-elle être exhaustive dès le départ, ou construite de manière incrémentale assistant par assistant ?
2. Qui maintient la taxonomie des types de lignes quand de nouveaux formats de documents bancaires ou de syndics apparaissent ?
3. Le Niveau 2 doit-il être déclenché automatiquement (si document multi-lignes connu) ou explicitement demandé par le Workflow Engine ?
