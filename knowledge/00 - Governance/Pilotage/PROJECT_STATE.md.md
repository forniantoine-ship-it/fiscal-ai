# PROJECT STATE

Version

0.7.0

Date

01/09/2026

MVP (technique — fonctionnalités livrées)

Avancement qualitatif — pas de pourcentage unique retenu au 01/09/2026. Le chiffre historique « 55 % » (06–10/07/2026) n'a pas été recalculé : la méthodologie de pondération n'est toujours pas validée (voir note ci-dessous). En revanche, six commits code poussés sur `sprint/dashboard-narrative-premium` ont fait progresser plusieurs epics depuis juillet (dashboard narratif, déclaration/validation, OCR, charges, parité F-009).

Maturité Produit (Constitution + Knowledge System + Gouvernance)

100 % pour le périmètre v1 (DEC-024) — métrique distincte du MVP technique. ADR-007, ADR-008 et ADR-009 + Constitution v1 commités localement (`986ea26`, non poussé au 01/09/2026).

> ⚠ **À confirmer (Product Owner)** : ce document ne fusionne pas maturité produit et avancement technique en un seul pourcentage global. Tant qu'aucune formule de pondération n'est actée, tout pourcentage unique serait arbitraire.

Statut

🟡 Sprint `dashboard-narrative-premium` — dashboard narratif livré sur la branche ; validation produit et convergence Ch2 (ADR-007/009) en cours

Etat général

Architecture : 🟢

OCR : 🟢

Extraction : 🟢

Validation : 🟢 (gate F-006/F-007 câblé — `72e6750`)

Calcul : 🟢

Liasse : 🟢

Export : 🟡 (résumé client PDF + export liasse texte disponibles — `72e6750` ; téléchargement PDF officiel toujours 🔴)

Paiement : 🔴

Blocage principal (partiellement atténué)

La convergence Runtime ↔ Wizards reste incomplète : le dashboard unifie l'accueil et la progression, mais les étapes métier continuent de router vers les pages `/assistants/*` pour Activité, Logement, Revenus, Charges, etc.

Conséquence

Le parcours principal est désormais cohérent depuis `/dashboard`, mais le tunnel métier sous-jacent reste hétérogène (assistants Runtime + wizards historiques).

Priorité absolue (01/09/2026)

1. Valider le dashboard narratif trois chapitres sur la branche et trancher la dette Chapitre 2 (carousel production vs ADR-007/009).
2. Poursuivre la convergence Runtime ↔ Wizards là où elle bloque encore le parcours sans assistants.

---

## Décisions majeures de la séance du 07/07/2026

Cette séance n'a porté sur aucun développement. Elle a fait évoluer la vision du produit de façon durable :

- Fiscal AI n'est plus conçu comme un logiciel fiscal mais comme un conseiller numérique spécialisé.
- La philosophie stoïcienne devient une source d'inspiration de conception.
- Le concept d'**Ataraxia** devient l'étoile polaire interne du projet (un concept de conception, pas nécessairement un nom commercial).
- La charge mentale de l'utilisateur est identifiée comme le véritable ennemi combattu par le produit.
- La personnalité de Fiscal AI est désormais clairement définie (voir `03 - Produit/Fiscal AI Constitution/`).

Détail : DEC-007 à DEC-011 (DECISIONS.md.md).

Le prochain chantier n'est plus uniquement technique. Il devient également identitaire.

---

## Décisions majeures de la séance du 08/07/2026

Séance fondatrice complémentaire, toujours sans développement :

- Article I — La Relation est rédigé : Fiscal AI construit une relation, pas un logiciel ; le produit travaille pendant l'absence de l'utilisateur ; la mémoire est une preuve de respect.
- Article VI — La Conversation est rédigé : le Runtime pilote la conversation ; le Conversation System devient une couche du produit ; GPT n'intervient que lorsqu'il apporte une réelle valeur.
- Article VII — Design est ouvert : **le dashboard disparaît**, remplacé par un accueil en trois chapitres plein écran (Le Conseiller, Les Espaces de travail, Le Coffre-fort).
- Trois documents de Design System sont créés : Language System, Color Philosophy, Scroll Narrative — plus un dossier Visual References (emplacements vides).
- Le Product Owner a tranché (DEC-018) : la disparition du dashboard n'est pas un conflit avec UXP-004 mais une évolution du même concept. UXP-004 a été mis à jour en v2.0 : il décrit désormais le parcours narratif en trois chapitres, en conservant intégralement sa philosophie (une seule action prioritaire, réduction de la charge mentale, guidage, situation → raison → action → suite).
- Le document fondateur Design Language est créé (DEC-019) : un guide d'intention, pas un guide UI. Il fixe notamment que le conseiller n'est jamais un avatar, personnage, photo ou mascotte (DEC-020) — il existe uniquement par ses mots, sa mémoire, ses décisions, son accompagnement.

Détail : DEC-012 à DEC-020 (DECISIONS.md.md).

---

## Clôture de séance du 08/07/2026

Aujourd'hui nous avons validé :

- la Gouvernance (DEC-021 à DEC-025, ratifications et clôture de sprint) ;
- le Design Language ;
- le Language System ;
- le Scroll Narrative ;
- le rôle permanent du Conseiller (présent sur toutes les pages, présence conversationnelle intégrée à l'interface, jamais un avatar) ;
- la disparition du dashboard au profit d'un parcours narratif (UXP-004 v2.0) ;
- les trois chapitres de l'expérience utilisateur (Le Conseiller, Les Espaces de travail, Le Coffre-fort), désormais structure officielle de l'accueil ;
- le principe du Conversation System (couche du produit, intégrée à l'interface).

**Le produit entre maintenant dans sa phase de conception UX/UI.** La Constitution Produit v1 est considérée comme terminée (DEC-024) ; Article VIII — Gouvernance produit reste ouvert, hors périmètre v1 (à confirmer).

Détail : DEC-021 à DEC-025 (DECISIONS.md.md).

---

## Décisions majeures de la séance du 10/07/2026

Séance de clôture de l'étape UX du Sprint UX-001, sans développement :

- Audit UX complet et sans complaisance du dashboard existant, révélant que les trois chapitres racontaient trois histoires différentes (visuelles et fonctionnelles) plutôt qu'une seule narration continue.
- Le Chapitre 1 est redéfini comme un accueil pur : il ne lance jamais de page métier, le bouton principal fait défiler vers le Chapitre 2 (DEC-026).
- Le Conseiller devient une présence qui observe le dossier avant de répondre, jamais un chatbot, une FAQ ou un centre d'aide (DEC-027).
- Les deux cartes du Chapitre 1 reçoivent des responsabilités distinctes et non redondantes (« que faisons-nous maintenant » / « que dois-je savoir »), issues d'une source unique de vérité (DEC-028).
- Le Chapitre 2 abandonne la logique carte active/inactive pour un modèle de progression : toute étape atteinte reste accessible définitivement (DEC-029, révise DEC-023).
- Le Chapitre 3 devient un véritable coffre-fort documentaire : récit de confiance avant les documents, regroupement par exercice fiscal (DEC-030).
- Le chantier Conversation System est formellement confirmé hors périmètre de ce sprint (DEC-031).
- Direction artistique du Chapitre 1 validée : carte principale dominante (65-70 %, fond orange, bouton blanc), carte Conseiller secondaire (30-35 %, fond clair) (DEC-032).

Détail : DEC-026 à DEC-032 (DECISIONS.md.md). UXP-004 mis à jour en v2.1, Article VII — Design mis à jour en v0.2.

Le sprint UX-001 quitte sa phase UX et entre en phase UI, strictement limitée au Chapitre 1 (interdiction absolue inchangée : aucun autre écran ne se développe avant validation du premier).

---

## Avancement — maturité produit

Peu de code a été écrit le 07/07/2026 et le 08/07/2026. La maturité produit a néanmoins fortement progressé jusqu'à son terme (v1) : le projet dispose désormais d'un cadre philosophique, relationnel et visuel explicite (la Fiscal AI Constitution + Design Language) qui devra guider toute future décision d'interface, à la place d'une intuition implicite et non documentée. Cette progression n'est pas mesurable par le pourcentage MVP technique — elle est suivie séparément sous « Maturité Produit » ci-dessus.

---

## Avancement technique — septembre 2026

Six commits code poussés sur `origin/sprint/dashboard-narrative-premium` (base `ac9eb55` → `32b184b`), plus un commit knowledge normatif local non poussé (`986ea26`). Synthèse au 01/09/2026 :

| Commit | Apport vérifiable |
|---|---|
| `09ec232` | Dashboard narratif `/dashboard` : trois chapitres plein écran (`FullHeightChapters`), Chapitre 1 Conseiller (`DashboardConseillerSection`, `resolveDashboardHeroState`), Chapitre 2 workflow carousel (`DashboardWorkflow`, `workflow-carousel-engine`), Chapitre 3 coffre-fort (`VaultSection`), scroll-snap mandatory |
| `61edcdf` | OCR : résolution texte document renforcée, retry vision OCR, détection corpus invalide |
| `72e6750` | Déclaration : gate génération F-006/F-007, persistance RFS, résumé client PDF, export liasse texte |
| `7ec564c` | Charges : routage taxe foncière, pipeline reading-mode instrumenté |
| `2120f58` | Lab `/lab/advisor-scene` : prototype architecture six couches ADR-009 (composition, lighting, motion, gestures), découplé du dashboard production |
| `32b184b` | F-009 : test parité complétude `inpiConfirmedAt` entre dashboard, dossier-status, declaration-progress, document-journey |

**Livré sur la branche :** parcours d'accueil trois chapitres utilisable ; pipeline déclaration/validation sensiblement avancé ; exports client intermédiaires ; lab scène conseiller pour exploration ADR-009.

**Non livré / dettes connues :** PDF officiel téléchargeable ; paiement ; Chapitre 2 production encore en carousel (écart documenté avec ADR-007 — voir DECISIONS, note septembre 2026 et UXP-004) ; Chapitre 3 sans regroupement par exercice fiscal (DEC-030 partiel) ; convergence complète sans `/assistants/*`.