---
id: DEC-001
title: Politique de priorisation des Missions
type: decision
status: draft
version: "1.1"
created: 2026-07-05
updated: 2026-07-05
owner: product-owner
tags: [decision, produit, mission-engine, priorisation]
decision_type: produit
governs: [TRF-0033]
grounded_in: [ADR-006]
---

# DEC-001 — Politique de priorisation des Missions

---

# Contexte

TRF-0033 (Priorisation de la Mission active du Dossier) doit arbitrer entre plusieurs signaux concurrents pouvant coexister sur un même Dossier : une anomalie signalée, une question ou un Jugement en attente, une inactivité prolongée, ou l'état courant du Workflow. Cet arbitrage n'est fondé sur aucun texte légal — c'est un choix produit, qui doit être documenté et assumé comme tel, pas dissimulé dans le code d'une Transformation.

**Ajout (v1.1)** — Une revue de conception de TRF-0033 a révélé qu'une première version de cette politique ne couvrait pas explicitement le périmètre des états du Dossier éligibles à la Mission de relance. Cette omission avait conduit RAI-015 et TRF-0033 à improviser, chacun de leur côté mais de façon identique, une liste de quatre états non justifiée — incohérente avec la table de correspondance état → responsable de TRF-0033, qui désigne le client comme responsable pour huit états, pas quatre. Cette question est donc ajoutée ici, formellement, comme un troisième arbitrage de cette politique.

---

# Question

1. Dans quel ordre les catégories de signaux d'un Dossier doivent-elles être départagées lorsqu'elles sont actives simultanément ?
2. À partir de quel délai d'inactivité une Mission de relance doit-elle être proposée ?
3. Parmi les états du Dossier dont la Mission par défaut désigne le client comme responsable, lesquels déclenchent une Mission de relance en cas d'inactivité prolongée ?

---

# Alternatives

**Sur l'ordre de priorité :**
- Option A — Une anomalie prime toujours sur une question en attente, qui prime toujours sur une relance d'inactivité, qui prime toujours sur la Mission par défaut liée à l'état du Dossier.
- Option B — La relance d'inactivité prime sur tout le reste, au motif qu'un dossier abandonné est le risque le plus coûteux à long terme.
- Option C — Un score composite pondérant urgence et ancienneté.

**Sur le seuil d'inactivité déclenchant une relance :**
- 7 jours
- 14 jours
- 30 jours

**Sur le périmètre des états éligibles à la relance :**
- Option A — Tous les états dont la Mission par défaut désigne le client comme responsable (huit états : DOSSIER_CREE, INFORMATIONS_GENERALES, BIEN_EN_COURS, BIEN_COMPLETE, DOCUMENTS_EN_ATTENTE, INFORMATIONS_MANQUANTES, CALCUL_TERMINE, DECLARATION_GENEREE).
- Option B — Uniquement les états de la phase de construction du Dossier, antérieurs à DOSSIER_COMPLET, parmi ceux où le client est responsable (DOSSIER_CREE, INFORMATIONS_GENERALES, BIEN_EN_COURS, BIEN_COMPLETE, DOCUMENTS_EN_ATTENTE, INFORMATIONS_MANQUANTES).
- Option C — Une liste figée manuellement, sans critère systématique dérivable de la table état → responsable (l'approche initialement adoptée dans la première version de RAI-015/TRF-0033, sans justification écrite).

---

# Décision retenue

**Ordre de priorité : Option A.**

1. Anomalie bloquante (`nombre_anomalies > 0`)
2. Question ou Jugement en attente
3. Inactivité prolongée (relance)
4. Mission par défaut dérivée de l'état du Dossier (STATE-001)

**Seuil d'inactivité : 14 jours.**

**Périmètre de la relance : Option B.** Sont éligibles à la Mission de relance les états DOSSIER_CREE, INFORMATIONS_GENERALES, BIEN_EN_COURS, BIEN_COMPLETE, DOCUMENTS_EN_ATTENTE, INFORMATIONS_MANQUANTES — c'est-à-dire tout état de la phase de construction du Dossier (antérieur à DOSSIER_COMPLET) dont la Mission par défaut désigne le client comme responsable. CALCUL_TERMINE et DECLARATION_GENEREE en sont explicitement exclus.

---

# Justification

**Sur l'ordre.** Une anomalie non corrigée rend tout calcul ultérieur non fiable — la laisser masquée derrière une relance ou un statut neutre contredirait directement la promesse d'exactitude de Fiscal AI (Vision.md). Une question en attente bloque la progression du Dossier de façon plus immédiate qu'une simple inactivité. L'Option B a été écartée : elle ferait passer un rappel commercial avant la fiabilité du dossier, ce qui contredit UXP-003 (le guidage sert le dossier, jamais une métrique d'engagement). L'Option C (score composite) a été écartée : elle rendrait l'arbitrage non explicable en langage naturel à l'utilisateur, alors que UXP-003 Règle 1 exige que chaque décision soit justifiable simplement.

**Sur le seuil.** 14 jours correspond à une visite bimensuelle plausible pour un dossier fiscal non urgent (UXP-004 : *"un client peut n'ouvrir Fiscal AI qu'une fois par semaine, parfois moins"*), sans relancer prématurément un utilisateur qui a simplement repoussé sa session suivante de quelques jours. 7 jours a été jugé trop agressif au regard de ce rythme d'usage documenté ; 30 jours a été jugé trop tardif au regard du risque d'abandon par lassitude déjà identifié dans UXP-004 (état "Analyse en cours").

**Sur le périmètre de la relance.** Le risque que la relance combat — *"un dossier interrompu perd de sa valeur perçue à chaque semaine qui passe si personne ne relance l'élan"* (UXP-004, état "Analyse en cours") — est spécifique à la phase de construction du Dossier. Il est de nature différente du risque qui existe une fois le résultat prêt (CALCUL_TERMINE) ou la déclaration générée (DECLARATION_GENEREE) : là, UXP-004 (état "Résultat prêt") décrit un enjeu de décision d'achat, pas d'abandon par lassitude — *"faire culminer la valeur perçue avant de proposer l'échange"*. Traiter ces deux situations avec la même Mission `relancer_client` et le même texte générique ("reprendre le dossier là où il a été laissé") produirait un message inexact pour un client qui a en réalité déjà tout ce qu'il faut sous les yeux et hésite à passer à l'achat. L'Option A a donc été écartée : elle est plus simple mais fusionnerait deux situations produit distinctes sous une seule catégorie, ce qui contredirait la discipline déjà appliquée ailleurs dans ce Knowledge System de ne jamais faire porter à une même catégorie deux natures de problème différentes (cf. CAT-001, sur la distinction des familles d'Assistants). L'Option C a été écartée car elle ne peut pas être auditée ni régénérée à partir d'un critère explicite. La relance des états post-calcul (CALCUL_TERMINE, DECLARATION_GENEREE) reste un besoin réel mais distinct, explicitement hors périmètre de cette Decision — voir Conséquences.

---

# Conséquences

- TRF-0033 applique cet ordre, ce seuil et ce périmètre de façon déterministe : à signaux identiques, la Mission retenue est toujours identique.
- Toute modification de cet ordre, de ce seuil ou de ce périmètre passe par une révision de cette Decision, jamais par une modification directe de TRF-0033 ou de RAI-015.
- Si un futur régime fiscal (SCI, Holding…) exige un ordre, un seuil ou un périmètre différent, une nouvelle Decision scopée à ce régime doit être créée — cette Decision-ci reste scopée au régime `lmnp-reel`.
- **Hors périmètre, noté pour une future Decision** : le besoin de relancer un client resté inactif après CALCUL_TERMINE ou DECLARATION_GENEREE est réel (UXP-004, état "Résultat prêt") mais nécessite une Mission distincte de `relancer_client`, avec sa propre justification en langage naturel orientée décision d'achat plutôt que reprise de dossier. Ce sujet n'est pas traité par TRF-0033 dans sa version actuelle.

---

# Réversibilité

Réversible. Aucune conséquence irréversible sur les données du Dossier : modifier cette politique ne fait que changer la Mission affichée au prochain calcul, jamais l'historique déjà produit (FIELD-097 conserve la trace de chaque calcul passé).

---

# Références

Aucune source légale — Decision de nature produit, non fiscale. Fondée sur ADR-006, UXP-003, UXP-004.
