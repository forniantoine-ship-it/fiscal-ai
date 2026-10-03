# Matrice de référence — couche PDF Cerfa (2031-SD / 2031-bis-SD / 2033-B-SD, millésime 2026)

Document vivant — mis à jour à chaque calibrage ou arbitrage. Toute case
listée ici a une entrée de registre correspondante dans `registry/<form>/2026.ts`
(sauf statut `NOT_SUPPORTED`/`NEEDS_FISCAL_ARBITRATION`, voir `excluded-cases.ts`).

**Synchronisation documentaire (micro-jalon dédié)** — ce document reflète
l'état après les corrections fiscales `aa765cb` (330/372/C_L1) et `0beff65`
(2031-bis Cadre I), et après le micro-jalon de calibration PDF de la case
330. Aucune règle fiscale n'a été réinterprétée pour produire cette mise à
jour : les règles ci-dessous reprennent strictement ce qui est déjà commité.

## Deux statuts SÉPARÉS, jamais confondus

**Statut géométrique** — ce que dit cette colonne au sujet de la POSITION :
- **GEO_CONFIRMED** — position mesurée directement sur le Cerfa officiel
  vierge (séparateurs de grille vectoriels), rendue de bout en bout, ET
  couverte par un test de position INDÉPENDANT du registre
  (`tests/position-oracle.test.ts`, qui dérive les bornes de boîte depuis les
  octets du PDF officiel par une voie technique distincte du registre).
- **GEO_CONFIRMED_NO_POSITION_ORACLE** — position mesurée sur le Cerfa
  officiel vierge et rendue de bout en bout, mais PAS (encore) couverte par
  `position-oracle.test.ts` — seule la présence de la chaîne est testée
  (golden master technique), pas sa position exacte. Moins fort que
  `GEO_CONFIRMED` : une régression de position sur ces cases ne serait pas
  détectée automatiquement aujourd'hui.
- **NEEDS_FISCAL_ARBITRATION** — position géométrique connue avec
  certitude, mais ce que le mapper y écrit est en délicatesse avec ce que le
  Cerfa officiel semble attendre. Exclue du rendu (`excluded-cases.ts`).
- **NOT_SUPPORTED** — retirée du périmètre de rendu faute de certitude
  géométrique suffisante, malgré une recherche dédiée.

**Statut fiscal** — ce que dit cette colonne au sujet de la VALEUR, tel que
verrouillé par `aa765cb`/`0beff65` et par le jalon dédié à la case 350 :
- **NON CONTESTÉ** — aucun écart identifié avec le dossier témoin de référence.
- **RÈGLE VERROUILLÉE (usage restreint au périmètre produit)** — la case a,
  sur le formulaire officiel, une liste ouverte d'usages possibles (notice
  DGFiP), mais Fiscal AI a arrêté, pour son périmètre produit actuel (LMNP
  individuel, IR, activité non professionnelle unique), lequel de ces usages
  s'applique — cas de la case 350 uniquement, voir sa ligne dédiée.
- **NON APPLICABLE** — case non fiscale (identité, dates, case à cocher).

Une case géométriquement `GEO_CONFIRMED` peut ne jamais être exercée par le
F-006 actuel sans que ce soit un problème : `resultatFiscal` est garanti
≥ 0 par construction (TRF-0031) — 372 et C_L1_COL2 sont dans ce cas (voir
leurs lignes).

## 2031-SD (Cerfa 11085\*28, page 1/1)

| caseId | Libellé Cerfa | Source CerfaCase | Valeur test (dossier témoin) | Page | Coordonnée (top-left, pt) | Format | Statut géométrique | Statut fiscal |
|---|---|---|---|---|---|---|---|---|
| A_SIREN | SIREN | `identite.siren` | 104545108 | 1 | 9 cases, x=[169.1…289.7], y=210.2 | chiffres-repartis | GEO_CONFIRMED_NO_POSITION_ORACLE | NON APPLICABLE |
| A_DENOMINATION | Dénomination de l'entreprise | `identite.denomination` | BOUVARD ELSA | 1 | x=123.1, y=163.0 | texte | GEO_CONFIRMED_NO_POSITION_ORACLE | NON APPLICABLE |
| A_ADRESSE_ENTREPRISE | Adresse de l'entreprise | `identite.adresseEntreprise` | 15 Rue Saint-Germain | 1 | x=123.1, y=175.6 | texte | GEO_CONFIRMED_NO_POSITION_ORACLE (limite : 1 seule ligne, code postal/ville non modélisés) | NON APPLICABLE |
| A_EXERCICE_DEBUT | Exercice ouvert le | `identite.exerciceDebut` | 01/02/2025 | 1 | x=119.0, y=112.6 | date | GEO_CONFIRMED_NO_POSITION_ORACLE | NON APPLICABLE |
| A_EXERCICE_FIN | et clos le | `identite.exerciceFin` | 31/12/2025 | 1 | x=119.9, y=124.8 | date | GEO_CONFIRMED_NO_POSITION_ORACLE | NON APPLICABLE |
| D_REGIME_REEL_SIMPLIFIE | Régime simplifié d'imposition | constante (scope) | true | 1 | centre boîte x=454.666, y=115.424 | case-a-cocher | GEO_CONFIRMED_NO_POSITION_ORACLE (boîte vectorielle) | NON APPLICABLE |
| C_L1_COL1 | 1. Résultat fiscal — Bénéfice (col.1) | Report de la case **370** du 2033-B-SD (`resultatFiscal` si >0) | — (non exercée par le dossier témoin, déficitaire ; couverte par le scénario synthétique bénéficiaire) | 1 | x=502.9 (droite), y=264.8 | eur-arrondi | **GEO_CONFIRMED** (`tests/position-oracle.test.ts`) | NON CONTESTÉ — même valeur que I_7A par construction (dossier LMNP mono-activité), pas une duplication erronée |
| C_L1_COL2 | 1. Résultat fiscal — Déficit (col.2) | Report de la case **372** du 2033-B-SD (`resultatFiscal` si **<0**) | absente (F-006 garantit `resultatFiscal`≥0, TRF-0031 — jamais exercée en pratique) | 1 | x=569.8 (droite), y=264.8 | eur-arrondi | **GEO_CONFIRMED** (`tests/position-oracle.test.ts`, fixture synthétique) | NON CONTESTÉ — ne reporte plus jamais `deficitNouveau` directement (correction `aa765cb`) |
| I_7A | 7a — dont BIC non pro., Bénéfice | `resultatFiscal` (si >0) | — (non exercée ; couverte par le scénario synthétique bénéficiaire) | 1 | x=313.7 (droite), y=574.6 | eur-arrondi | GEO_CONFIRMED_NO_POSITION_ORACLE (boîte grille) | NON CONTESTÉ |
| I_7B | 7b — dont BIC non pro., Déficit | `deficitNouveau` (si >0) | 9862 | 1 | x=441.0 (droite), y=574.6 | eur-arrondi | GEO_CONFIRMED_NO_POSITION_ORACLE | NON CONTESTÉ |

## 2031-bis-SD (annexe au Cerfa 11085\*28, page 2 de l'asset partagé)

**Cadre I aligné sur 7A/7B (correction `0beff65`)** — `I_AUTRES_LMNP_BENEFICE`/`I_AUTRES_LMNP_DEFICIT`
reprennent désormais exactement les mêmes conditions et valeurs que `I_7A`/`I_7B`
du 2031-SD, **sans aucune condition sur `deficitsImputes`**. L'ancienne garde
("alimentée seulement si `deficitsImputes === 0`") est retirée : elle
reposait sur une fausse ambiguïté (voir `map-2031-bis.ts`).

| caseId | Libellé Cerfa | Source CerfaCase | Valeur test | Page | Coordonnée | Format | Statut géométrique | Statut fiscal |
|---|---|---|---|---|---|---|---|---|
| I_AUTRES_LMNP_BENEFICE | Autres locations meublées non pro. — Bénéfice | `resultatFiscal` (si >0) — **identique à I_7A**, y compris lorsque `deficitsImputes > 0` | — (non exercée par le dossier témoin ; couverte par le scénario synthétique bénéficiaire) | 1 | x=470.9 (droite), y=736.8 | eur-arrondi | GEO_CONFIRMED_NO_POSITION_ORACLE (boîte grille) | NON CONTESTÉ |
| I_AUTRES_LMNP_DEFICIT | Autres locations meublées non pro. — Déficit | `deficitNouveau` (si >0) — **identique à I_7B** | 9862 | 1 | x=553.4 (droite), y=736.8 | eur-arrondi | GEO_CONFIRMED_NO_POSITION_ORACLE | NON CONTESTÉ |

## 2033-B-SD (Cerfa 15948\*08, page 2/7)

| caseId | Libellé Cerfa | Source CerfaCase | Valeur test | Page | Coordonnée | Format | Statut géométrique | Statut fiscal |
|---|---|---|---|---|---|---|---|---|
| 218 | Production vendue — Services | `recettes.total` | 5100 | 1 | x=504.57 (droite, A4), y=105.5 | eur-arrondi | GEO_CONFIRMED_NO_POSITION_ORACLE | NON CONTESTÉ |
| 232 | Total produits d'exploitation (I) | `recettes.total` | 5100 | 1 | x=504.57 (droite, A4), y=164.2 | eur-arrondi | GEO_CONFIRMED_NO_POSITION_ORACLE | NON CONTESTÉ |
| 242 | Autres achats et charges externes | Σ catégories F-012 hors `taxe_fonciere` (+ frais de dossier F-011), publiée seulement si conservation A1 | dérivé | 1 | x=504.57 | eur-arrondi | GEO_CONFIRMED_NO_POSITION_ORACLE | **A1+** — frais de dossier F-011 en 242 (notice 2033-NOT-SD) ; assurance emprunteur et garantie restent hors 242 (294). |
| 244 | Impôts, taxes et versements assimilés | `taxe_fonciere` F-012 | dérivé | 1 | x=504.57 | eur-arrondi | GEO_CONFIRMED_NO_POSITION_ORACLE | CONDITIONNELLE / GO |
| 254 | Dotations aux amortissements | `amortCalcule` | 3720 | 1 | x=504.57 | eur-arrondi | GEO_CONFIRMED_NO_POSITION_ORACLE | NON CONTESTÉ |
| 264 | Total charges d'exploitation (II) | formule composite (+ frais dossier F-011) | dérivé | 1 | x=504.57 | eur-arrondi | GEO_CONFIRMED_NO_POSITION_ORACLE | NON CONTESTÉ |
| 270 | Résultat d'exploitation (I-II) | formule composite | dérivé | 1 | x=504.57 | eur-arrondi | GEO_CONFIRMED_NO_POSITION_ORACLE | NON CONTESTÉ |
| 294 | Charges financières (V) | intérêts + IRA + assurance emprunteur + garantie PROVISOIRE — hors frais de dossier (`split-financement-2033b.ts`) | dérivé | 1 | x=504.57 | eur-arrondi | GEO_CONFIRMED_NO_POSITION_ORACLE | intérêts + assurance ÉTABLIS ; garantie PROVISOIRE / UNRESOLVED ; frais dossier → 242. |
| **300** | Charges exceptionnelles (VI) | `perteExceptionnelle` | 0 | 1 | x=504.57 (droite, A4), y=369.0 | eur-arrondi | **GEO_CONFIRMED_NO_POSITION_ORACLE** — calibrée et rendue (MICRO-JALON implémentation 300, après jalon de calibration géométrique dédié : quatre méthodes convergentes — PyMuPDF, opérateurs vectoriels, pdfjs-dist, raster) | NON CONTESTÉ — plus une case "non dessinée" ; aucune règle fiscale n'a jamais été en question ici |
| 310 | Bénéfices ou pertes (résultat comptable) | formule composite | -13681 → `(13 681)` | 1 | x=504.57 (droite, A4), y=411.0 | eur-arrondi | GEO_CONFIRMED_NO_POSITION_ORACLE (parenthèses depuis P0) | NON CONTESTÉ |
| 312 | Résultat fiscal — report bénéfice comptable (col.1) | `resultatComptable` (si >0) | — (non exercée par le dossier témoin ; couverte par le scénario synthétique bénéficiaire) | 1 | x=426.0 (droite), y=424.8 | eur-arrondi | GEO_CONFIRMED_NO_POSITION_ORACLE (boîte grille — même famille que 370) | NON CONTESTÉ |
| 314 | Résultat fiscal — report déficit comptable (col.2) | `resultatComptable` (si <0) | 13681 | 1 | x=504.57 (droite, A4), y=424.8 | eur-arrondi | GEO_CONFIRMED_NO_POSITION_ORACLE (même famille de boîte que 372) | NON CONTESTÉ |
| 318 | Amortissements excédentaires (réintégration, art. 39-C) — **MOUVEMENT ANNUEL** `amortNonDeduitExercice` (= `amortCalcule − amortDeduct`), **pas** le STOCK FINAL `amortReporte` | `amortNonDeduitExercice` | 3720 | 1 | x=426.4 (droite), y=448.2 | eur-arrondi | GEO_CONFIRMED_NO_POSITION_ORACLE | NON CONTESTÉ |
| **330** | Divers à réintégrer (bloc RÉINTÉGRATIONS — notice 2033-NOT-SD 2026 : déficit/charges d'une activité non professionnelle, CGI art. 156-I-1° bis ; SAV-032) | `max(−E, 0) + totalNonDeductible`, E = `resultatFiscalAvantDeficits + amortReportesUtilises` (SAV-032, remplace `deficitNouveau` seul) | 9961 (= 9 862 + 99, oracle EDI) | 1 | x=426.0 (droite), y=488.0 | eur-arrondi | **GEO_CONFIRMED** — calibrée et rendue (micro-jalon calibration 330) | NON CONTESTÉ — oracle : dossier témoin EDI accepté |
| 350 | *(notice 2033-NOT-SD 2026 : « Divers à déduire » ; le libellé imprimé de la ligne 346/350 « Créance due au titre du report en arrière du déficit » est celui de la sous-ligne 346)* | `max(E, 0)` — bénéfice LMNP non professionnel déduit, ARD consommés inclus ; **vide si E ≤ 0** ; jamais les déficits antérieurs (SAV-032, remplace `deficitsImputes`) | vide (E < 0) | 1 | x=504.57 (droite, A4), y=655.5 | eur-arrondi | **GEO_CONFIRMED** (micro-jalon 350 : position démontrée indépendamment) | NON CONTESTÉ |
| 352 | Résultat fiscal avant imputation des déficits antérieurs — Bénéfice (col.1) | **0 imprimé** par neutralisation (SAV-032) : résultat de l'équation 2033-B `(312 − 314) + 318 + 330 − 350`, garanti par l'invariant de bouclage | 0 (oracle EDI) | 1 | x=426.0 (droite), y=751.9 | eur-arrondi | **GEO_CONFIRMED** (`tests/position-oracle.test.ts`, describe « ligne 352/354 ») ; y = haut de bbox du « 0 » du dossier témoin accepté | NON CONTESTÉ |
| 354 | Résultat fiscal avant imputation des déficits antérieurs — Déficit (col.2) | *(vide par neutralisation, SAV-032 — jamais produite)* | vide | — | *(aucune entrée : toute production resterait bloquée par `case-sans-mapping-visuel`)* | — | — | NON CONTESTÉ |
| 370 | Résultat fiscal après imputation des déficits — Bénéfice (col.1) | **0 imprimé** par neutralisation (SAV-032) : 352 − 354 − 356 − 360 (356 = 360 = 0, IS uniquement) | 0 (oracle EDI) | 1 | x=426.0 (droite), y=787.8 | eur-arrondi | **GEO_CONFIRMED** (`tests/position-oracle.test.ts`) | NON CONTESTÉ |
| 372 | Résultat fiscal après imputation des déficits — Déficit (col.2) | *(vide par neutralisation, SAV-032 — le mapper ne la produit plus)* | vide | 1 | x=504.57 (droite, A4), y=787.8 | eur-arrondi | **GEO_CONFIRMED** (`tests/position-oracle.test.ts`, cas synthétique) — registre conservé | NON CONTESTÉ |

## Synthèse chiffrée (périmètre déclaré supporté : 2031-SD, 2031-bis-SD, 2033-B-SD)

- **Cases avec entrée de registre active** : 21 (10 + 2 + 9 rendues) — 244 est désormais alimentée conditionnellement (MICRO-JALON implémentation 244), plus une case "réservée sans mapper" dans ce décompte.
- **Cases GEO_CONFIRMED (position + oracle de test indépendant)** : 5 (370, 372, C_L1_COL1, C_L1_COL2, 330)
- **Cases GEO_CONFIRMED_NO_POSITION_ORACLE** : 14
- **Cases NEEDS_FISCAL_ARBITRATION** : 0 — la case 350 est reclassée `GEOMETRIC_UNCERTAINTY` (jalon dédié) : sa règle fiscale est désormais verrouillée (`deficitsImputes`), seule sa boîte de valeur PDF reste à calibrer.
- **Cases NOT_SUPPORTED / GEOMETRIC_UNCERTAINTY (incertitude géométrique)** : 0 — la case 350 (jalon dédié) puis la case 300 (MICRO-JALON implémentation 300, après réexamen de la justification historique de son exclusion) ont chacune été recalibrées et intégrées. `excluded-cases.ts` (`CERFA_EXCLUDED_CASES_2026`) est désormais vide pour 2033-B-SD / millésime 2026.
- **Cases avec écart fiscal connu et non corrigé** : **0** — l'écart historique 372/C_L1_COL2 (audit Cursor/Grok) est **résolu** par `aa765cb`/`0beff65` : le déficit LMNP est désormais réintégré en case 330 (calibrée et rendue) et porté par I_7B/I_AUTRES_LMNP_DEFICIT, jamais par 372/C_L1/Cadre I sous condition `deficitsImputes`.

### Cases mesurées sur la grille officielle mais jamais confirmées par une valeur positive RÉELLE (dossier témoin)

Ces cases sont mesurées sur le Cerfa officiel vierge (séparateurs vectoriels)
et rendues correctement dans un scénario synthétique dédié
(`tests/scenario-beneficiaire.test.ts` pour 312/370/I_7A/C_L1_COL1/I_AUTRES_LMNP_BENEFICE ;
fixture synthétique dédiée dans `tests/position-oracle.test.ts` pour 372/C_L1_COL2),
mais le dossier témoin réel (déficitaire) ne peut structurellement jamais les
exercer avec une valeur positive : **312, 370, I_7A, C_L1_COL1, I_AUTRES_LMNP_BENEFICE**
(scénario bénéficiaire), et **372, C_L1_COL2** (jamais exercées par AUCUN
scénario réel, car `resultatFiscal` est garanti ≥0 par F-006 — voir
`registry/2033-b/2026.ts` et `registry/2031-sd/2026.ts`). Le niveau de preuve
est donc "mesure de grille + scénario synthétique", pas "mesure de grille +
valeur réelle positive confirmée" — les deux sont valides mais ne sont pas
équivalentes.

## Ce qui n'est PAS dans cette matrice

2033-A-SD, 2033-C-SD, 2033-D-SD, 2033-E-SD, 2033-F-SD, 2033-G-SD : **aucun
registre visuel PDF** n'existe encore pour ces formulaires dans cette couche
— distinction importante, toujours valable :

- **2033-A-SD et 2033-C-SD ONT des mappers fiscaux réels** qui produisent
  déjà des `CerfaCase[]` (`map-2033a.ts` : au moins 136/156/028/030 ;
  `map-2033c.ts` : au moins 572/426/476/496/576). Ce qui manque est
  UNIQUEMENT le registre visuel (coordonnées PDF) de cette couche, jamais le
  mapper fiscal lui-même.
- **2033-D-SD, 2033-E-SD, 2033-F-SD, 2033-G-SD** n'ont, à la connaissance de
  ce document, aucun mapper produisant de `CerfaCase[]` réel (2033-D produit
  trois cadres explicitement non alimentés, structurellement vides à l'IR).

Développer ces registres reste hors périmètre — la liasse produite par
cette couche PDF n'est donc **PAS une liasse complète** au sens de SAV-029
(2033-A/B/C/D obligatoires), seulement le sous-ensemble 2031/2031-bis/2033-B.

SUIV39C : source officielle identifiée (BOFiP, BOI-FORM-000038-20130826,
sans numéro Cerfa) — document de suivi de continuité art. 39 C, distinct de
la liasse 2033, non intégré dans cette couche PDF. Le STOCK d'amortissement
reporté lui-même est correctement reporté d'exercice en exercice côté
moteur (`resolveStocksOuverture`) — seul le document justificatif n'est pas
produit.

## Anti-superposition

La generation gate (`gate/generation-gate.ts`, fonction
`checkOverlappingPositions` / `findOverlappingPositionGroups`) bloque
toute génération où deux `CerfaVisualMapping` du registre partageraient
exactement la même position `(page, x, y)`, sauf exception documentée dans
`overlap-exceptions.ts` (actuellement vide). Purement géométrique, aucune
règle fiscale. Voir `tests/generation-gate.test.ts`.

## Tests de position indépendants

`tests/position-oracle.test.ts` dérive les bornes réelles des boîtes 370,
372, **330/247/248** (2033-B-SD) et Col.1/Col.2 de la ligne "1. Résultat
fiscal" (2031-SD) en lisant directement les octets des Cerfa officiels
vierges — par une voie technique indépendante du registre
(`tests/independent-grid-oracle.ts` : pdfjs-dist pour le texte, parsing
direct des opérateurs vectoriels `m`/`l`/`S` du flux de contenu pdf-lib pour
la grille). Contrairement à `coordinates.test.ts` (qui ne vérifie que
l'arithmétique de conversion de coordonnées) et au golden master (qui ne
vérifie que la présence d'une chaîne), ce fichier vérifie que la valeur
dessinée tombe dans la bonne boîte du Cerfa — et démontre, par des tests de
régression dédiés, que la géométrie AVANT correction (x=426.9 pour 372 ;
x=502.9 pour C_L1_COL1 ET C_L1_COL2 ; zone-numéro pour 330) aurait fait
échouer ces mêmes tests.
