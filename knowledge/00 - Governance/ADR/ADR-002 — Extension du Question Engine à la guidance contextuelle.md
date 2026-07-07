---
id: ADR-002
title: Extension du Question Engine à la guidance contextuelle
type: adr
status: pending-decision
version: "1.0"
created: 2026-06-30
updated: 2026-06-30
owner: product-owner
tags: [adr, question-engine, guidance, jugement, architecture]
triggers: [F-010, F-011, F-012]
engines_concernés: [ENG-006]
adr_liée: [ADR-001]
---

# ADR-002 — Extension du Question Engine à la guidance contextuelle

---

# Statut

🟡 **En attente de décision** — ADR préparatoire. Aucune modification du KS ni des Engines n'est effectuée à ce stade.

---

# Contexte

Le Question Engine (ENG-006) a été conçu autour d'un contrat précis :

> **Obtenir les informations manquantes nécessaires à la progression du dossier.**

Son slogan — *"Demander le minimum. Obtenir le maximum."* — traduit une philosophie d'économie : une question n'est posée que si l'information ne peut pas être trouvée ailleurs. Le protocole en cinq étapes (existe-t-elle déjà ? peut-elle être déduite ? calculée ? est-elle indispensable ?) en est l'expression concrète.

Cette conception s'est révélée correcte pour les cas nominaux : le Validation Engine signale un Field manquant, le Question Engine pose la question la plus courte possible, l'utilisateur répond, le Field est rempli.

---

# Problème

La conception de F-010, F-011 et F-012 a révélé trois usages qui excèdent ce contrat, sur **trois occurrences successives**.

## Occurrence 1 — F-010 : exposition d'un Jugement

La ventilation terrain/bâti est absente de l'acte notarié. Deux options existent :
- Option A : appliquer le ratio SAV-003 (estimation par localisation) — pragmatique, potentiellement contestable
- Option B : demander une expertise ou utiliser la valeur cadastrale — plus juste mais plus contraignant

Ce n'est pas une information manquante. C'est **un choix fiscal** avec des conséquences réelles. Le Question Engine doit :
1. Présenter les deux options en langage clair
2. Expliquer les implications de chacune
3. Proposer une recommandation motivée
4. Recueillir le choix de l'utilisateur

Le contrat actuel d'ENG-006 ne décrit pas ce comportement. La sortie n'est pas un "Field rempli" — c'est un "Jugement validé par l'utilisateur".

## Occurrence 2 — F-011 : explication contextuelle avant résultat

L'Assistant Financement calcule que les charges déductibles s'élèvent à €3 200, alors que l'utilisateur a versé €12 000 de mensualités. Sans contexte, ce résultat semble erroné.

Le Question Engine doit **expliquer la règle** (capital vs. intérêts) **avant** d'afficher le résultat — non pour collecter une information, mais pour préparer l'utilisateur à comprendre ce qu'il va voir.

Dans ce cas, l'Engine ne pose pas une question. Il délivre une explication, puis attend confirmation ("J'ai compris, continuez"). Le contrat actuel ne décrit pas ce mode.

## Occurrence 3 — F-012 : assistance à la qualification fiscale

Une facture de €12 000 pour "rénovation salle de bain" doit être qualifiée : charge déductible (remise en état) ou amortissement (amélioration). L'utilisateur ne connaît pas cette distinction.

Le Question Engine doit :
1. Reformuler la distinction en langage courant (sans jargon fiscal)
2. Proposer des options correspondant à la réalité de l'utilisateur ("J'ai remplacé à l'identique" / "J'ai amélioré")
3. Traiter les réponses incertaines ("Je ne suis pas sûr") avec des questions complémentaires
4. Retourner une qualification (charge ou composant), pas un Field rempli

## Formulation du problème

Dans les trois occurrences, le Question Engine est mobilisé pour quelque chose de différent de "collecter une information manquante" :

| Occurrence | Nature réelle de la demande | Sortie attendue |
|---|---|---|
| F-010 — JUG exposition | Guider un choix fiscal à impact documenté | Jugement confirmé |
| F-011 — Explication contextuelle | Préparer l'utilisateur à comprendre un résultat | Compréhension confirmée |
| F-012 — Qualification fiscale | Aider à classifier une transaction ambiguë | Type de transaction résolu |

Ces trois cas partagent un trait commun : **l'utilisateur ne peut pas répondre sans un contexte que le système doit lui fournir d'abord.** Ce n'est pas une question → réponse. C'est un context → compréhension → choix.

Le contrat actuel du Question Engine suppose que l'utilisateur sait répondre à la question posée. Cette hypothèse n'est plus valide dès qu'une connaissance fiscale est nécessaire pour répondre.

---

# Ce qui se passe sans décision

Sans résolution, le Question Engine continue de poser des questions sans contexte, et l'une de ces situations se produit :

**Scénario A** : l'utilisateur répond au hasard. Il choisit "déductible comme charge" pour une amélioration parce qu'il ne comprend pas la question. La qualification est incorrecte. L'erreur fiscale est intégrée au dossier.

**Scénario B** : l'utilisateur est bloqué. Il ne comprend pas la question et abandonne l'assistant. Le taux de complétion s'effondre.

**Scénario C** : l'Explanation Engine est utilisé en substitution. Il explique après coup pourquoi le choix était incorrect. Ce n'est pas son rôle — et c'est trop tard.

Dans tous les cas, la responsabilité de la "guidance contextuelle" est laissée non assignée ou mal assignée.

---

# Solutions envisagées

## Option A — Laisser ENG-006 inchangé, assigner la guidance à l'Explanation Engine

L'Explanation Engine pourrait être appelé avant le Question Engine pour fournir le contexte, puis ENG-006 poserait sa question habituelle.

**Pro :** ENG-006 reste inchangé

**Con :**
- L'Explanation Engine est actuellement défini comme produisant une explication d'un résultat calculé — il est read-only par nature
- Le séquençage (Explanation puis Question) introduit une dépendance entre Engines que le Workflow devrait orchestrer explicitement
- Dans le cas du Jugement (F-010), il ne s'agit pas d'expliquer un résultat mais de présenter des options — ce n'est pas le rôle de l'Explanation Engine

## Option B — Ajouter un "Mode Guidance" à ENG-006 en complément du Mode Collection

ENG-006 opère selon deux modes :
- **Mode Collection** (actuel) : un Field est manquant → une question est posée → un Field est rempli
- **Mode Guidance** (nouveau) : un Jugement ou une qualification est requise → un contexte est présenté + des options sont exposées → un choix est recueilli et documenté

Les deux modes utilisent la même infrastructure (parle à l'utilisateur, reçoit une réponse, retourne au Workflow Engine).

**Pro :**
- Minimal comme extension — même position dans l'architecture, même interface avec le Workflow
- Le slogan peut évoluer naturellement : "Demander le minimum. Comprendre le maximum."
- Le contrat "ne pas poser une question dont la réponse existe déjà" reste valide en Mode Collection et n'est pas applicable en Mode Guidance (le choix n'existe nulle part avant d'être posé)

**Con :**
- ENG-006 devient plus complexe
- La distinction entre les deux modes doit être claire pour les futurs développeurs

## Option C — Créer un "Guidance Engine" dédié

Un dixième Engine serait ajouté pour la seule mission d'exposition de Jugements et de qualification contextuelle.

**Pro :** séparation stricte des responsabilités

**Con :**
- Un Engine supplémentaire pour trois cas d'usage dont la mécanique est identique à ENG-006
- Le Guidance Engine parlerait à l'utilisateur, recevrait une réponse et retournerait au Workflow — exactement comme ENG-006
- Sur-ingénierie pour un besoin qui est une extension naturelle d'un Engine existant

## Option D — Déléguer la guidance au Workflow Engine

Le Workflow Engine orchestre la séquence context → question en appelant d'abord l'Explanation Engine, puis ENG-006.

**Pro :** aucun Engine modifié

**Con :**
- Le Workflow Engine ne doit pas connaître les contenus de présentation — son rôle est l'état du dossier, pas l'expérience utilisateur
- Introduit de la logique de présentation dans un composant qui doit rester aveugle au métier

---

# Solution recommandée

**Option B — Extension d'ENG-006 par un Mode Guidance.**

### Justification

Les trois occurrences (F-010, F-011, F-012) mobilisent ENG-006 pour la même raison de fond : l'utilisateur doit faire un choix que le système ne peut pas faire à sa place, mais il ne peut pas le faire sans un contexte que le système doit lui fournir. C'est toujours une interaction entre le système et l'utilisateur — c'est toujours ENG-006 qui est en position de la gérer.

Créer un nouvel Engine (Option C) serait justifié si la mécanique était différente. Elle ne l'est pas. Déplacer la responsabilité vers l'Explanation Engine (Option A) ou le Workflow Engine (Option D) confond les rôles de ces composants avec un rôle de médiation utilisateur qui appartient naturellement à ENG-006.

### Structure étendue d'ENG-006

**Mode Collection (inchangé)**
> Déclencheur : le Validation Engine signale un Field manquant
> Protocole : vérifier si l'information existe déjà → peut-elle être déduite ? → calculée ? → si non, poser la question
> Sortie : Field rempli + événement `QUESTION_REPONDUE`

**Mode Guidance (nouveau)**
> Déclencheur : le Workflow Engine émet `GUIDANCE_REQUIRED` avec {jugement_ref, contexte, options, recommandation}
> Protocole :
> 1. Présenter le contexte en langage courant (pas de jargon fiscal)
> 2. Exposer les options avec leurs implications simplifiées
> 3. Signaler la recommandation du système (si elle existe)
> 4. Recueillir le choix de l'utilisateur
> 5. Gérer les réponses incertaines avec des sous-questions contextuelles
> Sortie : {jugement_ref, choix, date_choix} + événement `JUGEMENT_CONFIRME`

**Différence fondamentale entre les deux modes :**

| | Mode Collection | Mode Guidance |
|---|---|---|
| Déclencheur | Validation Engine (Field manquant) | Workflow Engine (choix requis) |
| L'utilisateur sait répondre ? | Oui — il a l'information | Non — il a besoin du contexte |
| Sortie | Field rempli | Jugement documenté |
| Événement | `QUESTION_REPONDUE` | `JUGEMENT_CONFIRME` |
| Tracé dans le dossier ? | Field uniquement | Jugement + contexte + date |

### Sur la traçabilité des Jugements

Un Jugement confirmé en Mode Guidance doit être tracé dans le dossier différemment d'un Field rempli. Il doit porter :
- La référence au Jugement KS (JUG-001, JUG-002…)
- Le choix retenu
- Le contexte présenté à l'utilisateur au moment du choix
- La date de confirmation

Cette traçabilité est fondamentale pour l'explicabilité (un des quatre objectifs de la vision Fiscal AI) et pour la défendabilité en cas de contrôle fiscal.

---

# Conséquences de la décision (si validée)

**Sur ENG-006 :**
- Le slogan évolue vers : *"Demander le minimum. Éclairer quand nécessaire."*
- Le contrat s'étend avec une section "Mode Guidance" documentant le déclencheur, le protocole et la sortie
- Les interdictions du Mode Collection restent inchangées — elles s'appliquent uniquement à ce mode

**Sur le Workflow Engine (ENG-001) :**
- Nouvelle instruction sortante : `GUIDANCE_REQUIRED` avec payload {jugement_ref, contexte, options, recommandation_système}
- Nouveau événement entrant : `JUGEMENT_CONFIRME` avec payload {jugement_ref, choix, date}

**Sur le modèle de données :**
- Une entité `JugementConfirmé` doit être créée, distincte des Fields : {jugement_ref, choix, contexte, date, auteur}
- Cette entité est immuable après confirmation (audit trail fiscal)

**Sur les futurs Assistants :**
- F-013 (Travaux) : la qualification travaux capitalisables vs. déductibles nécessitera Mode Guidance
- F-014 (Résultat fiscal) : la décision d'imputation des déficits reportables nécessitera Mode Guidance (ordre des stocks, optimisation)
- F-015 (Liasse) : validation de cohérence avec déclarations antérieures — Mode Guidance probable

**Sur l'Explanation Engine (ENG-008) :**
- Son rôle reste inchangé : expliquer les résultats calculés
- Il ne présente jamais des options à choisir — c'est le domaine du Mode Guidance

**Ce qui ne change pas :**
- Le Mode Collection d'ENG-006 est identique à la spécification actuelle
- Le protocole "ne pas poser une question dont la réponse existe déjà" reste impératif en Mode Collection
- ENG-006 ne prend jamais la décision à la place de l'utilisateur — en Mode Guidance comme en Mode Collection

---

# Relation entre ADR-001 et ADR-002

Ces deux ADRs répondent à des problèmes différents qui sont apparus ensemble sur les mêmes assistants.

ADR-001 étend la **classification** — qui décide du type d'un objet.
ADR-002 étend l'**interaction** — qui guide l'utilisateur pour qu'il décide.

La relation est indirecte mais réelle : une fois qu'ADR-001 est validé, le Classification Engine peut identifier une ligne comme "ambiguë" (type indéterminable automatiquement). C'est ce signal d'ambiguïté qui déclenche le Mode Guidance d'ENG-006 — lequel présente les options à l'utilisateur pour résoudre l'ambiguïté. Les deux extensions sont complémentaires.

---

# Questions ouvertes avant décision

1. La liste des Jugements susceptibles d'être exposés en Mode Guidance doit-elle être pré-déclarée dans le KS, ou le Mode Guidance peut-il être déclenché sur n'importe quel JUG ?
2. Un utilisateur peut-il revenir sur un Jugement confirmé ? Si oui, selon quelles conditions (impact sur le dossier déjà calculé) ?
3. La recommandation système en Mode Guidance est-elle toujours obligatoire, ou peut-elle être omise pour les Jugements où aucune option n'est objectivement préférable ?
