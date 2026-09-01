---
id: ADR-005
title: Introduction du Relationship Engine
type: adr
status: deprecated
version: "1.0"
created: 2026-07-05
updated: 2026-07-05
owner: product-owner
tags: [adr, relationship-engine, workflow-engine, dashboard, guidage, architecture]
triggers: [MISSION-020]
engines_concernés: [ENG-001, ENG-006, ENG-008, ENG-009 (proposé)]
adr_liée: [ADR-002]
superseded_by: ADR-006
---

# ADR-005 — Introduction du Relationship Engine

---

# Statut

🔴 **Remplacée par [[ADR-006 — Introduction du Mission Engine]].**

Le diagnostic du problème posé par cette ADR (aucun Engine existant ne peut arbitrer entre plusieurs signaux concurrents pour décider ce qui doit être communiqué au client) reste valide et a été repris intégralement dans ADR-006.

Son abstraction, en revanche, était prématurée : le "Relationship Engine" proposait un arbitrage à l'échelle de la relation client — un agrégat trans-Dossier, trans-saison, qui n'a aujourd'hui aucune existence dans le modèle de données du Knowledge System. Une revue d'architecture ultérieure a montré qu'un moteur scopé au Dossier — comme tous les Engines existants — résout le même besoin sans exiger cette extension prématurée du modèle. Ce moteur corrigé, nommé Mission Engine, fait l'objet d'ADR-006.

Ce document est conservé pour traçabilité, conformément à KS-004. Il ne doit plus être utilisé comme référence de conception — se reporter à ADR-006.

---

# Contenu original (archivé)

*Le contenu ci-dessous est conservé tel qu'il a été rédigé initialement, à titre de trace historique de la réflexion. Il ne reflète plus la décision retenue.*

---

# Contexte

Mission #020 formalise une évolution de la vision produit déjà engagée avec [[UXP-003 — Le principe de guidage]] et [[UXP-004 — Le Dashboard]] : Fiscal AI n'est plus pensé comme un logiciel de déclaration mais comme un assistant patrimonial qui pilote le dossier à la place du client.

Cette vision impose sept principes directeurs :

1. Fiscal AI reprend toujours la conversation là où elle s'est arrêtée.
2. Le client ne décide jamais de la prochaine étape.
3. Fiscal AI décide de ce qui est le plus utile à faire maintenant.
4. Une seule décision est proposée à la fois.
5. Fiscal AI explique toujours pourquoi cette étape est importante.
6. Le client ne pilote jamais le système ; Fiscal AI pilote le dossier.
7. Le langage naturel vient après la décision, jamais avant.

Ces principes sont déjà présents dans le KS, mais uniquement sous forme d'**intention produit**, pas d'**architecture**. UXP-004 le dit explicitement : *"Il ne décrit pas une interface. Il décrit une intention."*

---

# Problème

Aucun composant existant de l'architecture (ARCH-001) n'a la responsabilité de calculer "quelle est l'unique prochaine action utile, maintenant, et pourquoi" à l'échelle de la relation client entière.

Les trois composants qui s'en approchent ont chacun un périmètre plus étroit, et leur contrat actuel leur interdit explicitement de l'assumer :

## Workflow Engine (ENG-001)

Orchestre la progression d'**un dossier** selon une machine à états déterministe (DOSSIER_CREE → ... → DOSSIER_TERMINE). Son contrat lui interdit formellement d'interpréter une règle métier ou de poser une question à l'utilisateur. Il n'a aucune notion de saison fiscale, d'historique d'interactions, ni de relation qui dépasse le cycle de vie d'un dossier unique. Une fois DOSSIER_TERMINE atteint, il n'a rien à dire sur "que faire l'année prochaine".

## Question Engine (ENG-006, étendu par ADR-002 en attente)

Répond à un signal déjà qualifié : un Field manquant (Mode Collection) ou un Jugement à exposer (Mode Guidance, ADR-002). Il ne décide jamais *si* on doit parler au client maintenant, ni *lequel*, parmi plusieurs signaux concurrents (une question en attente, une relance de saison, une anomalie), doit primer. Son contrat l'interdit explicitement : *"Le moteur ne décide jamais de la suite."*

## Dashboard (UXP-004)

Décrit la structure attendue de la décision (*situation → raison → action → suite*) pour chacun des 7 états du dossier, mais ne décrit aucun mécanisme de calcul. Dans l'état actuel du KS, rien n'empêche que cette logique de priorisation soit codée en dur, séparément, dans chaque canal qui voudrait l'exprimer (Dashboard web aujourd'hui, notification email demain, assistant conversationnel patrimonial après-demain).

## Formulation du problème

Les sept principes de Mission #020 s'appliquent à *toute la relation client*, potentiellement au-delà d'un seul dossier, d'une seule saison, ou d'un seul canal. Aucun composant actuel n'a cette portée. Sans décision, cette responsabilité sera assumée implicitement — et divergera selon qui l'écrit.

---

# Ce qui se passe sans décision

**Scénario A** — La logique de priorisation ("quoi montrer sur le Dashboard aujourd'hui") est codée directement dans le composant Dashboard du projet Next.js. Le jour où un canal de notification (email, push) doit exprimer la même priorité, le développeur duplique la logique ou la réécrit différemment. Les deux canaux divergent silencieusement : le client reçoit un email qui ne correspond plus à ce que dit le Dashboard.

**Scénario B** — Le Workflow Engine est étendu de facto pour "aussi" décider ce qu'on dit au client, parce que c'est le composant qui a le plus de visibilité sur l'état du dossier. Son contrat ("aucune décision métier", "ne parle jamais directement à l'utilisateur") est violé progressivement, sans jamais être formellement révisé — exactement le type de dette que RT-002 documente déjà pour le pipeline Acquisition.

**Scénario C** — Chaque futur Assistant réimplémente sa propre logique de "que faire ensuite" en sortie, sans arbitrage global. Deux Assistants peuvent alors, le même jour, chacun légitimement vouloir être "la prochaine action" — et rien ne tranche.

Dans les trois cas, le principe #4 de Mission #020 ("une seule décision proposée à la fois") devient impossible à garantir de façon fiable, car aucun point unique du système n'a l'autorité et la vue d'ensemble nécessaires pour trancher.

---

# Solutions envisagées

## Option A — Laisser la logique dans la couche présentation (Dashboard / code applicatif)

**Pro :** rien à créer dans le KS immédiatement.

**Con :**
- Contredit directement le principe fondamental du KS ("le code n'est jamais la source de vérité") : la priorisation entre plusieurs types d'actions candidates est une règle métier/produit, pas un détail d'implémentation.
- Se duplique nécessairement dès qu'un deuxième canal (notification, futur assistant conversationnel) doit exprimer la même priorité.
- Rend l'arbitrage invisible et non auditable — impossible à expliquer a posteriori pourquoi telle action a été proposée plutôt qu'une autre.

## Option B — Étendre le Workflow Engine pour qu'il décide aussi "quoi dire au client"

**Pro :** aucun nouveau composant.

**Con :**
- Contredit frontalement le contrat actuel d'ENG-001 : *"Il ne prend jamais de décision métier"*, *"Ne pose jamais une question à l'utilisateur directement"*.
- Le Workflow Engine raisonne à l'échelle d'un dossier. Le besoin de Mission #020 raisonne à l'échelle de la relation (plusieurs dossiers, plusieurs saisons, reprise après abandon). Ce sont deux échelles de temps et de portée différentes — les confondre romprait la responsabilité unique qui fait la force du modèle ENG-001 à ENG-008.

## Option C — Absorber ce besoin dans le Question Engine (déjà étendu en Mode Guidance par ADR-002)

**Pro :** un seul point de contact avec l'utilisateur existe déjà.

**Con :**
- ENG-006 répond à un signal déjà qualifié et unique (*"un Field manquant"*, *"un Jugement à exposer"*). Il ne sait pas arbitrer entre plusieurs signaux hétérogènes et concurrents (une question en attente vs une relance de saison vs une anomalie de dossier vs rien à faire). C'est une différence de nature — arbitrer *entre* des sollicitations n'est pas la même chose que traiter *une* sollicitation qualifiée.
- Confondrait "comment poser la question retenue" (ENG-006) avec "quelle question/action retenir parmi toutes les candidates possibles" (nouveau besoin).

## Option D — Créer un Engine dédié : le Relationship Engine (ENG-009)

Un nouvel Engine dont l'unique responsabilité est : **à tout instant, décider de l'unique prochaine action la plus utile pour le client, l'expliquer, et permettre la reprise exacte de la conversation.**

**Pro :**
- Cohérent avec le pattern déjà en place : un Engine = une responsabilité unique (cf. ARCH-001 §2). Les huit Engines actuels sont chacun mono-responsabilité ; ce besoin en révèle une neuvième, distincte de toutes les autres.
- Réutilisable par construction : le Dashboard, une future notification, un futur assistant conversationnel patrimonial consomment tous la même décision, produite au même endroit.
- Rend l'arbitrage traçable et explicable (obligation C12 de l'Ontologie — *"toute exécution produit un journal"*) : on peut relire pourquoi telle action a été proposée à telle date plutôt qu'une autre.
- S'aligne avec la vision (Vision.md) : Fiscal AI comme "copilote patrimonial" dépasse par nature le périmètre d'un seul dossier LMNP — ce moteur est le premier composant architectural pensé pour cette portée élargie, sans attendre l'extension du domaine métier.

**Con :**
- Nouveau composant, donc nouveaux contrats à écrire (Workflow Engine ↔ Relationship Engine, Question Engine ↔ Relationship Engine, Validation Engine ↔ Relationship Engine).
- Nécessite des connaissances nouvelles absentes du KS actuel : un calendrier/une saisonnalité fiscale formalisée, un historique d'interactions client. Sans ces briques, le Relationship Engine n'a rien à arbitrer.

---

# Solution recommandée

**Option D — Créer le Relationship Engine (ENG-009).**

## Justification

Les trois options qui évitent de créer un nouveau composant (A, B, C) demandent toutes de faire porter cette responsabilité à un composant dont le contrat l'interdit explicitement, ou dont l'échelle de raisonnement ne correspond pas au besoin. Ce n'est pas un cas limite interprétable : ENG-001 dit noir sur blanc *"ne prend jamais de décision métier"* et *"ne pose jamais une question directement"* ; ENG-006 dit *"ne décide jamais de la suite"*. Le besoin de Mission #020 est précisément *décider de la suite*, à une échelle qui dépasse le dossier.

Créer un Engine séparé n'est pas une sur-ingénierie ici (contrairement à l'Option C rejetée dans ADR-002 pour un cas où la mécanique était identique à un Engine existant) : la mécanique est différente. Le Relationship Engine n'exécute rien lui-même — il n'interroge pas de document, ne calcule rien, ne pose pas de question. Il **arbitre** entre des signaux produits par d'autres Engines et **décide lequel mérite l'attention du client maintenant**. Aucun Engine existant ne fait cela.

## Mission proposée d'ENG-009 — Relationship Engine

> Décider, à tout instant de la relation avec le client, de l'unique prochaine action la plus utile, l'expliquer en langage naturel, et garantir la reprise exacte de la conversation là où elle s'est arrêtée.

## Responsabilités

- Collecter les signaux candidats émis par les autres Engines et par le calendrier fiscal :
  - état du dossier courant (Workflow Engine) ;
  - question ou Jugement en attente (Question Engine, Mode Collection / Mode Guidance) ;
  - anomalie signalée (Validation Engine) ;
  - échéance ou changement de saison fiscale (nouvelle connaissance à formaliser) ;
  - absence d'activité récente du client (relance).
- Arbitrer entre ces signaux selon une politique de priorité explicite et documentée dans le KS (pas dans le code).
- Produire une **Directive de mission** unique : {action retenue, raison en langage naturel, actions secondaires en retrait, point de reprise exact}.
- Garantir qu'un seul signal est retenu à la fois (principe #4).
- Ne jamais exécuter lui-même l'action retenue — il délègue toujours au moteur compétent (Workflow, Question, Calculation, Explanation).

## Hors périmètre (interdictions, sur le modèle des Engines existants)

Le Relationship Engine ne doit jamais :
- calculer une valeur fiscale ;
- poser lui-même une question à l'utilisateur (il délègue à ENG-006) ;
- modifier l'état du dossier (il délègue à ENG-001) ;
- interpréter une règle métier fiscale ;
- présenter plusieurs actions de poids équivalent.

## Relation avec les composants existants

| Composant | Relation avec ENG-009 |
|---|---|
| Workflow Engine (ENG-001) | Fournit l'état du dossier comme signal d'entrée. Ne reçoit aucune instruction en retour — sa machine à états reste inchangée et autonome. |
| Question Engine (ENG-006) | Fournit les questions/Jugements en attente comme signaux candidats. Reçoit l'ordre d'exécution si son signal est retenu. |
| Validation Engine (ENG-005) | Fournit les anomalies comme signaux candidats. |
| Dashboard (UXP-004) | Devient un pur consommateur de la Directive de mission produite par ENG-009. UXP-004 n'a plus à décrire de logique de priorisation implicite — uniquement l'affichage de la Directive. |
| UXP-003 (principe de guidage) | Passe du statut de principe UX à celui de contrat vérifiable : les Règles 1 à 5 deviennent des critères d'acceptation testables sur la sortie d'ENG-009. |

---

# Conséquences de la décision (si validée)

**Sur le Knowledge System :**
- Un nouveau document ENG-009 doit être rédigé selon TEMPLATE - ENGINE, en statut `draft`.
- ARCH-001 doit être mis à jour : nouvelle ligne dans la matrice d'interaction, nouveau composant dans le flux du dossier (ou flux parallèle "relation" hors du flux "dossier").
- De nouvelles connaissances doivent être créées, absentes aujourd'hui du KS :
  - un **Savoir** formalisant le calendrier/la saisonnalité fiscale (dates d'ouverture/clôture de la déclaration LMNP) ;
  - une **Entité** "Historique d'interactions" ou extension d'ENT-002 (Dossier) / ENT-012 (Utilisateur) pour tracer le dernier point de reprise.
- Une politique de priorisation entre signaux concurrents doit être documentée explicitement dans le KS (probablement comme un Raisonnement, RAI-xxx) — pas laissée à l'implémentation.

**Sur le Runtime :**
- RT-002 (Runtime Adapter) devra, le moment venu, documenter l'écart entre ce nouveau concept et l'état actuel du code Next.js (aujourd'hui : aucune notion de Directive de mission n'existe dans le pipeline).

**Ce qui ne change pas :**
- Aucun contrat existant d'ENG-001 ou ENG-006 n'est modifié dans son cœur — ENG-009 les consomme sans les altérer.
- Le principe "le code n'est jamais la source de vérité" continue de s'appliquer : la politique d'arbitrage sera documentée dans le KS avant toute implémentation.

---

# Questions ouvertes avant décision

1. Le Relationship Engine doit-il être conçu dès le MVP LMNP, ou peut-il être différé tant qu'un seul dossier/canal existe (auquel cas Option A est temporairement tolérable, à condition d'être documentée comme dette explicite) ?
2. La politique de priorisation entre signaux concurrents (question en attente vs relance de saison vs anomalie) doit-elle être une simple hiérarchie fixe, ou nécessite-t-elle un Raisonnement (RAI) à part entière avec des règles de préemption ?
3. Le calendrier fiscal (saisonnalité) est-il un Savoir unique et durable, ou varie-t-il assez (règles fiscales changeantes) pour mériter son propre cycle de validation annuel ?
4. La "Directive de mission" doit-elle être un concept de premier niveau dans l'Ontologie (un septième concept, à côté d'Axiome/Savoir/Jugement/Raisonnement/Transformation/Vérification), ou reste-t-elle un objet purement applicatif hors ontologie ?
