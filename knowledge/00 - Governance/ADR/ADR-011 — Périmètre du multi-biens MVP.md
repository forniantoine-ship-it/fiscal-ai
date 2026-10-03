---
id: ADR-011
title: "Périmètre du multi-biens MVP : un domaine supporté, jamais un multi universel"
type: adr
status: accepted
version: "1.1"
created: 2026-10-03
updated: 2026-10-03
owner: product-owner
tags: [adr, multi-biens, lmnp, perimetre, fail-closed, activation]
triggers: [MB-ACTIVATION-AUDIT-2, MB-MULTI-DOMAIN-GUARD-1]
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
