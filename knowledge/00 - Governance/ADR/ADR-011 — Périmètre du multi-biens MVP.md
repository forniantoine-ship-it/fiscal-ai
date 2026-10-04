---
id: ADR-011
title: "Périmètre du multi-biens MVP : un domaine supporté, jamais un multi universel"
type: adr
status: accepted
version: "1.6"
created: 2026-10-03
updated: 2026-10-04
owner: product-owner
tags: [adr, multi-biens, lmnp, perimetre, fail-closed, activation]
triggers: [MB-ACTIVATION-AUDIT-2, MB-MULTI-DOMAIN-GUARD-1, MB-MULTI-JOURNEY-COMPLETION-2, MB-MULTI-STRIPE-RETURN-CONTEXT-1]
éclaire: [SAV-030, SAV-031, SAV-032, SAV-033, F-002, PROF-005]
---

# ADR-011 — Périmètre du multi-biens MVP

# Statut

Décision validée par le Product Owner (2026-10-03), à l'issue de MB-ACTIVATION-AUDIT-2. Elle fixe le domaine ; elle n'active rien : l'activation utilisateur du multi-bien reste désactivée.

# 1. Décision

Le multi-biens du MVP n'est **PAS** un support multi universel. Il ne supporte que le **domaine** suivant. Tout dossier à plusieurs biens qui en sort est **BLOQUÉ** (fail-closed) avec un motif identifiable : jamais un calcul approché, jamais un « meilleur effort ».

Domaine supporté (conditions cumulatives) :

- 2 biens ou plus, même contribuable, même activité LMNP, régime réel simplifié, impôt sur le revenu ;
- même exercice, **première année uniquement**, biens **natifs** (aucune reprise) ;
- aucun déficit antérieur, aucun ARD historique, aucun stock fiscal d'ouverture, aucune ouverture d'exercice ;
- aucune charge commune, aucun prêt partagé ;
- une date de mise en service identifiable par bien ;
- dotations d'amortissement **intégralement déductibles** : si une dotation produit un ARD ou exige une allocation de l'article 39 C entre biens (TRF-0035 non établi), le dossier est bloqué ;
- hors LMP, hors organismes de sécurité sociale (SSI), hors détention indirecte ;
- clôture interdite, exercice suivant (N+1) interdit.

# 2. Non supporté initialement (= BLOQUÉ)

ARD généré non allouable ; ARD historique ; déficit antérieur ; reprise ; stock d'ouverture ; charges communes ; prêt partagé ; LMP ; SSI ; détention indirecte ; clôture ; N+1.

# 3. Principes d'architecture

- Le bien est l'unité de saisie ; l'**activité** est l'unité déclarée : une seule consolidation, un seul calcul fiscal, une seule liasse (2033-A/B/C, 2031, 2031 Bis) et une seule aide 2042-C-PRO (5NA ou 5NY de l'activité, jamais par bien).
- Une seule garde de domaine, commune à la génération, au Cerfa et à l'aide 2042.
- Capacités d'activation **indépendantes** (édition, génération, livraison, paiement, clôture, N+1) : ouvrir l'une n'en ouvre jamais une autre. Clôture et N+1 restent fermés quelle que soit l'ouverture des autres.
- Documents : un document de bien porte un `propertyId` ; un document commun (`propertyId = null`) n'existe que si son type autorise explicitement une portée activité ; un document ambigu est refusé, un document sans `propertyId` n'est jamais promu commun.

# 4. Tarif

Inchangé : 149 € par dossier et par exercice, y compris plusieurs biens du domaine supporté.

# 5. Hors périmètre

Allocation 39 C et ARD par bien (TRF-0035), charges communes, prêt partagé, reprise multi-biens, clôture et N+1 multi. Chacun exige une décision et une preuve ultérieures.

# 6. Parcours utilisateur du multi-biens (dormant) — décisions MB-MULTI-UX-1

Ces décisions décrivent l'interface ; elles n'ouvrent aucune capacité (l'activation utilisateur reste fermée) et n'élargissent pas le domaine.

- **Ajout d'un bien** : une action explicite « Ajouter un bien », au niveau du dossier (écran « Mes biens »), qui réutilise l'unique transition `ADD_PROPERTY` (mono → bien A scopé + bien B, atomique : A conserve toutes ses données, B démarre vide). Le nouveau bien devient le bien actif : l'utilisateur arrive sur le bien qu'il vient de créer pour le renseigner.
- **Bien actif** : source de vérité unique = l'URL (`propertyId` du scope V3 vérifié). Aucun état parallèle, jamais « le premier bien ». Un scope sans bien valide du dossier est refusé, côté client comme côté serveur.
- **Sélecteur de bien** : liste les biens du dossier par leur nom (jamais « bien 1 / bien 2 » comme identité) ; changer de bien change l'URL, jamais les données.
- **Documents** : un document de bien est téléversé avec le `propertyId` du bien actif, explicitement ; sans bien actif en multi-bien, le téléversement est refusé. Un document sans `propertyId` n'est jamais promu commun ; seuls les types explicitement de portée activité (document d'activité INPI/F009) sont communs. Aucun parcours « ce document concerne plusieurs biens ».
- **Attestations d'activité (explicites, séparées, persistées, auditables)** : (1) l'activité reste dans le LMNP pris en charge et ne relève pas d'une situation SSI hors périmètre ; (2) les logements sont détenus directement dans le périmètre pris en charge ; (3) aucune charge commune à plusieurs biens. Chacune est enregistrée avec sa réponse (`confirmed` / `declared_out_of_domain`), l'horodatage et la version du libellé. **Absente = refus** (fail-closed) ; une déclaration hors domaine bloque. Ces attestations ne sont pas une détection fiscale ni un conseil.
- **Blocages** : la garde de domaine reste la seule source ; l'interface traduit ses codes de motif en messages, sans recréer de règle.

# 7. Capacité `generation` (MB-MULTI-CAPABILITY-WIRING-1) — premier levier ouvert, jamais suffisant

Décision du Product Owner : la capacité `generation` est la **première** capacité ouverte (`MULTI_PROPERTY_CAPABILITIES`) ; `delivery` (§8) et `payment` (§9) l'ont suivie. Le domaine du §1 n'est pas modifié.

- **Admission** à la génération d'un dossier multi = capacité `generation` ouverte **ET** domaine ADR-011 supporté avant calcul **ET** preview réellement généré **ET** readiness technique (global + chaque bien). Chaque dimension refuse seule : capacité fermée → `multi_property_not_enabled` ; domaine non supporté → motif stable `multi_property_*` ; un motif connu seulement après consolidation ou calcul (charge commune, prêt partagé, date de mise en service par bien, ARD généré / 39 C) est refusé par l'entrée de génération elle-même.
- Une activité = **une** génération : un F-006, une RFS d'activité, une liasse, une 2031, une aide 2042-C-PRO ; le bien actif de l'interface n'entre jamais dans le calcul.
- À la date de cette décision, `edition`, `delivery`, `payment`, `closing`, `nextYear` étaient **fermés** (voir §8 et §9 pour l'ouverture de `delivery` et `payment`). Ouvrir la génération n'ouvre aucun autre levier ; clôture et exercice suivant restent structurellement non ouvrables. État courant : `edition`, `closing` et `nextYear` fermés ; le multi utilisateur reste **dormant** parce que l'ÉDITION est fermée (aucun moyen de créer un second bien en production).
- Prérequis avant toute activation utilisateur finale : migration distante `20261001120000_lmnp_snapshot_schema_no_downgrade.sql` vérifiée/appliquée (statut distant à ce jour inconnu).

# 8. Capacité `delivery` (MB-MULTI-DELIVERY-WIRING-1) — deuxième levier ouvert, jamais un droit d'accès

Décision du Product Owner : la capacité `delivery` est ouverte **après** une preuve à 3 biens (le domaine du §1 reste « 2 biens ou plus », sans borne ; aucune hypothèse « exactement deux » n'existe dans le pipeline). `generation` reste ouverte ; à cette date `edition`, `payment`, `closing`, `nextYear` restaient **fermés** (`payment` a été ouvert ensuite : §9).

- **Admission** à la livraison d'une RFS multi (Cerfa ET aide 2042-C-PRO : MÊME fonction `resolveMultiPropertyDeliveryAdmission`, aucune condition de domaine dans les routes) = capacité `delivery` ouverte **ET** domaine ADR-011 établi sur la RFS **recalculée par le serveur depuis son snapshot** (jamais la RFS d'activité envoyée par le client) **ET** déclarabilité finale (`final-declarability`, bouclage 2033-B `BALANCED`, aucune case sans mapping visuel). Une RFS multi dont un fait requis n'est pas établi (forme inattendue, `fiscalResult` ou stock d'ouverture absents) est refusée (`multi_property_domain_unverifiable`), jamais présumée favorable ni source d'exception.
- **Chaîne d'autorité serveur (MB-MULTI-SERVER-TRUST-2 / MB-MULTI-CHECKOUT-FLUSH-1)** : requête client → snapshot serveur → génération serveur (un seul F006) → admission de domaine serveur → RFS serveur → livraison. La RFS client n'est **jamais** autoritaire (elle n'est plus lue). `expectedRevision` protège la livraison contre un état périmé (409 `workspace_snapshot_stale`). Le checkout lit le même snapshot serveur ; le client vide donc l'autosave et obtient la confirmation de persistance **avant** toute requête de paiement (échec : ni ligne, ni session Stripe). Le paiement reste lié au dossier et à l'exercice, jamais à une révision.
- **Une livraison fiscale par activité** : la liasse (2031, 2031 bis, 2033-A/B/C), et l'aide 2042-C-PRO (5NA ou 5NY consolidé, aucun identifiant de bien) sont rendues depuis la RFS consolidée d'activité ; le bien actif de l'interface n'entre jamais dans la livraison.
- **La capacité n'est pas l'entitlement** : les deux routes exigent d'abord, sans lire aucune capacité, l'entitlement serveur `paid` pour (dossier, exercice) (402 `payment_required` sinon). Ouvrir `delivery` ne rend donc jamais un document payant accessible gratuitement ; le checkout multi est gouverné par l'admission `payment` du §9. Le tarif reste 149 € par dossier et par exercice.
- Le multi utilisateur reste **dormant** (édition de production, paiement et migration distante `20261001120000_lmnp_snapshot_schema_no_downgrade.sql` non vérifiée : prérequis avant toute activation utilisateur finale).

# 9. Capacité `payment` (MB-MULTI-PAYMENT-WIRING-1) — troisième levier ouvert, jamais un entitlement

Décision du Product Owner : la capacité `payment` est ouverte pour le multi **sans nouveau contrat commercial**. `generation` et `delivery` restent ouvertes ; `edition`, `closing`, `nextYear` restent **fermés**.

- **Un achat par dossier et par exercice** : 149 € TTC (14 900 centimes EUR), prix et devise exclusivement serveur, que le dossier compte 1, 2, 3 ou N biens. L'identité commerciale est (paiement, dossier, exercice, utilisateur) : **aucun bien n'y participe** (ni prix, ni ligne, ni session, ni métadonnée Stripe par bien). Le bien actif de l'interface et l'ordre des biens n'ont aucun effet sur le paiement.
- **Même moteur que le mono** : le checkout serveur existant (`/api/lmnp/payment/checkout`) est inchangé dans son contrat ; aucun service de paiement multi n'existe. La seule addition est une **admission pure** (`resolveMultiPropertyPaymentAdmission`, même modèle que génération et livraison) évaluée sur le snapshot SERVEUR avant toute ligne et toute session : capacités `payment` ET `generation` ET `delivery` ouvertes, éligibilité d'antériorité, garde de domaine ADR-011, et aptitude à livrer par la gate de génération (capacité génération ∧ domaine ∧ preview déterministe réellement généré ∧ readiness technique).
- **Ne jamais encaisser un dossier connu comme non livrable** : le preview est le moteur déterministe réel appliqué au snapshot (pas une prédiction) ; les motifs que seul le calcul établit (ARD généré / 39 C inter-biens) sont donc connus **avant** le paiement et refusent le checkout (409 `multi_property_not_payable` ; hors domaine : 409 `multi_property_domain_unsupported` ; capacités fermées : 409 `multi_property_not_enabled`). Un snapshot multi illisible ou d'un autre exercice est refusé (`multi_property_domain_unverifiable`).
- **La capacité n'est pas l'entitlement** : `payment` ouvert ne vaut jamais `paid`. La livraison exige toujours, sans lire aucune capacité, l'entitlement serveur `paid` pour (dossier, exercice) (402 `payment_required` sinon) ; un exercice ou un dossier payé n'en débloque aucun autre.
- Le multi utilisateur reste **dormant** : édition de production fermée, migration distante `20261001120000_lmnp_snapshot_schema_no_downgrade.sql` non vérifiée, recette E2E finale non effectuée, clôture et N+1 interdits.

# 10. Parcours de production du multi-biens (MB-MULTI-JOURNEY-COMPLETION-2) — techniquement prêt, jamais ouvert

Décision d'ingénierie, sans nouvelle doctrine fiscale : le parcours utilisateur multi-bien est complété sur les routes de **production** existantes ; il n'ouvre **aucune** capacité (`edition` reste fermée) et n'élargit pas le domaine du §1.

- **Aucune dépendance au LAB** : « Mes biens » (`/assistants/biens`), les assistants par bien, les documents (`/documents`) et la validation (`/documents?step=validation`) sont des routes de production. Les routes `/lab` restent fermées en production sans `ENABLE_V3_REAL_TEST_ROUTE`, qui n'est plus nécessaire au parcours supporté. Le scope de production réutilise le contrat de scope V3 (dossier, exercice, bien) avec un marqueur de retour `dossier` vers « Mes biens » ; il est dérivé du dossier déjà chargé et revérifié côté serveur à l'arrivée.
- **Entrée en multi** : avant `ADD_PROPERTY` (irréversible, sans suppression de bien), l'interface évalue l'admission d'entrée par la garde unique de domaine : tout motif connu avant génération et non récupérable (exercice non initial, reprise, déficit ou ARD d'ouverture, LMP, détention indirecte, régime) refuse l'ajout et le motif est affiché. Les motifs récupérables (attestations, document non attribué, date de mise en service du nouveau bien) ne le refusent pas. Ce que seuls la consolidation ou le calcul établissent (charges communes, prêt partagé, ARD généré / 39 C) n'est pas connaissable à l'entrée : il reste refusé à la génération, au checkout et à la livraison (fail-closed côté serveur).
- **Enregistrement véridique** : l'issue d'un ajout de bien est décidée par la seule révision serveur confirmée (primitive partagée avec le checkout et la livraison) ; « rien en attente » n'est pas un échec ; un échec propose de réessayer l'enregistrement, sans afficher de succès.
- **Paiement** : l'interdiction côté client « parcours multi-dossier » est levée. Le checkout reste le chemin serveur existant (vidage de l'autosave → snapshot serveur → admission → ligne → session) ; le retour Stripe porte uniquement le dossier et l'exercice d'origine (`/documents?step=validation&fy=…&dossierId=…`, MB-MULTI-STRIPE-RETURN-CONTEXT-1), jamais un bien ni une révision, et le contexte multi est reconstruit depuis l'état persisté. Cette URL est un contexte de navigation, jamais une autorité : la porte d'entrée revérifie la propriété du dossier demandé avant de le charger, l'entitlement reste (dossier, exercice) côté serveur, et un retour sans `dossierId` (ancien lien) garde le comportement historique (dossier par défaut du fournisseur).
- **Ouverture** : basculer `edition` reste une décision et une mission distinctes, après recette de bout en bout.

