---
id: ENG-009
title: Mission Engine
type: engine
status: draft
version: "1.0"
created: 2026-07-05
updated: 2026-07-05
owner: product-owner
tags: [engine, mission-engine, priorisation, dossier]
depends_on:
  hard: [TRF-0033, ADR-006]
  soft: [ENG-001, ENG-005, ENG-006, STATE-001]
---

# ENG-009 — Mission Engine

---

# Mission

Le Mission Engine détermine, pour un Dossier, l'unique Mission active à communiquer maintenant.

Il n'exécute qu'une seule Transformation. Il ne prend jamais de décision métier.

---

# Pourquoi cet Engine existe

Un Dossier peut présenter simultanément plusieurs signaux concurrents : une anomalie du Validation Engine, une question en attente du Question Engine, une inactivité prolongée, ou simplement son état courant. Aucun Engine existant ne peut arbitrer entre ces signaux sans violer son propre contrat :

- le Workflow Engine (ENG-001) ne prend jamais de décision métier et ne parle jamais directement à l'utilisateur ;
- le Question Engine (ENG-006) ne décide jamais de la suite — il traite un signal déjà qualifié, il n'arbitre pas entre plusieurs signaux hétérogènes ;
- le Validation Engine (ENG-005) signale des anomalies mais ne les priorise jamais entre elles ni face à d'autres catégories de signaux.

Cette analyse complète, avec les options rejetées et leurs raisons, est documentée dans [[ADR-006 — Introduction du Mission Engine]]. Elle n'est pas répétée ici.

---

# Responsabilité unique

Exécuter [[TRF-0033 – Priorisation de la Mission active du Dossier]] pour un Dossier donné, et publier son résultat.

Rien d'autre.

---

# Connaissances exécutées

Le Mission Engine repose sur trois objets du Knowledge System, chacun avec un rôle distinct et non interchangeable :

| Objet | Rôle | Exécuté par le Mission Engine ? |
|---|---|---|
| [[TRF-0033 – Priorisation de la Mission active du Dossier]] | La logique métier exécutable : entrées, gardes, table de correspondance, sorties | **Oui — c'est la seule chose que le Mission Engine exécute.** |
| [[DEC-001 – Politique de priorisation des Missions]] | Paramètre TRF-0033 (ordre de priorité, seuil d'inactivité, périmètre de la relance) | Non. DEC-001 a déjà été appliquée au moment où TRF-0033 a été rédigée. Le Mission Engine ne consulte jamais DEC-001 à l'exécution — il exécute TRF-0033, qui encode déjà ses choix. |
| [[RAI-015 – Séquence d'arbitrage de la Mission active]] | Justifie l'ordre des étapes de TRF-0033 — documente *pourquoi* cet ordre | Jamais. Un Raisonnement n'est jamais exécuté, dans aucun Engine du Knowledge System (cf. Ontologie, RAI-013/TRF-0012). Le Mission Engine ne lit pas RAI-015 à l'exécution. |

Si TRF-0033 est un jour révisée (nouveau seuil, nouvel ordre), le Mission Engine n'est pas modifié : il continue d'exécuter "la" Transformation, quelle que soit sa version approuvée.

---

# Interdictions

Le Mission Engine ne doit jamais :

- modifier l'état du Dossier (autorité exclusive du Workflow Engine, ENG-001) ;
- choisir ou exécuter une Rule autre que TRF-0033 ;
- créer, formuler ou poser une question à l'utilisateur (autorité exclusive du Question Engine, ENG-006) ;
- calculer, qualifier ou requalifier une anomalie (autorité exclusive du Validation Engine, ENG-005) ;
- calculer une priorité métier par lui-même — la priorité est un résultat de TRF-0033, jamais une logique propre au Mission Engine ;
- exécuter un Raisonnement (RAI-015 est documentaire, jamais interprété à l'exécution) ;
- prendre ou modifier une Decision (DEC-001 est un arbitrage figé, validé par le Product Owner avant que TRF-0033 n'existe) ;
- déclencher un autre Engine (seul le Workflow Engine déclenche des Engines, KS-ENG §3.1) ;
- décider, seul, si sa sortie doit provoquer une transition du Dossier.

---

# Entrées

Identiques aux `entrées` de TRF-0033 — aucun identifiant nouveau :

| Entrée | Field | Produit par |
|---|---|---|
| Statut du Dossier | FIELD-037 | Workflow Engine |
| Nombre d'anomalies | FIELD-046 | Validation Engine |
| Signal de question ou Jugement en attente | FIELD-090 | Question Engine |
| Dernière mise à jour du Dossier | FIELD-036 | Système |

Le Mission Engine ne connaît ni le Workflow Engine, ni le Question Engine, ni le Validation Engine (KS-ENG §3.3, séparation des connaissances) — il connaît uniquement ces Fields, tels que définis par ses futurs Contracts.

---

# Sorties

- **Mission active** (ENT-013), portée par FIELD-091 à FIELD-097 : catégorie, priorité, justification, responsable, éléments bloquants, action recommandée, date de calcul — identiques aux `sorties` de TRF-0033.
- **Événement émis** : `MISSION_CALCULEE` (EVT-001), à double audience conformément à KS-ENG §3.7 :
  - le Workflow Engine, qui peut le consommer à titre informatif, sans qu'aucune transition d'état n'en découle nécessairement ;
  - tout composant informatif (Dashboard, notification, e-mail, assistant conversationnel, API…), qui l'affiche sans jamais déclencher d'Engine ni modifier une donnée.
- **Observations produites** : aucune. Le Mission Engine ne produit pas d'Observation au sens de RT-001 — il ne lit aucun document, il ne fait aucune extraction. Cette section du template ne s'applique pas ici.

---

# Dépendances

## Déclenchement

Le Mission Engine est déclenché exclusivement par le Workflow Engine (KS-ENG §3.1). Il ne se déclenche jamais lui-même et n'est jamais déclenché par le Question Engine ou le Validation Engine directement.

## Lecture

Le Mission Engine lit, sans jamais les modifier, les Fields produits par le Workflow Engine, le Validation Engine et le Question Engine (cf. Entrées).

## Contracts à formaliser (hors périmètre de ce document)

Aucun Contract (CTR-xxx) n'existe encore pour le Mission Engine, comme aucun n'existe aujourd'hui pour les huit Engines existants (ARCH-001 §5 les liste comme nécessaires, pas comme rédigés). Trois Contracts seront à écrire selon KS-CTR, au même titre que ceux déjà identifiés pour les autres Engines :
- Workflow Engine ↔ Mission Engine (déclenchement, lecture de l'état)
- Validation Engine ↔ Mission Engine (lecture des anomalies)
- Question Engine ↔ Mission Engine (lecture des signaux en attente)

La relation entre le Mission Engine et un composant informatif n'est pas un Contract mais une Constraint (KS-CTR §2, obligation unilatérale) — déjà établi par KS-ENG §3.7.

---

# Contrat

Le Mission Engine ne possède aucune connaissance métier propre.

Il ne possède aucune logique de priorisation qui ne soit déjà dans TRF-0033.

Il ne possède aucune logique d'interface ni de présentation.

Sa seule responsabilité est :

**exécuter TRF-0033 pour un Dossier donné, et publier la Mission qui en résulte.**

---

# Exemple

Signaux du Dossier :

`nombre_anomalies = 0`, `question_en_attente` absent, `statut_dossier = BIEN_COMPLETE`, `derniere_mise_a_jour` = il y a 20 jours

↓

Déclenchement par le Workflow Engine

↓

Exécution de TRF-0033 (aucune anomalie, aucune question, BIEN_COMPLETE éligible à la relance selon DEC-001, inactivité ≥ 14 jours)

↓

Sortie : `mission_active = relancer_client`, `priorité = 3`, `responsable = client`

↓

Émission de `MISSION_CALCULEE`, consommé par le Workflow Engine (à titre informatif) et par le Dashboard (affichage)

---

# Critères d'acceptation

Le Mission Engine est conforme lorsque :

✓ il n'exécute que TRF-0033, jamais une autre Rule ;

✓ il ne contient aucune logique de priorisation qui ne soit pas déjà dans TRF-0033 ;

✓ il ne modifie jamais l'état du Dossier, ni aucune donnée métier en dehors de la Mission qu'il publie ;

✓ il ne déclenche jamais un autre Engine ;

✓ sa sortie est reproductible : à signaux identiques, la même Mission est toujours produite ;

✓ son événement est consommable simultanément par le Workflow Engine et par un composant informatif, sans hiérarchie ni contradiction, conformément à KS-ENG §3.7.

---

# Ce que Claude Code ne doit jamais faire

- Ajouter une règle de priorité qui ne soit pas déjà écrite dans TRF-0033.
- Faire lire ou interpréter RAI-015 ou DEC-001 par le Mission Engine à l'exécution.
- Faire poser une question par le Mission Engine.
- Faire modifier une anomalie ou un état de Dossier par le Mission Engine.
- Faire déclencher un autre Engine par le Mission Engine.
- Inventer une nouvelle catégorie de Mission, un nouveau responsable ou un nouveau seuil qui ne soit pas déjà défini dans TRF-0033/DEC-001.

---

# Vérification de cohérence

**ENG-001** — inchangé. Le Mission Engine ne lui retire ni ne lui ajoute aucune autorité sur les transitions du Dossier.

**ARCH-001** — n'inclut pas encore le Mission Engine dans son flux ni sa matrice d'interaction, et c'est cohérent : ARCH-001 décrit le pipeline interne du Dossier ; le Mission Engine n'orchestre rien, il observe (ADR-006 §6 le documente déjà). Aucune mise à jour d'ARCH-001 n'est faite ici, faute de besoin réel constaté — conformément à DIR-001.

**KS-CTR** — la relation avec les canaux informatifs est qualifiée de Constraint, pas de Contract, conformément à la définition même de KS-CTR (obligation unilatérale). Les Contracts bilatéraux restants sont notés comme travail futur, pas comme un défaut de ce document.

**ENGINE_INTERACTION_STANDARDS v1.2** — respecté point par point : direction unique (§3.1), communication par événement (§3.2), séparation des connaissances (§3.3), responsabilité unique (§3.5), et §3.7 (audience informative), qui est la clause sans laquelle ce document contredirait le Standard.

**ADR-006** — aucune contradiction. Ce document ne réécrit pas l'analyse d'ADR-006 (options rejetées, justification du choix) — il la référence et en tire uniquement le contrat opérationnel.

---

# Design Review de ce document

Recherche active de défauts avant de le considérer terminé :

- **Responsabilité redondante ?** Aucune trouvée. Le Mission Engine ne fait rien que TRF-0033 ne fasse déjà, et rien que les autres Engines fassent.
- **Logique métier cachée ?** Aucune trouvée. Aucune règle de priorité, aucun seuil, aucune catégorie de Mission n'est énoncée ici sans être une citation directe de TRF-0033.
- **Duplication avec ADR-006 ?** Écartée délibérément : la section "Pourquoi cet Engine existe" renvoie à ADR-006 sans répéter son analyse ; ce document ne contient ni options rejetées, ni justification de choix — seulement le contrat qui en résulte.
- **Dépendance manquante ?** Une trouvée et traitée avant rédaction : `MISSION_CALCULEE` et le Mission Engine ne figuraient pas dans EVT-001. Enregistrement mécanique effectué, aucune nouvelle connaissance introduite.
- **Nouvelle connaissance introduite par erreur ?** Aucune trouvée après relecture : chaque affirmation de ce document est traçable vers TRF-0033, DEC-001, RAI-015, ADR-006, KS-ENG ou EVT-001.
