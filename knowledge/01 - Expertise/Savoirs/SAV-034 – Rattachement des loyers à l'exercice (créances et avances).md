---
id: SAV-034
title: "Rattachement des loyers à l'exercice : loyers acquis, créances et avances"
type: savoir
status: review
version: "1.1"
created: 2026-10-05
updated: 2026-10-05
owner: product-owner
source: "Sources officielles consultées le 2026-10-05 (détail, paragraphes et versions dans la section « Sources officielles ») : CGI art. 38 (Légifrance, en vigueur depuis le 16/02/2025) ; CGI art. 302 septies A ter A ; annexe III au CGI art. 38 sexdecies-00 A ; BOI-BIC-BASE-20-10 ; BOI-BIC-PDSTK-10-10-10 ; BOI-BIC-PDSTK-10-10-20 ; BOI-BIC-CHAMP-40-20 ; BOI-BIC-DECLA-30-20-20 ; BOI-BIC-DECLA-30-20-10 ; BOI-BIC-PROV-40-20. L'audit FISCAL-PROOF-F013-39C (externe au dépôt) reste l'origine de la règle ; les sources officielles ci-dessous la vérifient."
tags: [recettes, loyers, rattachement, creances, avances, f013, exercice]
catégorie: concept
domaine: fiscal
portée: "Loyers ordinaires d'un bien LMNP au réel. Hors domaine automatique : provision pour créance douteuse, perte définitive, GLI, litige, annulation ou remise complexe, plateformes (produit brut vs net), traitement des autres produits."
supersedes: SAV-028
justifie: [TRF-0036]
éclaire: [F-013, ADR-012]
---

# SAV-034 — Rattachement des loyers à l'exercice

> **Statut : `review`.** Cet objet remplace la règle de SAV-028 dans le Knowledge cible. Il n'est pas encore `approved` : seul le Product Owner peut l'approuver (KS-004). **Preuve fiscale établie en V2.5.1** (voir « Sources officielles ») : la règle de rattachement et la formule sont étayées par des sources officielles ; recommandation d'approbation préparée pour le Product Owner.
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

> **DERIVED RECONCILIATION IDENTITY.** Aucun texte officiel n'imprime cette formule. C'est une identité de réconciliation **dérivée** des règles prouvées (voir « Dérivation »). Elle n'est pas une règle fiscale autonome.

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


## Sources officielles (consultées le 2026-10-05)

Seules des sources de `legifrance.gouv.fr`, `bofip.impots.gouv.fr` et `impots.gouv.fr` fondent la règle. Les textes du BOFiP ont été lus dans leur texte brut ; les textes de loi de Légifrance ont été lus par extraction automatique (le site refuse l'accès direct) : la lecture des articles de loi est à reconfirmer sur la page officielle avant toute citation juridique.

| Source (version consultée) | Paragraphe(s) | Ce qu'elle démontre | Ce qu'elle ne démontre pas |
|---|---|---|---|
| CGI art. 38 — [Légifrance](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000042907895) (en vigueur depuis le 16/02/2025) | 1, 2 et 2 bis | bénéfice net déterminé d'après les résultats d'ensemble des opérations de toute nature ; produits correspondant à des créances sur la clientèle ou à des versements reçus à l'avance rattachés à l'exercice de la livraison ou de l'achèvement des prestations ; prestations continues rémunérées par intérêts ou **loyers** prises en compte au fur et à mesure de l'exécution | ne dit pas, seul, comment qualifier chaque situation de bail ; n'énonce aucune formule |
| BOI-BIC-BASE-20-10 — [créances acquises](https://bofip.impots.gouv.fr/bofip/6391-PGP.html/identifiant=BOI-BIC-BASE-20-10-20121204) (en vigueur depuis le 04/12/2012) | § 1, 20, 70, 140 | une créance est acquise si elle est certaine dans son principe et déterminée dans son montant (§ 1), **indépendamment de la date d'exigibilité et de l'époque du recouvrement** (§ 20) ; versements reçus à l'avance rattachés à l'exercice de la livraison/achèvement (§ 70) ; prestations continues rémunérées notamment par des **loyers** : produits pris en compte au fur et à mesure de l'exécution (§ 140) ; remarque du § 20 : une créance acquise peut être compromise (douteuse, litigieuse) sans être perdue | ne traite pas spécifiquement le LMNP ; ne fixe pas le traitement d'une perte définitive |
| BOI-BIC-PDSTK-10-10-10 — [prestations de services](https://bofip.impots.gouv.fr/bofip/1483-PGP.html/identifiant=BOI-BIC-PDSTK-10-10-10-20120912) (en vigueur depuis le 12/09/2012) | § 230, 290, 300 | les entreprises dont l'objet est la **location** comprennent dans leurs produits les sommes effectivement encaissées **ainsi que les créances acquises à la clôture** (§ 230) ; elles font état à la clôture de toutes les créances acquises correspondant aux « locations consenties », quelle que soit la date d'exigibilité et de recouvrement (§ 290) ; les « fruits civils », acquis au jour le jour, sont comptabilisés dès lors qu'ils sont courus à la clôture (§ 300) | vise les entreprises dont l'objet principal est la location ; son application à un LMNP passe par BOI-BIC-CHAMP-40-20 § 56 |
| BOI-BIC-PDSTK-10-10-20 — [produits autres que les ventes](https://bofip.impots.gouv.fr/bofip/1482-PGP.html/identifiant=BOI-BIC-PDSTK-10-10-20-20130610) (en vigueur depuis le 10/06/2013) | § 240, 245, 250 | immeubles donnés en location : les loyers (fruits civils, acquis au jour le jour) sont rattachés à l'exercice **au cours duquel ils sont courus** (§ 240) ; **loyers payés d'avance** : l'imposition est répartie sur la durée du bail (§ 245) ; suppléments de loyer et revenus annexes inclus (§ 250) | le § 245 vise les « loyers d'avance » stipulés au bail sans ambiguïté ; une somme qualifiée ainsi mais fonctionnant comme garantie n'est pas démontrée |
| BOI-BIC-CHAMP-40-20 — [location meublée, régime fiscal](https://bofip.impots.gouv.fr/bofip/3610-PGP.html/identifiant=BOI-BIC-CHAMP-40-20-20260819) (version du **19/08/2026**, en vigueur) | § 56, 57 | **loueur en meublé au régime réel** (normal ou simplifié), professionnel ou non : bénéfice net déterminé dans les **conditions de droit commun** (art. 38, 2 du CGI) en faisant masse de l'ensemble des produits et charges (§ 56) ; le BOFiP emploie la notion de « **loyer acquis** » pour le plafond 39 C (§ 57) | ne règle pas le rattachement de chaque situation ; le § 57 concerne le 39 C (hors F013) |
| BOI-BIC-DECLA-30-20-20 — [obligations comptables, réel simplifié](https://bofip.impots.gouv.fr/bofip/3418-PGP.html/identifiant=BOI-BIC-DECLA-30-20-20-20141006) (en vigueur depuis le 06/10/2014) | § 50, 60, 70, 170, 260-270, 420 | comptabilité super-simplifiée : faculté sur option annuelle (§ 50, 60) ; enregistrement journalier des seuls encaissements et paiements, créances et dettes constatées en fin d'année (§ 70) ; **la constatation des sommes restant à encaisser en fin d'exercice et leur rapprochement avec les valeurs du début de l'exercice permettent de passer de la comptabilité de trésorerie à la comptabilité commerciale, et il faut faire abstraction des encaissements qui correspondent à des créances déjà constatées pour éviter qu'elles soient prises en compte deux fois** (§ 170) ; dépenses de frais généraux payées à échéances régulières ≤ 1 an : mesure réservée aux **dépenses** (§ 260-270) ; **aucune incidence sur la définition du bénéfice taxable ; l'exploitant ne peut se limiter à une comptabilité de trésorerie en faisant abstraction des créances et dettes à la clôture** (§ 420) | ne cite pas expressément les loueurs en meublé (voir PROOF-04.1) ; le § 270 prend des loyers **payés** (charge) comme exemple : il ne concerne pas les loyers **reçus** |
| BOI-BIC-DECLA-30-20-10 — [obligations fiscales, réel simplifié](https://bofip.impots.gouv.fr/bofip/2833-PGP.html/identifiant=BOI-BIC-DECLA-30-20-10-20260819) (version du 19/08/2026, en vigueur) | § 40 | l'option pour la comptabilité super-simplifiée se fait chaque exercice, en cochant la case de la déclaration 2031-SD | ne traite pas la détermination du résultat |
| CGI art. 302 septies A ter A — [Légifrance](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000025842170) (version du 07/05/2012) | 1 | exploitants individuels (art. 239 quater A) soumis au régime de l'art. 302 septies A bis peuvent tenir une comptabilité super-simplifiée n'enregistrant journellement que les encaissements et paiements ; créances et dettes constatées à la clôture ; exception pour les dépenses de frais généraux à échéances régulières | ne modifie pas la définition du bénéfice (BOFiP § 420) ; ne vise pas expressément le LMNP |
| Annexe III au CGI art. 38 sexdecies-00 A — [Légifrance](https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006069574/LEGISCTA000006191349/) (version du 24/06/1991) | — | l'option se fait au titre de chaque exercice sur la déclaration de résultats (art. 53 A du CGI) | ne détaille pas les enregistrements (renvoi à l'art. 302 septies A ter A) |
| BOI-BIC-PROV-40-20 — [provisions créances douteuses ou litigieuses](https://bofip.impots.gouv.fr/bofip/1284-PGP.html/identifiant=BOI-BIC-PROV-40-20-20150401) (en vigueur depuis le 01/04/2015) | § 10, 20 | une créance irrécouvrable est une **charge** de l'exercice où la perte est certaine et définitive ; une créance douteuse ou litigieuse reste **inscrite à l'actif** et peut donner lieu à provision (déduction distincte) | ne définit pas le rattachement initial du produit ; non implémenté dans le produit |
| BOI-BIC-CHG-10-30-10 et BOI-BIC-CHG-10-30-20 | — | rattachement des **charges** (y compris en super-simplifié) | ne concerne pas les produits ; non utilisé pour fonder la règle |
| BOI-BIC-CESS-30-20 — cessation (version du 10/07/2013) | — | — | la mention de « créances acquises non recouvrées » lue concerne des sociétés exerçant une profession **non commerciale** : **ne prouve rien** pour un LMNP |
| BOI-BIC-BASE-40-20-10 — intangibilité du bilan d'ouverture (version du 19/05/2021) | — | cohérence des bilans d'ouverture et de clôture en matière de corrections symétriques (art. 38, 4 bis) | n'énonce pas à lui seul que l'inventaire d'ouverture reprend celui de clôture |
| impots.gouv.fr — [« Dois-je déclarer les loyers de ma location meublée en incluant les charges ? »](https://www.impots.gouv.fr/particulier/questions/dois-je-declarer-les-loyers-de-ma-location-meublee-en-incluant-les-charges) (modifié le 08/07/2026) | — | au réel, déclarer la totalité des **sommes perçues** (loyers, charges comprises) **et** tenir une comptabilité conforme au CGI, au code de commerce et au PCG | page de vulgarisation sur l'inclusion des **charges**, non sur la date de rattachement ; ne contredit pas le BOFiP (voir ADV-03) |

Sources écartées comme preuve : les formulations « sommes encaissées » de la page impots.gouv.fr « Location meublée » concernent le micro-BIC ; le dépôt de garantie n'est traité officiellement ici que pour les **revenus fonciers** (BOI-RFPI-BASE-10-10, non repris : autre catégorie).

## Preuves

- **PROOF-01 — Principe de rattachement : PROUVÉ.** Un LMNP au régime réel détermine son résultat dans les conditions de droit commun (BOI-BIC-CHAMP-40-20 § 56 ; CGI art. 38), qui incluent les **créances acquises** (BOI-BIC-BASE-20-10 § 1, 20 ; BOI-BIC-PDSTK-10-10-10 § 230, 290, 300). Le produit locatif ne se réduit donc pas aux sommes encaissées dans l'année.
- **PROOF-02 — Loyer de décembre N payé en janvier N+1 : PROUVÉ dans le domaine supporté.** Les loyers sont des fruits civils acquis au jour le jour et rattachés à l'exercice où ils sont courus (BOI-BIC-PDSTK-10-10-20 § 240) ; la créance est acquise indépendamment de l'exigibilité et du recouvrement (BOI-BIC-BASE-20-10 § 20) ; elle est constatée à la clôture (BOI-BIC-PDSTK-10-10-10 § 290). *Limite :* suppose une obligation locative identifiable (bail, montant) ; la créance n'est pas acquise si elle est incertaine dans son principe ou indéterminée dans son montant (BASE-20-10 § 30).
- **PROOF-03 — Loyer de janvier N+1 payé en décembre N : PROUVÉ dans le domaine supporté.** Un versement reçu à l'avance est rattaché à l'exercice de l'exécution de la prestation (BOI-BIC-BASE-20-10 § 70, 140 ; CGI art. 38, 2 bis) ; les loyers payés d'avance sont répartis sur la durée du bail (BOI-BIC-PDSTK-10-10-20 § 245). *Limite :* la qualification « loyer d'avance » doit résulter du contrat sans ambiguïté (§ 245).
- **PROOF-04 — Comptabilité super-simplifiée.**
  1. *Un LMNP au réel simplifié peut-il y recourir ?* Le texte vise les exploitants individuels soumis au régime simplifié (art. 302 septies A ter A ; BOFiP DECLA-30-20-20 § 50) ; un LMNP au réel relève du régime BIC (CHAMP-40-20 § 56). **Éligibilité dérivée, non énoncée expressément pour le LMNP : NEEDS_FURTHER_PROOF** pour cette seule question, sans effet sur la règle de rattachement.
  2. *Automatique ?* **Non.**
  3. *Option ?* **Oui**, annuelle, sur la déclaration de résultats (annexe III art. 38 sexdecies-00 A ; DECLA-30-20-20 § 50, 60 ; DECLA-30-20-10 § 40).
  4. *Pendant l'exercice :* enregistrement journalier des seuls encaissements et paiements (art. 302 septies A ter A ; DECLA-30-20-20 § 70).
  5. *À la clôture :* constatation des créances et dettes, rapprochement avec les valeurs d'ouverture, abstraction des sommes déjà constatées (DECLA-30-20-20 § 70, 170).
  6. *Change-t-elle le rattachement des loyers ?* **Non** (DECLA-30-20-20 § 420) : modalité d'enregistrement ≠ détermination du résultat.
  7. *Dépenses répétitives :* exception réservée aux **dépenses** de frais généraux payées à échéances régulières ≤ 1 an, déduites l'année du paiement (art. 302 septies A ter A ; DECLA-30-20-20 § 260-270 ; CHG-10-30-20). Elle ne concerne **pas** les produits : les loyers reçus ne bénéficient d'aucune règle de trésorerie équivalente.
- **PROOF-05 — Impayé : l'ancienne règle « impayé = pas une recette » est contredite.** Un loyer acquis non payé reste un produit et crée une créance (BOI-BIC-BASE-20-10 § 20 ; PDSTK-10-10-10 § 290). Il ne se traite différemment qu'en présence d'une règle **distincte** : créance douteuse ou litigieuse (provision : BOI-BIC-PROV-40-20 § 10, 20, créance maintenue à l'actif), perte certaine et définitive (charge), remise, litige, annulation. Une règle de provision ou de perte n'est pas une règle de rattachement initial.

## Dérivation de l'identité de réconciliation

`DERIVED RECONCILIATION IDENTITY` — fondée sur BOI-BIC-DECLA-30-20-20 § 170, qui décrit le passage de la trésorerie à la comptabilité d'engagement par comparaison des soldes de fin et de début d'exercice.

Soient R les loyers acquis de N (produits), et deux comptes de bilan :
- créances : `CC = CO + facturé_à_crédit − encaissé_sur_créances` ;
- avances (produits constatés d'avance) : `AC = AO + avances_encaissées − avances_reconnues`.

Produits : `R = facturé_à_crédit + avances_reconnues + encaissé_comptant`.
Trésorerie : `E = encaissé_sur_créances + avances_encaissées + encaissé_comptant`.
Donc `R − E = (facturé_à_crédit − encaissé_sur_créances) + (avances_reconnues − avances_encaissées) = (CC − CO) − (AC − AO)`, soit

```
R = E + CC − CO + AO − AC
```

Signe par signe : **+CC** (acquis non encaissé : produit sans trésorerie) ; **−CO** (encaissement d'un loyer déjà reconnu à N−1 : à neutraliser pour qu'il ne soit pas pris en compte deux fois, § 170) ; **+AO** (encaissé avant N, reconnu en N) ; **−AC** (encaissé en N, reconnu après N). Les cinq termes doivent être correctement qualifiés : l'identité ne remplace pas leur preuve.

## Domaine supporté de SAV-034

Loyers **ordinaires** d'un bien donné en location **meublée**, par une personne physique relevant du **BIC au régime réel** (normal ou simplifié, avec ou sans comptabilité super-simplifiée), avec une **obligation locative identifiable** (bail, loyer et charges récupérées stipulés : créance certaine dans son principe et déterminée dans son montant), **sans événement juridique affectant la créance**. La formulation proposée a été challengée : elle est retenue à trois précisions près — (a) régime réel obligatoire (le micro-BIC est un régime d'encaissements hors champ) ; (b) qualification contractuelle des « loyers d'avance » sans ambiguïté ; (c) exercice de rattachement établi (première année : ouverture à zéro seulement si l'absence d'antériorité est confirmée, jamais déduite).

## Revue adversariale de la règle

| Cas | Verdict | Fondement / limite |
|---|---|---|
| ADV-01 LMNP particulier ≠ entreprise commerciale | **SUPPORTED** | CHAMP-40-20 § 56 : droit commun BIC, professionnel ou non |
| ADV-02 super-simplifié : rester en encaissements sans régularisation | **SUPPORTED** (règle contredite) | DECLA-30-20-20 § 420 : impossible de faire abstraction des créances et dettes à la clôture |
| ADV-03 loyer non encaissé produit seulement à l'encaissement | **SUPPORTED** (aucune doctrine BIC réel en ce sens) | encaissements = micro-BIC, BNC, revenus fonciers ; page impots.gouv.fr « sommes perçues » = vulgarisation sur l'inclusion des charges (aucune source officielle BIC réel n'impose l'encaissement) |
| ADV-04 loyer payé d'avance conservé comme produit de l'année de paiement | **SUPPORTED** (règle contredite) | PDSTK-10-10-20 § 245 ; BASE-20-10 § 70, 140 ; qualification contractuelle requise |
| ADV-05 première année d'activité | **SUPPORTED** avec garde | ouverture à zéro seulement si l'absence d'antériorité est confirmée (jamais déduite de l'absence de données) ; reprise d'activité hors domaine |
| ADV-06 cessation | **OUT_OF_DOMAIN** | aucune source BIC LMNP établie (la mention lue vise des sociétés non commerciales) ; la clôture reste bloquée |
| ADV-07 créance douteuse / irrécouvrable | **OUT_OF_DOMAIN** | règle distincte (PROV-40-20 § 10, 20), non implémentée |
| ADV-08 plateformes | **OUT_OF_DOMAIN** (NEEDS_FURTHER_PROOF) | aucune source officielle brut/net retenue ; un payout net reste insuffisant |
| ADV-09 CAF / tiers payant | **OUT_OF_DOMAIN** (NEEDS_FURTHER_PROOF) | aucune source officielle retenue dans cette mission |
| ADV-10 dépôt de garantie | **NEEDS_FURTHER_PROOF** | seule source officielle trouvée : revenus fonciers ; le produit l'exclut des encaissements, sa conservation (loyers impayés, charges) reste hors domaine |

## Continuité N → N+1 (contrat futur, `NOT IMPLEMENTED / CLOSING BLOCKED`)

`CC(N) → CO(N+1)` et `AC(N) → AO(N+1)` découlent de l'identité : les soldes de **début** d'exercice sont les valeurs correspondantes de la **clôture** précédente (DECLA-30-20-20 § 170 : « valeurs correspondantes au début de l'exercice »), ce qui permet de ne pas reconnaître deux fois le produit. Conditions : même bien, même nature, montant repris sans réinterprétation, provenance et preuve de la reconnaissance antérieure conservées. *Limite :* aucun texte consulté n'imprime l'égalité `CC(N) = CO(N+1)` ; elle est dérivée.

Oracle créance : N : E 11 000, CC 1 000 → 12 000. N+1 : E 12 000 (dont le règlement de 1 000), CO 1 000 → 12 000 − 1 000 = **11 000** (le règlement ne recrée pas de produit). Oracle avance : N : E 13 000, AC 1 000 → 12 000. N+1 : E 11 000 (hors l'avance, encaissée en N), AO 1 000 → 11 000 + 1 000 = **12 000** (le produit différé est reconnu une seule fois). Arithmétique et logique vérifiées.

## Hors domaine automatique

Ces situations exigent une règle distincte (non établie) et rendent le rapprochement `OUT_OF_DOMAIN` plutôt qu'un calcul approché : provision pour créance douteuse, perte définitive, GLI, litige, annulation ou remise complexe, plateformes (produit brut vs payout net insuffisamment documenté), indemnités et remboursements.

## Ce que cette règle ne fait pas

- Elle ne traite pas le plafond de déductibilité des amortissements (article 39 C) : **KNOWN SEPARATE FISCAL CORRECTION — NOT PART OF F013 V2** (voir [[SAV-030 – Plafond 39 C avant imputation des déficits antérieurs]], [[SAV-031 – Granularité du plafond 39 C en LMNP multi-bien]]).
- Elle ne définit aucune écriture comptable (FEC : `NOT STARTED`).
