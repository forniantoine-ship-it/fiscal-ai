---
id: F-012
title: Assistant Charges
type: feature
status: approved
version: "1.0"
created: 2026-06-30
updated: 2026-06-30
owner: product-owner
priorité: haute
tags: [feature, charges, déductibilité, copropriété, travaux, lmnp]
jtbd: [JTBD-004]
profils: [PROF-001, PROF-002, PROF-004, PROF-005]
ux-patterns: [UXP-001, UXP-Scaffold]
---

# F-012 — Assistant Charges

---

# Note structurelle pour les futurs auteurs

Cet Assistant est structurellement différent de F-009 à F-011.

Les assistants précédents collectaient un petit nombre de valeurs définies à l'avance et calculaient un output unique. F-012 traite une **collection ouverte de transactions hétérogènes**, chacune nécessitant une qualification individuelle avant d'être calculée.

Le Parcours utilisateur n'est pas un arbre convergent — c'est un **scaffold** (inventaire structuré des charges attendues) suivi de **micro-flux répétables** (un par charge). Les deux niveaux doivent être lus ensemble pour comprendre la conception.

Cette différence structurelle est réelle et documentée dans la mission R-007. Elle ne constitue pas une limite de la méthode mais un pattern nouveau à formaliser pour les futurs assistants de type "collection ouverte".

---

# Mission

Qualifier, pour chaque dépense engagée sur l'exercice, son statut fiscal — déductible comme charge, à amortir, ou non déductible — et calculer le total des charges déductibles de l'exercice.

Cet Assistant ne demande pas à l'utilisateur de connaître les règles fiscales. Il pose les bonnes questions pour que le système rende les jugements à sa place.

**Règle clé jamais exposée telle quelle à l'utilisateur :** en LMNP réel, les charges sont déductibles l'année de leur paiement (méthode caisse), pas l'année qu'elles couvrent. Cette règle s'applique à toutes les catégories sans exception.

---

# Valeur utilisateur

À l'issue de cet Assistant, l'utilisateur connaît le montant total de ses charges déductibles, ventilé par catégorie, avec une explication claire pour chaque charge qui n'est pas déductible ou qui doit être amortie.

Il n'a jamais eu à connaître la distinction "réparation vs. amélioration" en tant que concept fiscal — il a répondu à des questions en langage courant et le système a appliqué la qualification.

---

# Déclencheur

L'utilisateur accède à l'étape "Charges" de son dossier LMNP, depuis le Workflow Engine, après la complétion de l'Assistant Financement (F-011).

---

# Préconditions

- L'Assistant Financement est terminé (événement `FINANCEMENT_TERMINE` ou `FINANCEMENT_SKIP` reçu)
- La `date_mise_en_service` est connue (F-009) — utilisée pour isoler les charges pré-exploitation
- L'exercice fiscal est défini (année N)
- L'utilisateur est authentifié

---

# Job To Be Done

**Référence :** JTBD-004 — Qualifier et déduire toutes les charges légitimes de mon activité LMNP *(à documenter dans le KS)*

> Lorsque j'ai réglé des dépenses liées à mon bien LMNP au cours de l'exercice,
> je veux que Fiscal AI détermine pour moi lesquelles sont déductibles, à quel montant et sous quelle forme,
> afin que mon résultat fiscal soit optimisé sans risque d'erreur de qualification.

**Rupture avec les JTBD précédents :** le verbe central est "déterminer", pas "établir" ou "extraire". Les JTBD précédents collectaient des faits objectifs. JTBD-004 qualifie des transactions — c'est un problème de classification, pas de mesure. Cette distinction conditionne l'ensemble de la conception.

---

# Diagnostic de situation

**Principe appliqué :** Constitution P16 (diagnostic avant demande) et P19 (moindre friction).
**Pattern mobilisé :** UXP-Scaffold — Inventaire structuré des charges attendues avant collecte *(statut : 🟡 Candidat, occurrence 1/3 — non encore documenté dans le KS)*

## Profilage de la situation (5 questions binaires)

Avant de collecter toute charge, le système établit le profil de charges attendues pour ce bien et cet exercice. Ces 5 questions prennent moins d'une minute et permettent au système de préparer un inventaire personnalisé.

| Question | Si Oui | Impact |
|---|---|---|
| Ce bien est-il en copropriété ? | Attendre : provisions, régularisation, fonds travaux | Active flux copropriété |
| Le bien est-il géré par une agence ? | Attendre : honoraires, frais de gestion, états des lieux | Active flux gestion |
| Y a-t-il eu des travaux ou réparations cette année ? | Activer le flux de qualification travaux | Active flux travaux |
| Ce bien a-t-il connu des périodes de vacance ? | Vérifier déductibilité pendant vacance | Alerte si usage personnel |
| Faites-vous appel à un expert-comptable ou logiciel ? | Attendre : honoraires comptables | Ajout à la liste attendue |

Ce profilage produit un inventaire personnalisé de catégories à remplir — c'est la "scaffold" de l'Assistant.

## Catégories attendues (selon le profil)

| Catégorie | Présente si | Traitement |
|---|---|---|
| Taxe foncière | Toujours | Simple — sauf prorata année d'acquisition |
| Assurance PNO | Toujours | Simple |
| Assurance GLI | Si assurance loyers impayés souscrite | Simple |
| Charges de copropriété | Si bien en copropriété | Complexe — voir flux dédié |
| Honoraires de gestion | Si agence | Simple — extraction relevé de gestion |
| Travaux et réparations | Si signalé | Complexe — qualification obligatoire par dépense |
| Honoraires comptables / logiciels | Si signalé | Simple |
| Frais bancaires | Toujours (optionnel) | Simple |
| Charges diverses | Toujours | Catch-all |

---

# Résultat attendu

| Output | Source | Validé par |
|---|---|---|
| `charges_deductibles_exercice` (par catégorie + total) | Qualification + calcul | Validation Engine + confirmation |
| `charges_amortissables_exercice` (liste, renvoyées vers F-010) | Qualification travaux | Validation Engine |
| `charges_non_deductibles_exercice` (signalées à l'utilisateur) | Qualification | Information utilisateur |
| `charges_pre_exploitation` (isolées, non déductibles) | Calcul depuis date_mise_en_service | Validation Engine |

L'Explanation Engine traduit le résultat en : "Vos charges déductibles pour [exercice] s'élèvent à €X. Détail : €Y de taxes, €Z d'assurances, €W de gestion, €V de charges copropriété, €U de réparations déductibles."

Pour chaque charge renvoyée en amortissement : "Votre [description] a été qualifiée comme une amélioration. Elle sera amortie sur [N] ans pour €X/an. Ce n'est pas une mauvaise nouvelle — c'est de la déductibilité étalée."

---

# Entrées

## Entités

- Dossier LMNP (identifiant, exercice fiscal, état)
- `date_mise_en_service` (F-009) — pour isolation pré-exploitation
- Plan d'amortissement (F-010) — pour cohérence si charge reclassifiée en composant
- Profil de charges attendues (produit par le profilage)

## Fields collectés — avec mode d'obtention

*Note : une nouvelle catégorie "Qualifier" apparaît pour les informations dont la saisie déclenche une classification fiscale (pas une valeur manquante). C'est une nuance de "Ask" — candidate en observation (1/3).*

| Field | Mode | Obligatoire | Note |
|---|---|---|---|
| `profil_copropriete` | **Demandé** | Oui | Détermine les catégories attendues |
| `profil_agence` | **Demandé** | Oui | Idem |
| `profil_travaux` | **Demandé** | Oui | Active ou désactive le flux travaux |
| `taxe_fonciere_montant` | Extrait / Demandé | Oui | Proratisé si année d'acquisition |
| `assurance_pno_montant` | Extrait / Demandé | Oui | |
| `assurance_gli_montant` | Extrait / Demandé | Si applicable | |
| `charges_copro_provisions` | Extrait (décompte) / Demandé | Si copropriété | Déductible |
| `charges_copro_regularisation` | Extrait / Demandé | Si copropriété | Déductible |
| `charges_copro_fonds_travaux` | Extrait / Demandé | Si copropriété | NON déductible — piège à signaler |
| `charges_copro_appels_gros_travaux[]` | Extrait / Demandé | Si copropriété + gros travaux | **Qualifier obligatoire** |
| `honoraires_gestion_annuel` | Extrait (relevé) / Demandé | Si agence | |
| `frais_etat_des_lieux` | Extrait / Demandé | Si applicable | |
| `frais_mise_en_location` | Extrait / Demandé | Si applicable | |
| `travaux[]` | Demandé (description + montant) | Si travaux signalés | **Qualifier obligatoire par item** |
| `travaux_nature[]` | **Qualifier** | Par item | Charge vs. amortissement vs. mixte |
| `honoraires_comptable` | Demandé | Si applicable | |
| `frais_bancaires` | Extrait / Demandé | Optionnel | |
| `remboursements_recus[]` | Demandé | Si sinistre / avoir | Réduction de charge |
| `charges_diverses[]` | Demandé | Optionnel | Catch-all |

## Moyens possibles

*Contrairement aux assistants précédents, il n'existe pas de document unique qui résoudrait 80% des charges. La diversité des sources est constitutive de ce problème.*

| Moyen | Couverture | Engines mobilisés |
|---|---|---|
| Import relevé de gestion annuel (agence) | Honoraires, frais, états des lieux | Document, OCR, Classification (niveau transaction), RT-003 |
| Import décompte annuel du syndic | Charges copropriété, fonds de travaux | Document, OCR, Classification (niveau transaction), RT-003 |
| Import avis de taxe foncière | Taxe foncière | Document, OCR, Classification |
| Import factures de travaux | Réparations, améliorations | Document, OCR, Qualification Engine |
| Saisie manuelle guidée par catégorie | Toutes | Question, Calculation, Validation |

---

# Sorties

## Entités créées

- `LigneCharge[]` : description, montant, catégorie, statut_déductibilité, source, exercice_paiement
- `ChargesExercice` : total_déductible, total_non_déductible, total_à_amortir, par_catégorie

## Événements produits

- `CHARGES_PARTIELLE` — émis après chaque catégorie complétée (permet sauvegarde progressive)
- `COMPOSANT_NOUVEAU` — émis si une dépense est qualifiée comme amélioration (transmis à F-010)
- `CHARGES_TERMINE` — toutes les catégories complètes, output validé

## État modifié

`FINANCEMENT_CONFIGURE` → `CHARGES_CONFIGUREES`

---

# Engines concernés

| Engine | Rôle dans cet Assistant | Limite identifiée |
|---|---|---|
| Workflow Engine | Gère le scaffold, les boucles par catégorie, la progression sauvegardée | Première gestion de loop à itérations variables |
| Document Engine | Reçoit des documents de natures très diverses (relevé gestion, décompte syndic, factures, avis taxe) | Fragments multiples par session — gestion d'un portefeuille de documents |
| OCR Engine | Traite des documents très hétérogènes en format et en structure | Décomptes syndic et relevés d'agence ont des formats propriétaires très variables |
| Classification Engine | **Doit classifier au niveau transaction, pas seulement document** | **3/3 — voir section "Points de vigilance"** |
| Question Engine | Présente les qualifications (réparation/amélioration) et les règles (fonds de travaux non déductible) | **3/3 — voir section "Points de vigilance"** |
| Calculation Engine | Somme, proratise (pré-exploitation, charges mixtes) | Rôle simple — aucune capacité générative requise ici |
| Validation Engine | Cohérence des montants + **complétude de l'inventaire** (catégories attendues vs. renseignées) | Nouveau rôle : vérification de complétude (1/3) |
| Explanation Engine | Explique les qualifications non intuitives (fonds de travaux, réparation vs. amélioration, charges pré-exploitation) | Rôle très sollicité — c'est l'assistant qui requiert le plus d'explications |

---

# Points de vigilance — Engines (seuils atteints)

**PV-1 — Classification Engine : granularité transaction (3/3)**

Trois occurrences de la même limite :
- F-010 : sous-types d'actes notariaux non différenciés
- F-011 : sous-types de documents financiers non présents dans la taxonomie
- F-012 : classification requise au niveau ligne/transaction à l'intérieur d'un document (décompte syndic contenant 6 types de charges)

**Ce candidat atteint 3/3.** La spécification du Classification Engine doit être étendue pour opérer à deux niveaux : classification du document entier (niveau actuel) ET classification de chaque transaction contenue dans ce document (niveau nouveau).

**PV-2 — Question Engine : guidance contextuelle (3/3)**

Trois occurrences du même dépassement de responsabilité :
- F-010 : exposition de Jugements (JUG-001/JUG-002) avec alternatives et recommandation
- F-011 : explication de la règle capital/intérêts avant affichage des résultats
- F-012 : assistance à la qualification (réparation vs. amélioration, fonds de travaux)

**Ce candidat atteint 3/3.** La spécification du Question Engine doit inclure une capacité de "guidance contextuelle" — présenter une règle fiscale en langage simple, en expliquer les implications, et recueillir un choix éclairé — en plus de la collecte d'information manquante.

---

# Transformations, Axiomes et Jugements concernés

| Référence | Rôle dans cet Assistant |
|---|---|
| AX-006 (analogue charges) | Charges non déductibles avant la date_mise_en_service |
| JUG-008 (à créer) | Qualification réparation vs. amélioration pour travaux individuels |
| JUG-009 (à créer) | Appels de fonds gros travaux copropriété : charge ou amortissement |
| JUG-010 (à créer) | Charges mixtes personnelles/professionnelles : proratisation |
| SAV-Charges-01 (backlog) | Méthode caisse : charge déductible l'année de paiement |
| SAV-Charges-02 (backlog) | Distinction réparation/amélioration |
| SAV-Charges-03 (backlog) | Fonds de travaux ALUR non déductible à la cotisation |
| SAV-Charges-04 (backlog) | Charges récupérables vs. non récupérables |
| SAV-Charges-05 (backlog) | Remboursement d'assurance : réduction de charge ou produit |
| SAV-PreExploitation (backlog, 2/3) | Charges avant mise en service non déductibles — taxe foncière, assurances, copro, travaux |

---

# Parcours utilisateur

## Macro-structure (scaffold)

```
ÉTAPE 1 — PROFILAGE (< 1 minute)
5 questions binaires → construction de l'inventaire personnalisé des catégories attendues

ÉTAPE 2 — COLLECTE PAR CATÉGORIE
Pour chaque catégorie de l'inventaire :
  → micro-flux dédié (voir ci-dessous)
  → CHARGES_PARTIELLE émis après chaque catégorie

ÉTAPE 3 — VÉRIFICATION DE COMPLÉTUDE
"Avez-vous des dépenses que nous n'avons pas encore abordées ?"
→ Champ libre + suggestions basées sur des oublis fréquents pour ce profil
→ Alertes douces sur les catégories attendues non renseignées

ÉTAPE 4 — RÉCAPITULATIF ET CONFIRMATION
→ Explication par catégorie + total
→ Charges renvoyées en amortissement listées séparément
→ Charges non déductibles expliquées
→ Confirmation → CHARGES_TERMINE
```

## Micro-flux : Taxe foncière

```
Avez-vous reçu un avis de taxe foncière pour ce bien cette année ?
├── Oui → Import de l'avis possible (extraction montant + période)
│         Ou saisie directe du montant
│         Si année d'acquisition : "Quelle part avez-vous réglée ?" (prorata acte)
│         Si date_mise_en_service dans l'exercice : isolation prorata pré-exploitation
│         → Montant déductible calculé
└── Non → "Avez-vous payé la taxe sur un exercice précédent ?" — clarification
```

## Micro-flux : Assurances

```
Quelles assurances avez-vous souscrites pour ce bien ?
(Liste proposée : PNO / GLI / Autre)

Pour chaque assurance sélectionnée :
  Montant annuel ? (import attestation ou saisie)
  ← Alerte si assurance emprunteur saisie ici (déjà dans F-011)
  → Déductible — ajouté aux charges
```

## Micro-flux : Charges de copropriété

```
Import du décompte annuel du syndic (si disponible) ?
├── Oui → Extraction et classification ligne par ligne :
│          Provisions courantes → déductibles
│          Régularisation annuelle → déductible (si positive)
│          Fonds de travaux ALUR → NON déductible
│            [Explanation Engine] : "Ce versement n'est pas encore une dépense — 
│             c'est une épargne forcée. Il sera déductible quand les travaux 
│             seront réalisés."
│          Appels de fonds gros travaux → Qualifier (voir micro-flux travaux)
│
└── Non → Saisie par type avec aide contextuelle
```

## Micro-flux : Frais de gestion

```
Import du relevé de gestion annuel de l'agence (si disponible) ?
├── Oui → Extraction : honoraires de gestion, frais d'état des lieux,
│          frais de mise en location, commissions de placement
│          Confirmation des totaux
└── Non → Saisie par ligne avec montants annuels
→ Toutes ces lignes sont déductibles — pas de qualification requise
```

## Micro-flux : Travaux et réparations (le plus complexe)

```
Pour chaque dépense de travaux / réparations signalée :

  Description en langage libre ? (ex: "remplacement chauffe-eau", "peinture salon")
  Montant ?
  Document disponible ? (import facture → extraction montant + description)

  [Question Engine — guidance contextuelle] :
  "Cette dépense a-t-elle remis le bien dans son état antérieur,
   ou a-t-elle amélioré / embelli quelque chose ?"
  
  Options proposées en langage courant :
  A — "Remplacé ou réparé quelque chose qui était cassé ou usé, à l'identique"
  B — "Amélioré quelque chose par rapport à ce qui existait avant"
  C — "Les deux à la fois (même facture)"
  D — "Je ne suis pas certain"

  ├── A → Charge déductible
  │        [Si montant > seuil d'alerte] : "Une dépense de €X mérite confirmation.
  │         Avez-vous une facture ?" — alerte douce
  │
  ├── B → Amortissement → COMPOSANT_NOUVEAU
  │        [Explanation Engine] : "Cette dépense sera amortie sur [N] ans pour
  │         €X/an — c'est de la déductibilité étalée, pas perdue."
  │        → Transmis à F-010 pour ajout au plan d'amortissement
  │
  ├── C → "Pouvez-vous estimer la part remise en état et la part amélioration ?"
  │        Part A → charge déductible
  │        Part B → amortissement
  │
  └── D → Questions complémentaires :
           "L'équipement remplacé était-il fonctionnel avant ?" → si non : réparation
           "Le nouveau modèle est-il de meilleure qualité/gamme ?" → si oui : amélioration
           → Qualification résultante présentée à confirmation

  → Passer à la dépense suivante
```

## Micro-flux : Charges diverses

```
Y a-t-il d'autres dépenses liées à ce bien que nous n'avons pas encore abordées ?

Suggestions contextuelles :
- Honoraires d'expert-comptable ou de conseiller fiscal
- Abonnement logiciel de gestion ou de déclaration
- Frais bancaires liés au compte dédié
- Frais de déplacement pour la gestion du bien
- Frais d'annonces ou de recherche de locataire

Pour chaque item saisi : description + montant
→ Classification automatique tentée depuis la description
→ Si ambigu : question de qualification courte
```

---

# Contraintes métier

- Toute charge payée avant la `date_mise_en_service` (F-009) est isolée et non déductible. L'utilisateur est informé mais n'est pas bloqué.
- Le fonds de travaux ALUR n'est jamais déductible l'année de son versement. Cette règle s'applique sans exception.
- L'assurance emprunteur ne doit jamais apparaître dans cet assistant (déjà dans F-011). Si détectée, alerte de doublon.
- Le remboursement du capital du prêt ne doit jamais être accepté comme charge (déjà dans F-011). Si détecté, erreur bloquante avec explication.
- Une dépense qualifiée comme "amélioration" génère un événement `COMPOSANT_NOUVEAU` transmis à F-010. F-012 ne calcule pas l'amortissement de ce composant.
- Pour les charges à cheval sur deux exercices, le principe de caisse s'applique : déductible l'année du paiement, point.

---

# Cas limites

| Situation | Comportement attendu |
|---|---|
| Taxe foncière de l'année d'acquisition | Demander la quote-part acheteur (issue de l'acte notarié F-010) + vérification pré-exploitation |
| Appel de fonds gros travaux copropriété | Qualification obligatoire — jamais présupposée comme charge |
| Fonds de travaux ALUR saisi comme charge | Correction automatique + explication pourquoi non déductible |
| Réparation > €5 000 sans facture | Alerte — demande de confirmation renforcée + note de risque contrôle fiscal |
| Facture travaux mixtes (réparation + amélioration) | Scindage manuel demandé — chaque part qualifiée séparément |
| Assurance emprunteur saisie ici par erreur | Alerte de doublon — renvoi vers F-011 |
| Remboursement d'assurance reçu cette année pour sinistre | Demande si la réparation correspondante est dans cet exercice (réduction) ou un exercice antérieur (revenu à déclarer) |
| Charges de bien non loué toute l'année (vacance) | Si vacance = recherche active de locataire → déductible. Si vacance = usage personnel → proratisation requise |
| Charge payée pour plusieurs biens (PROF-005) | Saisie du montant total + répartition manuelle entre les biens |
| Régularisation de charges de l'exercice précédent | Déductible dans l'exercice courant (méthode caisse) — information utilisateur si date couverte ≠ date exercice |

---

# Dépendances

| Feature | Relation |
|---|---|
| F-009 — Assistant Activité | Fournit `date_mise_en_service` pour isolation pré-exploitation |
| F-010 — Assistant Logement | Reçoit `COMPOSANT_NOUVEAU` si amélioration qualifiée |
| F-011 — Assistant Financement | Partage le périmètre des charges — coordination pour éviter les doublons |
| F-006 — Calcul fiscal | Consomme `total_charges_deductibles_exercice` pour le résultat fiscal |
| F-013 — Assistant Travaux *(à venir)* | Si travaux importants : F-013 peut prendre le relais pour la qualification détaillée des travaux |

---

# Performance

- Extraction d'un décompte de syndic (Classification niveau transaction) : asynchrone.
- Extraction d'un relevé de gestion annuel : asynchrone.
- Qualification d'une charge (Question Engine) : synchrone.
- Calcul du total charges déductibles : synchrone après chaque micro-flux.
- Sauvegarde progressive (`CHARGES_PARTIELLE`) : obligatoire — cet assistant peut prendre plusieurs sessions.

---

# Sécurité

- Données de charges soumises au même RLS que les autres données fiscales.
- Source de chaque ligne tracée (extraite / saisie / déduite / calculée).
- Qualification de chaque ligne tracée (charge / amortissement / non déductible) avec la règle appliquée.
- Un composant transmis à F-010 via `COMPOSANT_NOUVEAU` est irrévocable sans action explicite sur le plan d'amortissement.

---

# Critères d'acceptation

✓ Un utilisateur avec un bien en copropriété géré par agence peut compléter l'assistant en important deux documents (décompte syndic + relevé de gestion) et en répondant aux questions de qualification sur les travaux éventuels.

✓ Le fonds de travaux ALUR n'apparaît jamais dans les charges déductibles — même si l'utilisateur tente de le saisir.

✓ Toute charge qualifiée comme "amélioration" est transmise à F-010 via `COMPOSANT_NOUVEAU` et n'est pas comptabilisée comme charge déductible.

✓ Les charges payées avant la mise en location sont automatiquement isolées et présentées comme non déductibles, avec explication.

✓ L'assurance emprunteur saisie ici déclenche une alerte de doublon.

✓ La sauvegarde progressive fonctionne — l'utilisateur peut reprendre l'assistant sur une session différente.

✓ Le Validation Engine produit une alerte si des catégories attendues (taxe foncière, assurance) ne sont pas renseignées.

---

# Tests

## Cas nominal

Utilisateur (PROF-002) avec bien en copropriété géré par agence. Profilage : copropriété oui, agence oui, travaux non. Import décompte syndic → 4 lignes : provisions €1 800, régularisation €-120, fonds de travaux €120, appel gros travaux €800. Provisions et régularisation → déductibles. Fonds de travaux → correction + explication. Appel gros travaux → qualification : "remise en état du toit → déductible" → €800 déductible. Import relevé agence → honoraires €780 + état des lieux €180 → déductibles. Taxe foncière saisi manuellement €1 200 → déductible. Total : €4 640.

## Cas travaux complexe

Facture unique de €12 000 pour "rénovation complète de la salle de bain". Question Engine : "amélioré ou remis en état ?" → "Les deux". Scindage demandé : €4 000 remise en état (carrelage cassé), €8 000 nouvelle installation (douche italienne remplaçant baignoire). €4 000 → charge déductible. €8 000 → COMPOSANT_NOUVEAU transmis à F-010.

## Cas pré-exploitation

Bien mis en service le 1er juin. Taxe foncière annuelle de €1 200. Prorata : 5 mois sur 12 → €500 déductibles / €700 non déductibles (pré-exploitation). Explanation Engine explique le calcul et la règle.

---

# Erreurs d'implémentation interdites

- Déduire le fonds de travaux ALUR l'année de son versement.
- Accepter le remboursement de capital du prêt comme une charge (doublon avec F-011).
- Qualifier automatiquement "réparation" sans poser la question de qualification à l'utilisateur.
- Omettre l'isolation des charges pré-exploitation.
- Transmettre une charge à F-010 comme composant sans émettre `COMPOSANT_NOUVEAU`.
- Appliquer la méthode d'engagement (rattachement à l'exercice couvert) au lieu de la méthode caisse (rattachement à l'exercice de paiement).
- Déduire les provisions pour charges de copropriété non encore versées (seules les provisions réellement payées sont déductibles).
