---
id: ADR-006
title: Introduction du Mission Engine
type: adr
status: pending-decision
version: "1.0"
created: 2026-07-05
updated: 2026-07-05
owner: product-owner
tags: [adr, mission-engine, workflow-engine, question-engine, transformation, architecture]
triggers: [MISSION-020]
engines_concernés: [ENG-001, ENG-005, ENG-006, ENG-009]
adr_liée: [ADR-002]
supersedes: [ADR-005]
---

# ADR-006 — Introduction du Mission Engine

---

# Statut

🟡 **En attente de décision** — ADR soumise à la validation du Product Owner. Aucune modification du code n'est effectuée à ce stade.

Cette ADR **remplace ADR-005** (Introduction du Relationship Engine). Le problème identifié par ADR-005 était réel, mais son abstraction — un moteur arbitrant à l'échelle de la relation client, au-delà du Dossier — était prématurée. La présente ADR corrige le périmètre : le moteur proposé ici opère à l'échelle du Dossier, comme tous les Engines existants, et non à l'échelle d'une relation client qui n'a pas d'existence formelle dans le modèle de données actuel. ADR-005 passe en statut `deprecated`, avec `superseded_by: ADR-006`.

---

# 1. Le problème

## 1.1 Ce que le produit exige déjà

Les principes de guidage de Fiscal AI (UXP-003) imposent quatre contraintes déjà validées à la couche produit :

- chaque écran doit répondre à trois questions — où suis-je, qu'a-t-on fait, quelle est la prochaine action (Règle 1) ;
- une seule action est mise en avant à la fois, jamais plusieurs de poids équivalent (Règle 3) ;
- un résultat n'est jamais une fin, toujours le début d'une étape suivante (Règle 4) ;
- le Dashboard doit toujours afficher une action prioritaire unique, jamais un état neutre sans action associée (UXP-004).

Ces règles supposent qu'il existe, à tout instant, **une réponse unique et déterministe** à la question : *"qu'est-ce qui est le plus utile pour ce dossier, maintenant, et pourquoi ?"* Aucun composant de l'architecture actuelle (ARCH-001) ne produit cette réponse.

## 1.2 Le problème concret

Un Dossier peut légitimement se trouver, au même instant, dans plusieurs situations concurrentes : une question du Question Engine reste sans réponse, le Validation Engine a signalé une anomalie, le Workflow Engine attend un document, et aucune interaction n'a eu lieu depuis plusieurs jours. Ces signaux ne s'excluent pas mutuellement — ils coexistent. Rien dans l'architecture actuelle ne les met en concurrence pour désigner lequel doit retenir l'attention du client.

Sans arbitrage explicite, deux risques se matérialisent nécessairement :

- **Divergence entre canaux.** Si chaque canal (Dashboard aujourd'hui, notification ou assistant conversationnel demain) construit sa propre logique de priorité, deux canaux peuvent présenter deux priorités différentes le même jour pour le même Dossier — ce qui contredit directement la promesse produit que Fiscal AI pilote le dossier à la place du client.
- **Décision non traçable.** Sans composant dédié, l'arbitrage se fait implicitement, dans le code d'un canal de présentation, sans obligation de trace (C12 de l'Ontologie) ni possibilité d'auditer pourquoi telle priorité a été retenue à telle date.

## 1.3 Pourquoi aucun Engine existant ne peut légitimement porter cette responsabilité

Ce n'est pas un manque d'implémentation — c'est une impossibilité contractuelle, démontrable engine par engine.

**Workflow Engine (ENG-001)** ne peut pas l'assumer. Son contrat l'interdit explicitement :

> *"Il ne prend jamais de décision métier."*
> *"Ne pose jamais une question à l'utilisateur directement."*
> *"Sa seule responsabilité est : déterminer quel moteur doit intervenir ensuite."*

Le Workflow Engine connaît l'état du Dossier, mais son autorité se limite à décider quel Engine exécuter ensuite dans le pipeline — jamais à arbitrer entre plusieurs signaux hétérogènes pour décider ce qui doit être communiqué au client.

**Question Engine (ENG-006)**, y compris étendu en Mode Guidance par ADR-002, ne peut pas l'assumer. Son contrat le dit explicitement : *"Le moteur ne décide jamais de la suite."* Il sait poser une question déjà qualifiée comme prioritaire — il ne sait pas si cette question doit primer sur une anomalie de Validation Engine ou sur une inactivité prolongée.

**Validation Engine (ENG-005)** signale des anomalies mais ne les priorise jamais entre elles ni face à d'autres catégories de signaux — ce n'est pas son rôle, qui se limite à *"vérifier la cohérence des données"*.

**Explanation Engine (ENG-008)** explique un résultat déjà calculé ; il ne présente jamais un choix entre plusieurs situations candidates et n'a aucune autorité d'arbitrage.

Aucun des huit Engines existants ne peut assumer cette responsabilité sans que son propre contrat soit violé. Le problème est donc réel, démontré par les textes eux-mêmes, et non résolu par l'architecture actuelle.

---

# 2. Options envisagées

## Option A — Ne rien créer, laisser la priorisation à la couche de présentation

Chaque canal (Dashboard, notification future) implémente sa propre logique pour décider quoi afficher.

**Avantages :** aucun développement immédiat, aucune nouvelle connaissance à documenter.

**Inconvénients :**
- Contredit le principe fondateur du Knowledge System : la priorisation entre plusieurs types d'actions candidates est une règle métier/produit, pas un détail d'implémentation — elle ne doit jamais vivre uniquement dans le code d'un canal.
- Se duplique nécessairement dès qu'un deuxième canal doit exprimer la même priorité, avec un risque de divergence silencieuse entre eux.
- Rend l'arbitrage non auditable : impossible d'expliquer a posteriori pourquoi telle action a été proposée plutôt qu'une autre.

**Raison du rejet :** viole directement la Règle d'or du projet — le code ne peut pas être la source de vérité d'une règle métier.

## Option B — Étendre le Workflow Engine

Faire porter au Workflow Engine la décision de ce qui doit être communiqué au client, puisqu'il connaît déjà l'état du Dossier.

**Avantages :** aucun nouveau composant ; le Workflow Engine a déjà la vue la plus large sur l'état du Dossier.

**Inconvénients :**
- Contredit frontalement son contrat : *"Il ne prend jamais de décision métier"*, *"ne pose jamais une question à l'utilisateur directement"*. Décider qu'une anomalie prime sur une question en attente est une décision métier/produit, pas une transition d'état déterministe.
- Romprait la garantie que le KS protège explicitement pour cet Engine — *"toutes les transitions sont déterministes"* — en lui ajoutant une responsabilité d'arbitrage qui n'a rien à voir avec la progression du pipeline documentaire.

**Raison du rejet :** ferait porter à un Engine une responsabilité que son propre contrat interdit, affaiblissant la garantie de déterminisme qui fait la valeur du Workflow Engine.

## Option C — Étendre le Question Engine

Puisque le Question Engine, étendu par ADR-002, gère déjà la médiation avec l'utilisateur (Mode Collection et Mode Guidance), lui confier également l'arbitrage entre plusieurs signaux candidats.

**Avantages :** un seul point de contact conversationnel avec l'utilisateur existerait.

**Inconvénients :**
- ENG-006 répond à un signal déjà qualifié et unique — *"un Field manquant"*, *"un Jugement à exposer"*. Il ne sait pas, et son contrat ne prévoit pas, d'arbitrer entre des signaux hétérogènes et concurrents (une question en attente, une anomalie, une inactivité prolongée).
- Confondrait deux natures différentes de travail : *"comment poser la question retenue"* (ENG-006) et *"laquelle, parmi toutes les candidates, mérite d'être retenue"* (le besoin actuel). Ce n'est pas une différence de degré, c'est une différence de nature.

**Raison du rejet :** étendre ENG-006 à ce rôle romprait la responsabilité unique qui rend son contrat lisible, pour un besoin de nature différente de celui qu'il sert déjà.

## Option D — Étendre le Validation Engine

Puisque le Validation Engine détecte déjà des anomalies, susceptibles d'être l'un des signaux les plus urgents, lui confier l'arbitrage global.

**Avantages :** l'anomalie est souvent le signal le plus critique ; ce moteur y est déjà sensibilisé.

**Inconvénients :**
- Le Validation Engine *"vérifie la cohérence des données"* — il ne connaît ni les questions en attente du Question Engine, ni l'état du Workflow, ni le temps écoulé depuis la dernière interaction. Étendre son périmètre à ces dimensions reviendrait à lui faire absorber la connaissance de tous les autres Engines, ce qu'aucun Engine actuel ne fait (règle 3.3 de KS-ENG : *"un Engine ne connaît jamais un autre Engine"*).

**Raison du rejet :** demanderait au Validation Engine de connaître des signaux hors de son périmètre contractuel, violant la séparation des connaissances déjà en vigueur.

## Option E — Créer un neuvième Engine dédié : le Mission Engine

Un Engine dont l'unique responsabilité est d'exécuter une Transformation qui arbitre entre les signaux disponibles pour un Dossier donné, et de produire une Mission unique, priorisée et justifiée.

**Avantages :**
- Cohérent avec le pattern déjà en vigueur dans l'architecture : un Engine = une responsabilité unique (KS-ENG §3.5). Les huit Engines actuels sont chacun mono-responsabilité ; ce besoin en révèle une neuvième, distincte de toutes les autres.
- Ne nécessite l'extension d'aucun contrat existant : Workflow Engine, Question Engine, Validation Engine restent inchangés, chacun continuant de produire exactement ce qu'il produit déjà.
- Rend l'arbitrage traçable et explicable, conformément à l'obligation C12 de l'Ontologie (*"toute exécution produit un journal"*).
- Réutilisable par construction : tout canal futur (Dashboard, notification, assistant conversationnel) consomme la même Mission, produite au même endroit, sans dupliquer la logique de priorité.

**Inconvénients :**
- Nécessite un nouveau composant, donc de nouveaux Contracts à documenter (Workflow Engine ↔ Mission Engine, et les relations de lecture avec Question Engine et Validation Engine).
- Nécessite une nouvelle Transformation, absente du Knowledge System aujourd'hui, ainsi que le Raisonnement qui la justifie.

**Raison de la sélection :** c'est la seule option qui ne demande à aucun Engine existant de violer son propre contrat, et la seule qui préserve la responsabilité unique de chacun des huit Engines actuels.

---

# 3. Décision

**Créer un neuvième Engine : le Mission Engine (ENG-009).**

## Objectif

Déterminer, à tout instant, l'unique Mission la plus utile pour un Dossier donné, l'exprimer avec sa priorité et sa justification, et la mettre à disposition de tout canal de communication avec le client.

## Responsabilité unique

Le Mission Engine collecte les signaux disponibles pour un Dossier (état du Workflow Engine, question ou Jugement en attente du Question Engine, anomalie du Validation Engine, temps écoulé depuis la dernière interaction) et exécute une **Transformation** qui les classe en une Mission unique, priorisée par rapport aux autres signaux candidats.

## Ce qu'il exécute

Le Mission Engine exécute une ou plusieurs **Transformations** validées dans le Knowledge System, au même titre que tout autre Engine (KS-ENG §2 : *"Engine → applique → Rule"*). La Transformation de priorisation des Missions reçoit les signaux du Dossier en entrée et produit une Mission unique en sortie, de façon déterministe — exactement comme TRF-0001 produit un prix de revient à partir d'une entrée connue.

Cette Transformation doit être documentée selon KS-TRF (entrées, sorties, gardes, `fiscal_regime`, minimum trois Vérifications) avant toute implémentation du Mission Engine. Elle doit être accompagnée d'un **Raisonnement** qui en justifie l'ordre de priorité retenu — par exemple, pourquoi une anomalie bloquante prime sur une simple attente. Ce Raisonnement reste, comme tous les Raisonnements du Knowledge System, un document justificatif : il explique pourquoi cet ordre a été choisi, il n'est jamais exécuté lui-même. Le Mission Engine n'exécute jamais directement un Raisonnement.

## Ce qu'il ne fait jamais

Le Mission Engine ne doit jamais :

- calculer une valeur fiscale ;
- poser lui-même une question à l'utilisateur — il délègue toujours au Question Engine ;
- modifier l'état du Dossier — il délègue toujours au Workflow Engine ;
- interpréter une règle métier fiscale ;
- déclencher un autre Engine que ceux prévus par ses Contracts ;
- prendre une décision métier autonome, non déterministe, ou non traçable à une Transformation validée ;
- présenter plusieurs Missions de poids équivalent (UXP-003, Règle 3).

---

# 4. Contrat conceptuel

Cette section décrit la forme du futur Contract (KS-CTR) entre le Mission Engine et les composants avec lesquels il interagit. Elle ne remplace pas la rédaction formelle des documents CTR-xxx correspondants, qui reste une action de suivi.

## Entrées

- l'état courant du Dossier, fourni par le Workflow Engine ;
- les questions et Jugements en attente, fournis par le Question Engine (Mode Collection et Mode Guidance) ;
- les anomalies signalées, fournies par le Validation Engine ;
- le temps écoulé depuis la dernière interaction du client, dérivé d'un Field déjà existant du Dossier (`FIELD-036 — Dernière mise à jour`) ;
- la Transformation de priorisation validée (à documenter) et le régime fiscal du Dossier (`fiscal_regime`), qui sélectionne la version de cette Transformation applicable.

## Sorties

Un objet Mission unique, comprenant :

- la mission active (catégorie déterministe : par exemple attendre un document, poser une question, analyser un document reçu, calculer, générer la liasse, relancer le client, clôturer le dossier) ;
- sa priorité relative parmi les signaux candidats ;
- sa justification en langage naturel ;
- le responsable de la prochaine action (client, IA, système, ou collaborateur), dérivé déterministiquement de la nature du signal retenu ;
- les éléments bloquants identifiés, référencés vers leur source (anomalie du Validation Engine, question du Question Engine) — jamais recalculés ou requalifiés par le Mission Engine lui-même ;
- l'action recommandée, si le responsable est le client ;
- l'horodatage du calcul, pour la traçabilité (C12).

Un événement `MISSION_CALCULEE` accompagne cette sortie.

## Préconditions

Le Dossier existe. Au moins un signal (état du Workflow Engine) est disponible. La Transformation de priorisation applicable au régime fiscal du Dossier est documentée et validée.

## Postconditions

Une Mission unique et déterministe est produite pour le Dossier. Aucun état du Dossier n'est modifié. Aucun autre Engine n'est déclenché par le Mission Engine.

## Invariants

Le Mission Engine ne connaît jamais un autre Engine (KS-ENG §3.3) — il connaît uniquement ses entrées et sorties telles que définies par ses Contracts, et la Transformation qu'il applique. Il ne modifie jamais les signaux qu'il reçoit : il les lit, les classe, ne les requalifie jamais.

## Relations avec le Workflow Engine

Conformément à KS-ENG §3.1 (*"le Workflow Engine est le seul composant qui déclenche les autres Engines"*), le Mission Engine est déclenché par le Workflow Engine, jamais par un autre composant. Il ne déclenche jamais le Workflow Engine en retour et ne lui retire aucune autorité sur l'état du Dossier. L'événement `MISSION_CALCULEE` peut être consommé par le Workflow Engine à titre informatif, sans qu'aucune transition d'état n'en découle nécessairement — à la différence des événements qui font progresser sa machine à états (`OCR_TERMINE`, `VALIDATION_TERMINE`, etc.).

## Relations avec les autres Engines

Le Mission Engine lit, sans jamais les modifier, les signaux produits par le Question Engine et le Validation Engine, dans le cadre de Contracts à formaliser. Il n'a aucune autorité sur eux et ne leur retire ni ne leur ajoute aucune responsabilité.

## Relations avec les canaux informatifs

Conformément à KS-ENG §3.7 (*"Audience informative distincte de l'autorité de décision"*), l'événement `MISSION_CALCULEE` est exposé, en parallèle et sans hiérarchie avec sa consommation par le Workflow Engine, à un ou plusieurs composants informatifs (Dashboard, notification, e-mail, assistant conversationnel, agent vocal, API). Ces composants ne déclenchent jamais un Engine, ne modifient aucune donnée métier, et ne prennent aucune décision sur l'évolution du Dossier. La relation entre le Mission Engine et un composant informatif est unilatérale : elle relève d'une Constraint au sens de KS-CTR, jamais d'un Contract bilatéral.

---

# 5. Conséquences

## Conséquences positives

- Fiscal AI dispose d'une source de vérité unique pour "que faut-il communiquer au client maintenant", réutilisable par tout canal présent ou futur.
- La priorisation devient traçable et auditable (C12), et peut être expliquée a posteriori.
- Les huit Engines existants restent inchangés : aucun contrat en vigueur n'est modifié par cette décision.

## Prérequis avant implémentation

- La Transformation de priorisation des Missions doit être rédigée selon KS-TRF, avec ses gardes, son `fiscal_regime`, et un minimum de trois Vérifications (nominal, limite, erreur).
- Le Raisonnement justifiant l'ordre de priorité retenu doit être documenté et validé.
- Une nouvelle Entité (Mission) doit être créée dans 02 - Domaine pour représenter la sortie persistée du Mission Engine.
- Les Contracts formels (CTR-xxx) entre le Mission Engine et le Workflow Engine, le Question Engine et le Validation Engine doivent être rédigés selon KS-CTR.

## Hors périmètre — explicitement non traité par cette ADR

Cette ADR scope volontairement le Mission Engine à un seul Dossier, à l'image de tous les Engines existants. Les sujets suivants ne sont pas résolus ici et ne doivent pas être anticipés :

- **L'arbitrage entre plusieurs Dossiers d'un même client.** Le jour où un client aura plusieurs Dossiers actifs simultanément, un mécanisme de sélection entre leurs Missions respectives sera nécessaire. Il n'existe aujourd'hui aucune Entité représentant l'agrégat "client possédant plusieurs Dossiers" dans le modèle de données. Ce sujet devra être traité par une évolution future du Knowledge System, déclenchée par une Feature réelle qui en démontrera le besoin — pas par anticipation.
- **Les futurs produits patrimoniaux** au-delà du LMNP (SCI, Holding, IS, IR, LMP…). Le Mission Engine est conçu pour rester agnostique du régime fiscal grâce au scoping déjà existant (`fiscal_regime` sur les Transformations) ; son extension à ces domaines suivra ce mécanisme déjà éprouvé, sans modification du Mission Engine lui-même.
- **Toute problématique multi-canaux avancée** (résolution de conflit si deux canaux affichent la Mission à des instants différents, mise en cache, latence). Ce sont des sujets de Runtime, hors du périmètre du Knowledge System.

---

# 6. Vérification de cohérence

## Ontologie

Le Mission Engine n'introduit aucun nouveau concept. Il exécute une Transformation (catégorie classification/filtre), justifiée par un Raisonnement — exactement le couple déjà en usage entre RAI-013 et TRF-0012/TRF-0014. Les six concepts de l'Ontologie restent inchangés. Aucune modification de C1 à C12 n'est requise.

## ENGINE_INTERACTION_STANDARDS (KS-ENG, v1.2)

- §3.1 (Direction unique) : respecté — seul le Workflow Engine déclenche le Mission Engine.
- §3.2 (Communication par événements) : respecté — le Mission Engine émet `MISSION_CALCULEE`, il ne retourne jamais de résultat directement.
- §3.3 (Séparation des connaissances) : respecté — le Mission Engine ne connaît aucun autre Engine, seulement ses entrées/sorties contractuelles et la Transformation qu'il applique.
- §3.4 (Non-modification par le Workflow) : sans objet pour le Mission Engine lui-même — cette règle contraint le Workflow Engine, qui reste inchangé.
- §3.5 (Responsabilité unique) : respecté.
- §3.6 (Contract obligatoire) : les Contracts CTR-xxx restent à rédiger — action de suivi explicitement identifiée en section 5.
- §3.7 (Audience informative) : c'est la clause qui rend ce moteur cohérent avec le standard — le Mission Engine est le premier cas d'usage concret de cette règle, ajoutée précisément pour couvrir ce besoin.

## CONTRACT_STANDARDS (KS-CTR)

La relation entre le Mission Engine et un composant informatif est qualifiée de Constraint, conformément à la définition de KS-CTR (*"Une obligation unilatérale est une Constraint, pas un Contract"*). Un point de vigilance mineur, préexistant à cette ADR, mérite d'être signalé sans être masqué : le §3 de KS-CTR (*"Quand créer un Contract"*) liste *"un composant émet un événement consommé par un autre"* comme condition suffisante, sans rappeler explicitement à cet endroit la distinction bilatéral/unilatéral posée par sa propre section 2. Cette imprécision textuelle existait avant le Mission Engine et n'est pas résolue par la présente ADR ; elle est signalée comme amélioration mineure possible d'une future révision de KS-CTR, sans bloquer la décision présente.

## ENG-001 (Workflow Engine)

Aucune modification de son contrat. Il reste l'unique décideur des transitions du Dossier. Le Mission Engine ne lui retire ni ne lui ajoute aucune autorité.

## ARCH-001

Le Mission Engine n'apparaît pas dans le flux MVP décrit par ARCH-001, parce qu'il n'orchestre rien : il observe l'état produit par ce flux. Ce n'est pas une contradiction — ARCH-001 décrit le pipeline interne du Dossier, jamais la diffusion informative vers l'extérieur. Une incohérence réelle doit néanmoins être signalée explicitement : la mission "attendre une réponse de l'administration", mentionnée comme cas d'usage attendu du Mission Engine, ne correspond à aucun état actuellement modélisé par ARCH-001 (dont le flux s'arrête à `DOSSIER_TERMINE`, en aval du dépôt). Tant que ce cas n'est pas couvert par une extension du modèle d'états d'ENG-001/ARCH-001 — hors périmètre de cette ADR — cette Mission spécifique restera non représentable par le Mission Engine. Une future ADR devra traiter cette extension avant que cette Mission particulière ne puisse être implémentée.

## Autres ADR

- **ADR-001** (Classification Engine) et **ADR-003** (Capabilities) portent sur des sujets disjoints, non affectés.
- **ADR-002** (Question Engine, Mode Guidance) reste pleinement compatible : une question exposée en Mode Guidance devient l'un des signaux d'entrée candidats du Mission Engine. La relation est une composition, non une contradiction.
- **ADR-004** (formulaires fiscaux) porte sur un sujet disjoint, non affecté.
- **ADR-005** (Relationship Engine) est remplacée par la présente ADR, pour les raisons exposées en Statut.

---

# Conclusion

Le Mission Engine est la conséquence directe d'une responsabilité que les huit Engines existants ne peuvent légitimement assumer sans violer leur propre contrat. Il n'introduit ni nouveau concept ontologique, ni nouvelle autorité de décision : il exécute une Transformation, comme tout Engine, justifiée par un Raisonnement, comme toute Transformation qui le mérite. Sa cohérence avec ENGINE_INTERACTION_STANDARDS repose entièrement sur la clause d'audience informative qui vient d'y être ajoutée — sans elle, ce moteur serait resté une exception non déclarée.
