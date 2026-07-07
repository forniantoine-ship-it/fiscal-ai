---
id: F-013
title: Assistant Revenus
type: feature
status: draft
version: "1.0"
created: 2026-07-01
updated: 2026-07-01
owner: product-owner
priorité: haute
tags: [feature, revenus, recettes, bail, réconciliation, lmnp]
jtbd: [JTBD-005]
profils: [PROF-001, PROF-002, PROF-003, PROF-004, PROF-005]
ux-patterns: [UXP-001, UXP-Reconcile]
depends_on_ks:
  confirmed: [SAV-028, SAV-009]
  candidates: [SAV-REV-01, SAV-REV-02, SAV-REV-03, SAV-REV-04]
---

# F-013 — Assistant Revenus

---

# Note structurelle pour les futurs auteurs

Cet Assistant appartient à une famille distincte de F-009 à F-012.

F-009 à F-011 collectent des faits objectifs (arbre convergent).
F-012 qualifie une collection ouverte de transactions (scaffold + micro-flux).

F-013 fait autre chose : il **réconcilie**.

Avant que l'utilisateur parle, le système dispose d'une référence quantifiée — le revenu théorique déductible du bail et des périodes de location. Le travail de l'Assistant n'est pas d'énumérer des recettes. C'est de confronter la réalité déclarée à cette référence, d'expliquer tout écart, et de produire un total défendable.

Ce pattern — **Ancrage → Déclaration → Confrontation → Sources additionnelles → Validation** — est nouveau dans Fiscal AI. Il doit être formalisé comme UXP-Reconcile pour les futurs Assistants de même nature.

---

# Mission

Établir le montant total des recettes locatives de l'exercice, en le réconciliant avec le revenu théorique attendu du bail, afin que le Calculation Engine dispose d'une base de recettes juste, exhaustive et défendable.

Cet Assistant ne demande pas à l'utilisateur de connaître les règles fiscales. Il ne demande pas non plus de "remplir un formulaire de revenus". Il pose la question qui importe : est-ce que ce que vous avez encaissé correspond à ce que vous auriez dû encaisser ?

**Règle clé jamais exposée telle quelle à l'utilisateur :** en LMNP réel, les recettes sont les loyers *encaissés* au cours de l'exercice (CGI art. 38-2 — SAV-028), pas les loyers dus ou facturés. Un loyer de décembre payé en janvier est une recette de l'exercice suivant.

---

# Valeur utilisateur

À l'issue de cet Assistant, l'utilisateur dispose d'un total de recettes qu'il comprend, qu'il peut justifier, et qui est cohérent avec tout ce que le système sait déjà de son dossier (durée de location, bail, périodes de vacance).

Il n'a jamais eu à penser en termes de "méthode caisse", de "loyers encaissés vs facturés", ou de périmètre fiscal des recettes. Il a répondu à des questions sur sa réalité concrète, et le système a effectué les requalifications nécessaires.

---

# Déclencheur

L'utilisateur accède à l'étape "Revenus" de son dossier LMNP, depuis le Workflow Engine, après la complétion de l'Assistant Charges (F-012).

---

# Préconditions

- L'Assistant Charges est terminé (événement `CHARGES_TERMINE` ou `CHARGES_SKIP` reçu)
- La `date_mise_en_service` est connue (F-009)
- L'exercice fiscal est défini (année N)
- L'utilisateur est authentifié

**Données souhaitables mais non bloquantes :**
- `loyer_mensuel` — si disponible depuis un document précédent, pré-rempli ; sinon collecté ici
- `periodes_vacance` — si déclarées dans F-010 ou F-012, utilisées comme ancrage partiel

---

# Job To Be Done

**Référence :** JTBD-005 — Déclarer des revenus locatifs justes sans risquer de se tromper *(à documenter dans le KS)*

> Lorsque je dois déclarer les revenus de ma location meublée,
> je veux que Fiscal AI m'aide à vérifier que le chiffre que j'ai en tête est bien le bon,
> afin de ne pas sous-déclarer par oubli ni sur-déclarer par erreur de périmètre.

**Rupture avec les JTBD précédents :** le verbe central est "vérifier", pas "établir", "extraire" ou "qualifier". L'utilisateur arrive avec une estimation. L'Assistant ne repart pas de zéro — il confronte cette estimation à une référence que le système peut calculer indépendamment. C'est la signature de la famille Réconciliation.

---

# Ce que l'Assistant sait faire

- Calculer le revenu théorique de l'exercice à partir du bail et des périodes de location connues
- Détecter les écarts entre revenu théorique et revenu déclaré
- Qualifier l'écart (vacance, impayé, décalage de paiement, loyer partiel)
- Appliquer la règle d'encaissement (SAV-028) pour recaler les montants sur l'exercice correct
- Appliquer le prorata temporis si le bien n'a pas été loué toute l'année (SAV-009)
- Identifier et tracer les sources de recettes non-standard (en s'appuyant sur les SAV candidats — voir section dédiée)
- Produire un total réconcilié avec traçabilité complète

# Ce que l'Assistant ne fait pas

- Calculer le résultat fiscal (F-006)
- Qualifier des charges (F-012)
- Modifier les données du bail ou du bien (F-010)
- Décider si un revenu est imposable ou non sans règle KS validée — dans ce cas, il documente et suspend

---

# Diagnostic de situation

**Principe :** l'Assistant construit d'abord une image de la situation locative de l'exercice avant de demander les montants. Cette image devient la référence de réconciliation.

**Questions de diagnostic (≤ 3, binaires ou à choix unique) :**

```
Q1 — Type de location sur l'exercice :
     [A] Location longue durée (bail résidentiel)
     [B] Location saisonnière / touristique (Airbnb, Booking, Abritel…)
     [C] Les deux (mixte)

Q2 — Continuité du bail :
     [A] Un seul locataire sur toute l'année
     [B] Changement de locataire en cours d'année
     [C] Périodes sans locataire (vacance)

Q3 — Loyer type "charges comprises" ou "hors charges" ?
     [A] Charges comprises (le locataire paie un forfait tout inclus)
     [B] Hors charges + provisions (deux lignes sur le quittancement)
     [C] Je ne sais pas
```

Ces trois questions permettent de construire le scaffold de réconciliation personnalisé.

---

# Parcours utilisateur

## Macro-structure (UXP-Reconcile)

```
PHASE 1 — ANCRAGE (automatique, < 10 secondes)
  Système calcule le revenu théorique de l'exercice
  Données utilisées : loyer_mensuel × mois_location - vacances_connues
  Résultat affiché à l'utilisateur comme point de départ

PHASE 2 — DÉCLARATION
  "Combien avez-vous encaissé ?"
  Collecte du montant brut perçu

PHASE 3 — CONFRONTATION
  Comparaison automatique : déclaré vs. théorique
  Si cohérent → validation directe
  Si écart > seuil → qualification de l'écart

PHASE 4 — SOURCES ADDITIONNELLES
  Identification des recettes hors loyer base
  (traitement dépendant des SAV candidats — voir ci-dessous)

PHASE 5 — VALIDATION
  Total réconcilié affiché
  Confirmation utilisateur
  Émission REVENUS_TERMINE
```

---

## Phase 1 — Ancrage

Le système calcule et affiche :

```
Sur la base de votre bail (loyer : X €/mois),
votre activité de location meublée sur 2024
représente un revenu théorique de Y €.

Nous allons maintenant vérifier ensemble ce que vous avez réellement encaissé.
```

**Calcul de l'ancrage :**

```
revenu_theorique =
  loyer_mensuel
  × mois_location_effectifs          ← SAV-009 prorata temporis si démarrage en cours d'année
  - mois_vacance_declares × loyer_mensuel
```

Si `loyer_mensuel` est inconnu (pas collecté avant) : le système le demande maintenant, avec justification ("Pour vérifier la cohérence de vos revenus, nous avons besoin du loyer mensuel inscrit dans votre bail.").

**Cas particulier — charges comprises vs. hors charges :**

Si Q3 = [B] (hors charges + provisions) : l'ancrage inclut loyer HC + provision charges.

> **⚠ SAV-CANDIDATE-REV-02 — Traitement fiscal des charges récupérées**
>
> *Blocage de conception détecté.*
>
> En LMNP réel, les provisions sur charges que le locataire verse sont-elles incluses dans les recettes, et la régularisation annuelle (trop-perçu restitué / complément demandé) modifie-t-elle le montant déclaré ?
>
> SAV-028 ne couvre que "les loyers encaissés" sans préciser le sort des provisions de charges récupérables.
>
> *Décision de conception par défaut (en l'absence de SAV validé) :* l'Assistant inclut dans les recettes le total encaissé par le propriétaire au titre du loyer ET des provisions, sans traitement de la régularisation. Ce comportement est conservateur (aucune recette omise) et sera affiné quand SAV-REV-02 sera validé.
>
> *Traitement : candidat SAV. Conception continue.*

---

## Phase 2 — Déclaration

Question directe, sans jargon :

```
Au total, combien avez-vous encaissé sur votre compte bancaire
au titre de cette location en 2024 ?

[Champ montant] €

Incluez loyer + charges si vous les percevez ensemble.
N'incluez pas le dépôt de garantie.
```

La note sur le dépôt de garantie est non négociable : c'est l'erreur la plus fréquente (PROF-001, PROF-003 incluent spontanément le dépôt dans leurs recettes).

---

## Phase 3 — Confrontation

**Cas A — Déclaré ≈ Théorique (écart < 5 %)**

```
✓ Vos revenus encaissés (X €) sont cohérents avec votre bail (Y € attendus).

Quelques questions pour finaliser :
→ Avez-vous encaissé des loyers en janvier 2024 correspondant
  au mois de décembre 2023 ? [Oui / Non]
→ Des loyers de décembre 2024 ont-ils été payés en janvier 2025 ? [Oui / Non]
```

La règle SAV-028 (encaissement) est appliquée silencieusement. Si l'utilisateur répond "Oui" à l'une ou l'autre, le système recale le montant sans exposer la règle technique.

**Cas B — Déclaré < Théorique (écart ≥ 5 %)**

```
Vous déclarez X € encaissés.
Sur la base de votre bail, nous attendions Y €.

Il manque Z €. Pouvez-vous nous aider à comprendre ?

[A] Des loyers n'ont pas été payés (locataire défaillant)
[B] Le bien était vacant sur certaines périodes non encore déclarées
[C] J'ai loué à un loyer inférieur au bail pendant une période
[D] Autre raison
```

Chaque réponse déclenche un micro-flux dédié (voir ci-dessous).

**Cas C — Déclaré > Théorique (écart ≥ 5 %)**

```
Vous déclarez X €, soit Z € de plus qu'attendu selon votre bail.

Cet excédent peut s'expliquer par :
[A] Un rattrapage de loyers en retard de l'année précédente
[B] Des recettes de location complémentaire (garage, parking…)
[C] D'autres revenus liés à ce bien
[D] Une erreur dans le montant que j'ai saisi
```

L'option [A] est traitée par SAV-028 : le loyer de décembre N-1 encaissé en janvier N est une recette N, non N-1. Si c'est le cas, il est bien dans les recettes N. Pas de requalification — confirmation que c'est correct.

---

## Micro-flux — Impayés

```
Vous indiquez que des loyers n'ont pas été payés.

→ Ces loyers sont-ils couverts par une assurance loyers impayés (GLI) ?
  [Oui] → Avez-vous reçu un règlement de l'assureur ?
            [Oui] → Quel montant ? (→ recette au moment de l'encaissement)
            [Non] → Ces loyers ne sont pas des recettes de l'exercice.
  [Non] → Ces loyers ne sont pas des recettes. Nous les documentons.
```

> **⚠ SAV-CANDIDATE-REV-04 — Indemnités de remplacement de loyers (GLI, VISALE)**
>
> *Blocage de conception partiel.*
>
> L'indemnité versée par l'assureur GLI en remplacement d'un loyer impayé est-elle une recette au moment de son encaissement par le propriétaire ? La règle d'encaissement (SAV-028) s'applique-t-elle de la même façon aux indemnités d'assurance qu'aux loyers directs ?
>
> *Décision de conception par défaut :* oui, l'indemnité est traitée comme une recette à la date d'encaissement, par extension de SAV-028. Comportement identique au loyer. À confirmer par SAV-REV-04.
>
> *Traitement : candidat SAV. Conception continue.*

---

## Micro-flux — Vacance non déclarée

```
Vous indiquez une période sans locataire non encore renseignée.

→ Du [date] au [date] ? (saisie libre)
→ Le bien était-il en travaux pendant cette période ? [Oui / Non]
→ Avez-vous perçu une indemnité d'assurance pendant cette vacance ? [Oui / Non]
```

La vacance est intégrée à l'ancrage (révision du revenu théorique). Elle est également transmise à F-010 si elle n'était pas déclarée (événement `VACANCE_DETECTEE`).

---

## Phase 4 — Sources additionnelles

Présentée uniquement si le scaffold l'exige (diagnostic Q1 = [B] ou [C]).

**Branche — Location de plateforme (Airbnb, Booking, Abritel)**

```
Pour votre activité de location touristique, vous avez probablement reçu
des virements de plateforme (Airbnb, Booking…).

→ Quel est le total des virements reçus de ces plateformes en 2024 ? [montant]
→ Disposez-vous du relevé annuel de la plateforme ? [Oui → upload / Non → continuer]
```

> **⚠ SAV-CANDIDATE-REV-03 — Revenus de plateformes touristiques**
>
> *Blocage de conception significatif.*
>
> Les plateformes versent au propriétaire un montant NET (après déduction de leur commission). Or la commission de plateforme est une charge déductible, pas une réduction de recette. La recette fiscale devrait donc être le montant BRUT facturé au voyageur, et la commission apparaît en charges.
>
> Mais : dans la pratique, la majorité des utilisateurs LMNP meublé-tourisme déclarent le montant NET reçu (ce qui minore leurs recettes ET leurs charges). L'administration accepte-t-elle les deux méthodes ?
>
> *Décision de conception par défaut (conservatrice) :* l'Assistant collecte le montant versé par la plateforme (net) sans retraitement. Il informe l'utilisateur qu'il peut traiter différemment s'il dispose du relevé brut, mais ne l'y contraint pas. Ce comportement sera affiné quand SAV-REV-03 sera validé.
>
> La commission de plateforme, si connue, est transmise à F-012 comme charge déductible via l'événement `CHARGE_DETECTEE`.
>
> *Traitement : candidat SAV. Conception continue.*

---

## Phase 5 — Validation et total

```
Récapitulatif de vos recettes 2024 :

  Loyers encaissés (base bail)     X €
  Ajustements décalage Jan/Déc     ± Y €
  Indemnités assurance             Z €
  Revenus plateforme               W €
  ─────────────────────────────────────
  Total recettes déclarables       T €

Ce total est cohérent avec votre bail et les périodes de location déclarées.

[Valider] [Modifier un poste]
```

Si l'utilisateur clique "Modifier un poste", retour au micro-flux concerné.

---

# Sorties

## Entités créées

- `RecettesExercice` : total_recettes, par_source{loyers, indemnités, plateformes}, exercice
- `LigneRecette[]` : source, montant, période, statut_encaissement, origine_sav[]
- `RevenuTheorique` : montant_attendu, base_calcul{loyer_mensuel, mois_location}, delta_expliqué

## Événements produits

- `REVENUS_PARTIEL` — émis après chaque phase validée (sauvegarde progressive)
- `VACANCE_DETECTEE` — si vacance non déclarée identifiée (transmis à F-010 pour cohérence)
- `CHARGE_DETECTEE` — si commission plateforme identifiable (transmis à F-012)
- `REVENUS_TERMINE` — total réconcilié validé, toutes sources couvertes

## État modifié

`CHARGES_CONFIGUREES` → `REVENUS_CONFIGURES`

---

# Engines concernés

| Engine | Rôle dans cet Assistant | Limite identifiée |
|---|---|---|
| Workflow Engine | Orchestre les 5 phases, gère les branchements (bail simple vs. plateforme vs. mixte) | Première gestion de branchement conditionnel basé sur le type de location |
| Calculation Engine | Calcule le revenu théorique, applique SAV-009 (prorata), recale les montants Jan/Déc | Rôle principal — déterministe, aucune IA requise |
| Validation Engine | Compare déclaré vs. théorique, détecte les écarts, qualifie leur nature | **Nouveau rôle : réconciliation quantifiée** — comparer deux valeurs et produire une analyse d'écart |
| Question Engine | Qualifie les écarts (impayé / vacance / décalage), collecte les sources additionnelles | Guidance contextuelle (PV-2 confirmé) |
| Document Engine | Traite les relevés plateforme (Airbnb Annual Report, Booking statement) | Formats propriétaires non encore couverts par la taxonomie |
| Explanation Engine | Explique SAV-028 (encaissement) sans jargon, explique le retraitement Jan/Déc | Rôle sollicité — la règle d'encaissement est contre-intuitive pour PROF-001 |

---

# Points de vigilance — Engines

**PV-1 — Validation Engine : réconciliation quantifiée (1/3)**

F-013 introduit un nouveau rôle pour le Validation Engine : comparer une valeur déclarée à une valeur calculée indépendamment par le système, produire un écart en valeur absolue et en pourcentage, et déclencher une procédure de qualification si cet écart dépasse un seuil.

Ce rôle est distinct de la validation de cohérence inter-champs (déjà connue) et de la validation de complétude (introduite par F-012). C'est une capacité de réconciliation. **Seuil 1/3 atteint — à surveiller.**

---

# Candidats SAV identifiés pendant la conception

Ces candidats n'ont pas bloqué la conception — ils ont été contournés par des décisions par défaut conservatives. Ils doivent être soumis à validation KS avant que cet Assistant soit marqué `approved`.

| Candidat | Titre | Impact sur la conception | Décision par défaut appliquée |
|---|---|---|---|
| SAV-REV-01 | Périmètre exhaustif des recettes LMNP | Quelles sources inclure au-delà des loyers ? | Inclus : loyers, indemnités assurance, revenus plateforme. Exclus : dépôt de garantie. |
| SAV-REV-02 | Traitement fiscal des charges récupérées | Provisions locataire incluses dans les recettes ? Régularisation annuelle ? | Provisions incluses, régularisation non traitée. |
| SAV-REV-03 | Revenus de plateformes touristiques | Montant brut (voyageur) ou net (virement plateforme) comme recette ? | Net par défaut, commission transmise en charge si connue. |
| SAV-REV-04 | Indemnités de remplacement de loyers (GLI, VISALE) | Indemnité = recette à l'encaissement ? | Oui, par extension de SAV-028. |

**Condition de passage en `approved` :** les quatre candidats sont validés dans le KS et la conception est alignée sur les règles retenues.

---

# Transformations et Savoirs concernés

| Référence | Rôle dans cet Assistant |
|---|---|
| SAV-028 | Règle fondatrice : recettes = loyers encaissés. Appliquée dans les phases 2, 3 et le micro-flux impayés. |
| SAV-009 | Prorata temporis : si acquisition ou début de location en cours d'année, le revenu théorique est proratisé. |
| SAV-017 | Pré-exploitation : avant `date_mise_en_service`, aucune recette n'est possible par définition. L'ancrage commence à cette date. |
| SAV-020 | Risque de contestation : une vacance longue sans justification peut être remise en cause. Déclenche un avertissement. |
| SAV-021 | Intention locative : si vacance longue, l'assistant signale la nécessité de preuves. Non exposé comme règle fiscale. |
| TRF-REV-01 (à créer) | Calcul du revenu théorique : `loyer_mensuel × mois_location × prorata_temporis` |
| TRF-REV-02 (à créer) | Réconciliation : `ecart = revenu_declare - revenu_theorique` + qualification de l'écart |

---

# Scaffold personnalisé — Matrice de parcours

Le diagnostic (Q1 × Q2 × Q3) produit un scaffold sur mesure. Cette matrice décrit le chemin emprunté selon les réponses.

| Q1 | Q2 | Q3 | Mode ancrage | Phases actives | Micro-flux possible |
|---|---|---|---|---|---|
| A (longue durée) | A (1 locataire) | A ou B | Ancrage fort : `loyer × 12` (ou prorata SAV-009) | 1-2-3-5 | Jan/Déc, impayé, vacance, loyer révisé |
| A (longue durée) | B (changement) | A ou B | Ancrage composite : Σ loyer_i × mois_i | 1-2-3-5 | Changement de locataire, inter-bail, Jan/Déc |
| A (longue durée) | C (vacance) | A ou B | Ancrage ajusté : `loyer × mois_loués` | 1-2-3-5 | Vacance, durée, intention locative |
| B (plateforme) | — | — | Pas d'ancrage — mode collecte | 2-4-5 | Virements plateforme, commission |
| C (mixte) | Variable | Variable | Ancrage partiel (longue durée) + collecte (plateforme) | 1-2-3-4-5 | Tous |
| Tout | Tout | C (ne sait pas) | Ancrage calculé sur le montant brut déclaré | Variable | Question de clarification Q3 |

**Règle d'or du scaffold :** un utilisateur en mode `B (plateforme pur)` ne voit jamais de référence calculée — le système n'a aucune base pour en produire une. Le pattern Réconciliation ne s'applique pas. L'Assistant bascule en mode Collecte structurée pour ce cas uniquement.

---

## Micro-flux — Changement de locataire (Q2 = B)

Déclenché lorsque l'utilisateur indique un changement de locataire en cours d'année.

```
Vous avez eu plusieurs locataires en 2024.

Pour chaque période de location, nous avons besoin du loyer mensuel
et des dates de début et de fin.

Période 1 :
  → Loyer mensuel   [montant] €  (charges comprises / hors charges)
  → Du [date] au [date]

Période 2 :
  → Loyer mensuel   [montant] €
  → Du [date] au [date]

[+ Ajouter une période]

Entre les deux locataires, le bien était-il vacant ?
  [Oui] → Du [date] au [date] → déclenche micro-flux Vacance
  [Non] → Passage direct
```

**Calcul de l'ancrage composite :**
```
revenu_theorique = Σ (loyer_i × jours_i / 30.5)
                  - mois_vacance × loyer_moyen_pondéré
```

**Règle de prorata jours** : si un locataire entre le 15 du mois, il paie 15/30 de loyer. Le système calcule au jour près pour éviter de sur-estimer la référence. Toute différence résiduelle avec le déclaré est traitée en phase 3 (confrontation).

---

## Micro-flux — Loyer inférieur au bail (Cas B → [C])

Déclenché lorsque l'utilisateur indique avoir perçu un loyer inférieur au montant inscrit dans le bail.

```
Vous indiquez avoir perçu un loyer inférieur au montant de votre bail.

→ Cela correspond à :
  [A] Un geste commercial (mois offert, réduction temporaire)
  [B] Une révision formelle du loyer (avenant au bail)
  [C] Une période de travaux partiels avec accord du locataire
  [D] Autre situation

→ Sur combien de mois ?  [nombre]
→ Montant effectivement perçu sur cette période ?  [montant]
```

**Traitement :**
- Le loyer effectivement encaissé est la recette (SAV-028 — encaissement prime sur facturation).
- Le système révise l'ancrage pour cette période : pas d'écart résiduel à expliquer.
- Si [A] : aucune conséquence fiscale — le loyer encaissé est la recette.
- Si [B] : l'ancrage est définitivement révisé à la baisse pour la période concernée.
- Si [C] : le système note que des travaux ont eu lieu — cohérence avec F-012 vérifiée.

---

## Micro-flux — Q3 = C (ne sait pas si charges comprises ou hors charges)

```
Pas de problème — regardons ensemble votre quittancement ou votre bail.

→ Lorsque votre locataire vous vire son loyer, vous voyez :
  [A] Un seul virement mensuel (un seul montant, tout inclus)
  [B] Deux lignes distinctes sur votre relevé (loyer + provision charges)
  [C] Je ne vois pas de distinction, mais je ne suis pas certain

→ Si [A] ou [C] : traité comme "charges comprises" — montant total = recette
→ Si [B] : traité comme "hors charges + provisions" — deux montants additionnés
```

L'Explanation Engine n'expose pas la distinction fiscale. Il aide l'utilisateur à lire son relevé bancaire, pas à comprendre la règle.

---

## Micro-flux — Vacance longue

Déclenché lorsque la vacance déclarée dépasse un seuil de durée.

> **⚠ SAV-CANDIDATE-REV-05 — Seuil de vacance déclenchant un risque fiscal**
>
> *Blocage partiel.*
>
> SAV-020 signale un risque de contestation en cas de "retard injustifié" entre fin des travaux et mise en location. SAV-021 exige une intention locative démontrable. Mais aucune règle ne définit le seuil de durée à partir duquel ce risque devient significatif.
>
> *Décision par défaut :* le seuil est fixé à **6 mois consécutifs** de vacance. En dessous, l'assistant collecte sans alerter. Au-delà, il informe et demande une justification. Ce seuil sera ajusté quand SAV-REV-05 sera validé.
>
> *Traitement : candidat SAV. Conception continue.*

**Comportement si vacance < 6 mois :**
```
Période de vacance enregistrée : [date début] → [date fin]
L'ancrage est ajusté en conséquence.
```

**Comportement si vacance ≥ 6 mois :**
```
Votre bien semble avoir été vacant pendant [N] mois en 2024.

Une vacance prolongée peut attirer l'attention de l'administration fiscale,
notamment si des charges ont été déduites pendant cette période.

Pour sécuriser votre dossier, pouvez-vous indiquer la raison principale ?
  [A] Travaux importants en cours
  [B] Recherche active de locataire (annonces, mandat agence)
  [C] Situation familiale ou personnelle
  [D] Autre raison

→ Avez-vous des preuves de cette période (annonces, devis, mandat) ?
  [Oui → upload ou note]  [Non → je comprends le risque]
```

La justification est stockée dans le dossier comme pièce de défense (SAV-021 — intention locative). L'Explanation Engine ne cite jamais SAV-021 ni SAV-020 par leur nom. Il parle de "sécuriser le dossier".

---

## Branche saisonnière pure (Q1 = B) — Mode Collecte

Pour la location de plateforme pure, l'ancrage n'existe pas. Le pattern Réconciliation est remplacé par un pattern Collecte structurée.

```
Pour votre activité de location touristique en 2024 :

→ Sur quelles plateformes avez-vous loué ?
  □ Airbnb   □ Booking   □ Abritel / Vrbo   □ Autre

→ Disposez-vous du récapitulatif annuel de chaque plateforme ?
  [Oui → upload]  [Non → je saisis manuellement]

→ Si saisie manuelle :
  Total des virements reçus d'Airbnb en 2024 :   [montant] €
  Total des virements reçus de Booking en 2024 :  [montant] €
  Autres revenus directs (hors plateforme) :      [montant] €
```

**Validation de cohérence sans ancrage :**

En l'absence de référence calculée, le Validation Engine applique une validation de vraisemblance :
- Montant / nuits déclarées → loyer par nuit implicite
- Si loyer/nuit < 10 € ou > 2 000 € → alerte "montant inhabituel, pouvez-vous vérifier ?"
- Cohérence avec la surface du bien (F-010) si disponible

> **⚠ OBS-F013-01 — Mode Collecte pour plateforme : absence de référence**
>
> La validation de cohérence saisonnière (loyer/nuit × nuits) nécessite que l'utilisateur déclare un nombre de nuits ou une période d'activité. Aucune règle KS ne définit les seuils de vraisemblance (min/max par nuit). Les seuils appliqués (10 € / 2 000 €) sont des estimations de bon sens.
>
> *Enregistré dans REGISTRE-OBSERVATIONS pour suivi.*

---

# Traitement spécifique — PROF-003 (Non-déclaré)

PROF-003 est l'utilisateur qui n'a jamais déclaré son activité LMNP et qui régularise plusieurs années.

**Détection :** si `date_mise_en_service` < janvier N-1 ET `premiere_declaration = true`, l'Assistant signale la situation.

```
Votre bien est en location depuis [année].
Nous allons établir vos revenus pour 2024 (exercice N).

Si vous devez régulariser des années antérieures,
chaque exercice fera l'objet d'un dossier distinct.
Souhaitez-vous commencer par 2024 ou par une année antérieure ?
```

**Règle de traitement :** F-013 est mono-exercice. La régularisation multi-années est orchestrée par le Workflow Engine en instanciant F-013 autant de fois que nécessaire, un exercice par instance. Chaque dossier est indépendant.

**Pas de traitement spécifique dans F-013** pour les années antérieures — c'est une décision de Workflow, pas de Feature. F-013 ne sait pas qu'il est instancié plusieurs fois.

---

# Règles de validation du Validation Engine

Le Validation Engine de F-013 applique trois types de contrôles.

## Type 1 — Réconciliation quantifiée

| Condition | Action |
|---|---|
| `abs(déclaré - théorique) / théorique < 5%` | Validation directe, questions Jan/Déc |
| `5% ≤ écart < 20%` | Confrontation Phase 3 — qualification de l'écart requise |
| `écart ≥ 20%` | Confrontation obligatoire + Explanation Engine activé |
| `déclaré = 0` ET `théorique > 0` | Blocage — l'Assistant demande confirmation explicite avant de valider un revenu nul |

## Type 2 — Cohérence interne

| Vérification | Source | Action si incohérence |
|---|---|---|
| `recettes > 0` ET `date_mise_en_service` dans l'exercice | SAV-017 | Vérifier que les recettes commencent après `date_mise_en_service` |
| `recettes = 0` ET aucune vacance déclarée ET bien actif | — | Alerte — situation incohérente, demander confirmation |
| Vacance ≥ 6 mois | SAV-020, SAV-021 | Micro-flux vacance longue |
| `loyer_implicite = déclaré / mois_location` hors fourchette `loyer_mensuel ± 15%` | — | Alerte montant inhabituel |

## Type 3 — Cohérence inter-Assistants

| Vérification | Croisement avec | Action |
|---|---|---|
| Vacance déclarée ici ≠ vacance dans F-010 | F-010 | Événement `INCOHERENCE_VACANCE` — demande arbitrage utilisateur |
| Travaux déclarés comme cause de vacance ici | F-012 | Vérifier que des charges de travaux existent pour la même période |
| Recettes plateforme déclarées | F-012 | Vérifier que commission plateforme est déclarée en charge |

---

# Scripts de l'Explanation Engine

Ces scripts sont déclenchés à des moments précis du parcours. Ils ne citent jamais les références fiscales.

## EXP-F013-01 — Pourquoi le dépôt de garantie n'est pas un revenu

*Déclenché si : l'utilisateur mentionne le dépôt ou si le montant déclaré inclut manifestement plus qu'un an de loyer.*

```
"Le dépôt de garantie que vous avez reçu à l'entrée du locataire
n'est pas un revenu — il vous a été confié temporairement et doit
être restitué à la fin du bail. Il n'entre donc pas dans vos recettes
de 2024, même si vous l'avez bien encaissé cette année-là."
```

## EXP-F013-02 — La règle décembre/janvier (SAV-028 sans jargon)

*Déclenché si : l'utilisateur répond "Oui" à la question de recalage Jan/Déc.*

```
"En déclaration LMNP, ce qui compte c'est la date à laquelle
vous avez reçu l'argent — pas la période que ce loyer couvre.

Le loyer de décembre 2023 payé en janvier 2024 : c'est une recette 2024.
Le loyer de décembre 2024 payé en janvier 2025 : c'est une recette 2025.

Nous avons ajusté votre total en conséquence."
```

## EXP-F013-03 — Le loyer impayé n'est pas une recette

*Déclenché dans le micro-flux impayés, si aucune GLI.*

```
"Un loyer que votre locataire n'a pas payé n'est pas une recette —
vous ne l'avez pas encaissé. Il ne figure donc pas dans vos revenus 2024.

Si vous obtenez un remboursement ultérieur (via un jugement ou une assurance),
il sera à déclarer l'année où vous le percevrez effectivement."
```

## EXP-F013-04 — Vacance longue (SAV-020/021 sans jargon)

*Déclenché dans le micro-flux vacance longue (≥ 6 mois).*

```
"Une vacance longue n'est pas un problème en soi —
mais l'administration peut s'interroger si vous avez déduit des charges
pendant cette période sans pouvoir justifier que vous cherchiez
activement un locataire.

Conserver une trace de vos démarches (annonces, mandats, correspondances)
est la meilleure protection en cas de contrôle."
```

## EXP-F013-05 — Montant plateforme net vs brut

*Déclenché dans la branche plateforme si l'utilisateur a le relevé annuel.*

```
"Airbnb et Booking vous versent le loyer après avoir prélevé leur commission.
Ce que vous avez reçu sur votre compte, c'est le montant net.

Vous pouvez déclarer ce montant net — c'est la pratique la plus simple.
Si vous préférez déclarer le montant brut (ce que les voyageurs ont payé),
la commission devient alors une charge déductible que nous ajoutons à votre dossier."
```

---

# Lien aval — Contribution à F-006 (Calcul fiscal)

F-013 produit pour F-006 exactement ce dont le Calculation Engine a besoin.

| Champ produit | Utilisé par | Transformation cible |
|---|---|---|
| `recettes_totales_exercice` | F-006 | TRF résultat fiscal : recettes - charges - amortissements |
| `loyers_encaisses` | F-006 | Composante principale des recettes |
| `indemnites_assurance` | F-006 | Composante recettes si SAV-REV-04 validé |
| `recettes_plateforme_net` | F-006 | Composante recettes (mode net par défaut) |
| `mois_location_effectifs` | F-006 | Vérification cohérence amortissement (prorata SAV-009) |
| `vacances_exercice[]` | F-006 | Croisement avec charges de la période |

**Contrat de sortie vers F-006 :**

F-006 ne doit jamais calculer ses propres recettes. Il consomme `RecettesExercice.total_recettes` comme une donnée validée, traçable, issue de F-013. La responsabilité de la justesse des recettes appartient entièrement à F-013.

---

# Candidats SAV mis à jour

| Candidat | Titre | Impact | Décision par défaut |
|---|---|---|---|
| SAV-REV-01 | Périmètre exhaustif des recettes LMNP | Quelles sources inclure ? | Loyers, indemnités, plateforme. Exclu : dépôt de garantie. |
| SAV-REV-02 | Traitement fiscal des charges récupérées | Provisions dans les recettes ? Régularisation ? | Provisions incluses, régularisation non traitée. |
| SAV-REV-03 | Revenus de plateformes touristiques | Brut ou net ? | Net par défaut, choix proposé si relevé disponible. |
| SAV-REV-04 | Indemnités de remplacement de loyers (GLI, VISALE) | Recette à l'encaissement ? | Oui, par extension SAV-028. |
| SAV-REV-05 | Seuil de vacance déclenchant un risque fiscal | À partir de combien de mois alerter ? | 6 mois par défaut. |

**Observations enregistrées :**
- OBS-F013-01 : seuils de vraisemblance loyer/nuit pour mode saisonnier — à confirmer par données marché.

**Condition de passage en `approved` :** SAV-REV-01 à SAV-REV-05 validés dans le KS, OBS-F013-01 traitée.
