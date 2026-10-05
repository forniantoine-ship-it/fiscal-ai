---
id: TRF-0036
title: "Rattachement des loyers ordinaires à l'exercice (F013 v2)"
type: transformation
status: approved
version: "1.1"
created: 2026-10-05
updated: 2026-10-05
owner: product-owner
tags: [recettes, loyers, rattachement, f013, inventaire, fail-closed]
catégorie: calcul
requiert: [SAV-034]
supersedes: TRF-0029
---

# TRF-0036 — Rattachement des loyers ordinaires à l'exercice (F013 v2)

> **Statut : `approved`** — décision explicite du Product Owner du 2026-10-05, après la gate fiscale F013-V2.5.1. **TARGET CONTRACT.** L'approbation ne vaut pas activation : F013 v2 reste désactivé (voir ADR-012).
> **CURRENT PRODUCTION :** F013 v1 reste productif ([[TRF-0029 – Calcul des recettes]], `LEGACY V1 ONLY`). Le moteur décrit ici existe dans le code mais est **désactivé en production** et **n'est pas branché à F006 ni au bilan productif**.
> TRF-0035 est réservé à l'allocation 39 C par bien (voir ADR-011) et n'est pas utilisé ici.
>
> **Preuve fiscale (V2.5.1).** La règle de rattachement qui fonde cette transformation est établie dans [[SAV-034 – Rattachement des loyers à l'exercice (créances et avances)]] à partir de sources officielles (CGI, BOFiP). Ce document précise le **contrat technique** ; il n'ajoute aucune règle fiscale.

## Entrées (par bien et par exercice)

Cinq termes en centimes entiers, chacun `UNKNOWN`, `PROPOSED` ou `VALIDATED` : encaissements E, créances d'ouverture CO et de clôture CC, avances d'ouverture AO et de clôture AC. Plus : la **couverture** des encaissements (`UNKNOWN`, `PARTIAL`, `COMPLETE`, proposée ou validée) et la revue explicite des exceptions.

## Logique

```
Loyers acquis N = E + CC − CO + AO − AC
```

`DERIVED RECONCILIATION IDENTITY` : aucun texte officiel n'imprime cette formule ; elle est dérivée des règles prouvées (SAV-034, section « Dérivation », fondée sur BOI-BIC-DECLA-30-20-20 § 170). Elle est valable pour le domaine supporté de SAV-034, sous réserve que les cinq termes soient correctement qualifiés.

Appliquée une seule fois. Définition des termes : [[SAV-034 – Rattachement des loyers à l'exercice (créances et avances)]].


## Règle fiscale ou convention technique ?

À ne jamais confondre :

| Élément | Nature |
|---|---|
| Rattachement des loyers acquis, créances, avances, neutralisation des encaissements déjà reconnus | **règle fiscale** (SAV-034, sources officielles) |
| Formule `E + CC − CO + AO − AC` | **identité dérivée** de ces règles |
| États `UNKNOWN` / `PROPOSED` / `VALIDATED`, couverture, statuts `SUPPORTED` / `NEEDS_CONFIRMATION` / `OUT_OF_DOMAIN`, fail-closed, révision et empreinte, confirmation liée à la révision, snapshot v3 | **conventions techniques** de fiabilité (aucune source fiscale ne les impose ; justifiées par fiscal-proof-standard : ne jamais inventer ni extrapoler) |
| Liste des situations `OUT_OF_DOMAIN` | **choix de périmètre** : ces situations relèvent de règles distinctes non établies dans le produit, pas d'une absence de règle fiscale |

## Sorties

`SUPPORTED` (loyers acquis, quatre soldes, trace, version, révision, bien) · `NEEDS_CONFIRMATION` (un fait manquant, proposé ou incohérent peut être résolu dans le domaine) · `OUT_OF_DOMAIN` (une règle distincte serait nécessaire). Hors `SUPPORTED` : **aucun montant fiscal définitif** (jamais `totalRecettes = 0`, jamais le seul cash disponible).

## Fail-closed

Le moteur refuse tout résultat définitif si : encaissement inconnu ; couverture inconnue, partielle ou seulement proposée ; l'un des quatre soldes `UNKNOWN` ou seulement `PROPOSED` ; montant invalide ; identité ou bien incohérent ; contrat legacy présenté comme v2 ; exceptions non passées en revue ; résultat négatif (jamais de plancher à zéro).

## Invariants canoniques

1. **Autorité de calcul unique.** Le moteur F013 v2 est l'unique autorité pour les loyers acquis. Ni l'OCR, ni le pont documentaire, ni la grille, ni le bilan, ni la RFS, ni F006 ne reproduisent ou réinterprètent la formule.
2. **`UNKNOWN ≠ VALIDATED(0)`.** Vaut pour CO, CC, AO, AC, couverture, période économique et attribution à un bien. Un « non » explicite de l'utilisateur est `VALIDATED(0)` ; l'absence de réponse reste `UNKNOWN`.
3. **`PROPOSED ≠ VALIDATED`.** Chaîne : extraction / OCR / document → observation → proposition → éventuelle correction → validation utilisateur → fait validé. Une proposition ne devient jamais validée automatiquement, au rechargement, lors d'un calcul, ni parce que sa confiance est élevée. Une couverture `COMPLETE` proposée par extraction n'est pas une validation.
4. **Paiement ≠ période.** `paymentDate` et `rentalPeriod` sont deux faits conservés séparément. Ne jamais déduire l'un de l'autre.
5. **Source unique de l'inventaire locatif.** `rentReconciliationV2` est l'unique propriétaire éditable de CO, CC, AO, AC. Le bilan en est un consommateur en lecture seule (voir ci-dessous). Interdit : deux saisies indépendantes d'une même réalité.
6. **Ouverture ≠ clôture.** CO et AO servent au rattachement de l'exercice courant ; ils ne deviennent jamais une créance ou une avance de clôture. CC et AC constituent aussi l'inventaire de clôture.
7. **Les faits, pas le total.** Une modification d'un fait invalide les sorties dépendantes (`fiscalResult`, RFS, liasse, génération) et la confirmation, **même si le total des loyers acquis est identique** (ex. E 12 000 / CC 0 → E 11 000 / CC 1 000 : 12 000 dans les deux cas, inventaire de bilan différent).
8. **Confirmation liée à la révision.** La confirmation porte sur une révision et une empreinte précises des faits ; elle n'est valable que si les deux concordent encore avec un recalcul du moteur.
9. **Un bien, une source.** Une source de revenus scopée à un bien ne contribue qu'à ce bien ; une source sans `propertyId` n'est jamais attribuée implicitement au bien actif. Architecture : biens → faits et contributions par bien → consolidation → **ONE F006** (jamais un F006 autonome par bien).

## Observations documentaires

Une observation préserve, lorsque disponible : identité stable, document source, texte source, montant (centimes), sens, nature, date réelle de paiement, période économique, `propertyId`, confiance, correction utilisateur (valeur extraite originale, valeur proposée, valeur retenue) et provenance. Un paiement multi-périodes reste **un** paiement : une ventilation n'existe que si elle est documentée ou corrigée, et sa somme égale le paiement. Un dépôt de garantie n'est jamais classé silencieusement comme loyer. Un payout de plateforme net est signalé `insufficient_for_rent_reconciliation` : le produit brut n'est pas reconstruit.

**La grille agrégée n'est pas une transaction bancaire.** Une correction de grille ne fabrique ni date de paiement, ni preuve, ni transactions fictives.

**Couverture documentaire** : trouver des paiements ne prouve pas que tous les encaissements de l'année sont présents. Trois relevés sur douze ne donnent jamais `COMPLETE`.

## Inventaire locatif et bilan (cible)

| Inventaire (clôture) | Nature du bilan | Case 2033-A |
|---|---|---|
| créance locative de clôture | `LOYER_DU_PAR_LOCATAIRE` (actif) | 068 |
| avance locative de clôture | `LOYER_ENCAISSE_D_AVANCE` (passif) | 174 |

Les faits gardent leur `propertyId` avant consolidation : A : CC 1 000 et B : AC 700 restent identifiables (A → créance 1 000 ; B → avance 700). Un solde n'est fourni au bilan que s'il est `VALIDATED` pour chaque bien de l'exercice ; `UNKNOWN` laisse le bilan `INCONNU`, `PROPOSED` ne devient jamais un poste définitif.

## Continuité N → N+1 — `V2 IMPLEMENTED BUT OFF` (F013-V2.6)

Contrat futur (conséquence de l'identité : les soldes de début d'exercice sont les valeurs correspondantes de la clôture précédente — BOI-BIC-DECLA-30-20-20 § 170, voir SAV-034) :

```
CC(N) → CO(N+1)        AC(N) → AO(N+1)
```

La continuité doit conserver : le **bien** (même `propertyId`), le **montant** (sans réinterprétation), la **nature** (créance vs avance, jamais interverties ; CO ne devient jamais une créance de clôture), la **provenance** (faits et observations d'origine) et la **preuve de la reconnaissance antérieure** (révision et empreinte confirmées de N). Elle ne doit **jamais** reconnaître deux fois le produit : le règlement en N+1 d'une créance de N est un encaissement N+1 neutralisé par CO ; une avance reçue en N est reconnue une seule fois, en N+1, par AO. Un solde sans preuve de reconnaissance en N ne se reporte pas : `UNKNOWN`, jamais zéro.

Oracles (vérifiés arithmétiquement et juridiquement en V2.5.1) :

| Cas | N | N+1 | Résultat |
|---|---|---|---|
| Créance | E 11 000, CC 1 000 → acquis 12 000 | E 12 000 (dont règlement de 1 000), CO 1 000 | 12 000 − 1 000 = **11 000** (aucun produit recréé par le règlement) |
| Avance | E 13 000, AC 1 000 → acquis 12 000 | E 11 000 (hors l'avance encaissée en N), AO 1 000 | 11 000 + 1 000 = **12 000** (produit différé reconnu une fois) |

**Implémentée (F013-V2.6), désactivée en production.** La continuité est calculée par un module pur et transportée par la transition existante (même transaction que la clôture de N). Le garde `f013_v2_continuity_not_supported` n'est plus un refus global : c'est un **garde de capacité et de validité**. La clôture est admise si et seulement si, pour chaque bien portant un état F013 v2, l'état N est **définitif** (moteur `SUPPORTED` et confirmation fraîche : révision, empreinte et total concordants) et la continuité est constructible ; sinon elle reste refusée avec des raisons structurées. Les ouvertures héritées sont `VALIDATED` avec la provenance `prior_year_continuity` (distincte d'une validation utilisateur) et portent leur chaîne de preuve (bien, exercice source, nature, révision et empreinte de N) ; `VALIDATED(0)` donne `VALIDATED(0)`, `UNKNOWN` ne donne jamais zéro ; CC, AC, encaissements et couverture de N+1 restent `UNKNOWN`, rien n'est confirmé, le total de N n'est pas copié. Aucun texte consulté n'imprime l'égalité `CC(N) = CO(N+1)` : elle est dérivée.

## Statut d'implémentation (au 2026-10-05)

| Élément | Statut |
|---|---|
| Contrat et moteur pur | **V2 IMPLEMENTED BUT OFF** |
| Saisie manuelle, persistance, confirmation | **V2 IMPLEMENTED BUT OFF** (route `/assistants/revenus-v2` désactivée par défaut) |
| Observations documentaires, pont de propositions | **V2 IMPLEMENTED BUT OFF** (aucun appelant en production) |
| Inventaire commun, projection vers le bilan | **V2 IMPLEMENTED BUT OFF** (non branché au bilan productif) |
| Projection 2033-A (cases 068 et 174) | testée par le chemin existant bilan → RFS ; non branchée à la génération productive |
| Branchement F006 productif | **FUTURE / NOT IMPLEMENTED** |
| Continuité N → N+1 | **V2 IMPLEMENTED BUT OFF** (garde de capacité ; la clôture d'un dossier F013 v2 n'est admise que si l'état N est définitif ; F013 v2 reste désactivé) |
| FEC / comptabilité | **NOT STARTED** |

## Oracles validés

| Oracle | E | CO | CC | AO | AC | Attendu |
|---|---|---|---|---|---|---|
| F013-01 normal | 12 000 | 0 | 0 | 0 | 0 | 12 000 |
| F013-02 décembre payé N+1 | 11 000 | 0 | 1 000 | 0 | 0 | 12 000 |
| F013-03 créance d'ouverture | 13 000 | 1 000 | 0 | 0 | 0 | 12 000 |
| F013-04 avance | 13 000 | 0 | 0 | 0 | 1 000 | 12 000 |
| F013-05 multi-périodes | 3 000 | 0 | 0 | 0 | 1 000 | 2 000 |
| F013-06 impayé persistant | 11 000 | 0 | 1 000 | 0 | 0 | 12 000 |
| F013-07 vacance | 11 000 | 0 | 0 | 0 | 0 | 11 000 |
| F013-08 changement de loyer | 11 100 | 0 | 0 | 0 | 0 | 11 100 |
| F013-09 exercice partiel | 8 500 | 0 | 0 | 0 | 0 | 8 500 |
| F013-10 multi | A 12 000 ; B 7 000 + CC 1 000 | — | — | — | — | A 12 000 ; B 8 000 ; consolidé 20 000 |
| F013-11 données insuffisantes | 12 000 seul | inconnu | inconnu | inconnu | inconnu | `NEEDS_CONFIRMATION`, aucun total |

Les zéros sont de vrais `VALIDATED(0)`.
