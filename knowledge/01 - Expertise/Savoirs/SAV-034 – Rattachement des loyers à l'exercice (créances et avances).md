---
id: SAV-034
title: "Rattachement des loyers à l'exercice : loyers acquis, créances et avances"
type: savoir
status: review
version: "1.0"
created: 2026-10-05
updated: 2026-10-05
owner: product-owner
source: "Audit fiscal FISCAL-PROOF-F013-39C (externe au dépôt ; conclusions validées par le Product Owner pour F013-V2.1). Références officielles (CGI, BOFiP) à joindre par le Product Owner avant approbation : elles ne sont pas reproduites ici, aucune n'a pu être vérifiée dans cette mission (fiscal-proof-standard : ne pas inventer)."
tags: [recettes, loyers, rattachement, creances, avances, f013, exercice]
catégorie: concept
domaine: fiscal
portée: "Loyers ordinaires d'un bien LMNP au réel. Hors domaine automatique : provision pour créance douteuse, perte définitive, GLI, litige, annulation ou remise complexe, plateformes (produit brut vs net), traitement des autres produits."
supersedes: SAV-028
justifie: [TRF-0036]
éclaire: [F-013, ADR-012]
---

# SAV-034 — Rattachement des loyers à l'exercice

> **Statut : `review`.** Cet objet remplace la règle de SAV-028 dans le Knowledge cible. Il n'est pas encore `approved` : seul le Product Owner peut l'approuver (KS-004). Tant qu'il ne l'est pas, aucune règle fiscale définitive ne doit être déduite de ce seul document.
>
> **TARGET CONTRACT.** Cette règle décrit le contrat fiscal cible (F013 v2). **CURRENT PRODUCTION :** F013 v1 reste le parcours productif et applique encore l'ancienne logique « encaissements » (voir [[SAV-028 – Les recettes sont les loyers encaissés]], `LEGACY V1 ONLY`).

## Règle

Pour les loyers ordinaires, les encaissements ne constituent pas, à eux seuls, les recettes fiscales de l'exercice.

- Un loyer **acquis** au titre de N appartient à N, même s'il est encaissé en N+1.
- Un loyer encaissé en N pour une période **postérieure** à N n'est pas un produit de N.
- Une **créance** locative de clôture intervient donc dans le rattachement ; une **avance** reçue également.

```
Loyers acquis N = E + CC − CO + AO − AC
```

| Terme | Définition |
|---|---|
| E | encaissements locatifs qualifiés de l'exercice N (règlements d'anciennes créances et avances inclus ; dépôt de garantie, mouvements personnels et sommes non qualifiées exclus) |
| CC | créances locatives à la clôture N (loyers acquis non encaissés au 31/12/N) |
| CO | créances locatives à l'ouverture N (loyers d'avant N non encaissés au 01/01/N) |
| AO | loyers encaissés d'avance à l'ouverture N (encaissés avant N pour N ou après) |
| AC | loyers encaissés d'avance à la clôture N (encaissés en N pour une période après N) |

La formule est appliquée **une seule fois** (jamais cumulée avec un ajustement janvier/décembre). Le calcul est fait par l'unique moteur défini dans [[TRF-0036 – Rattachement des loyers ordinaires à l'exercice (F013 v2)]].

## Conséquences à ne jamais contredire

1. **Un impayé ne supprime pas automatiquement le produit acquis.** Un loyer non payé en fin d'exercice est une créance de clôture, pas une absence de produit.
2. **Vacance, changement de loyer, exercice partiel** ne se reconstruisent pas par `loyer mensuel × 12`. Ils résultent de faits annuels établis (encaissements et soldes), jamais d'une extrapolation.
3. **La date de paiement et la période économique sont deux informations différentes.** « Loyer décembre 2025 payé le 05/01/2026 » : paiement 2026-01-05, période 2025-12. Ce loyer n'est pas un produit de janvier 2026. Inversement, « loyer janvier 2026 payé le 20/12/2025 » est encaissé en 2025 mais n'est pas un produit 2025 (avance de clôture 2025).
4. **Une valeur inconnue n'est jamais zéro.** `UNKNOWN ≠ VALIDATED(0)`.
5. Un résultat économiquement incohérent (loyers acquis négatifs) est un diagnostic bloquant, jamais un zéro forcé.

## Exemples validés

| Cas | E | CO | CC | AO | AC | Loyers acquis |
|---|---|---|---|---|---|---|
| Normal | 12 000 | 0 | 0 | 0 | 0 | 12 000 |
| Décembre payé en N+1 | 11 000 | 0 | 1 000 | 0 | 0 | 12 000 |
| Créance d'ouverture réglée | 13 000 | 1 000 | 0 | 0 | 0 | 12 000 |
| Avance reçue | 13 000 | 0 | 0 | 0 | 1 000 | 12 000 |
| Paiement couvrant plusieurs périodes | 3 000 | 0 | 0 | 0 | 1 000 | 2 000 |
| Impayé persistant | 11 000 | 0 | 1 000 | 0 | 0 | 12 000 |
| Vacance | 11 000 | 0 | 0 | 0 | 0 | 11 000 |

## Hors domaine automatique

Ces situations exigent une règle distincte (non établie) et rendent le rapprochement `OUT_OF_DOMAIN` plutôt qu'un calcul approché : provision pour créance douteuse, perte définitive, GLI, litige, annulation ou remise complexe, plateformes (produit brut vs payout net insuffisamment documenté), indemnités et remboursements.

## Ce que cette règle ne fait pas

- Elle ne traite pas le plafond de déductibilité des amortissements (article 39 C) : **KNOWN SEPARATE FISCAL CORRECTION — NOT PART OF F013 V2** (voir [[SAV-030 – Plafond 39 C avant imputation des déficits antérieurs]], [[SAV-031 – Granularité du plafond 39 C en LMNP multi-bien]]).
- Elle ne définit aucune écriture comptable (FEC : `NOT STARTED`).
