# P1-PDF-02-G — Audit exhaustif de la 2033-A 2026

Jalon d'audit et de cartographie **uniquement** — aucune règle fiscale n'a été
codée ou modifiée pour produire ce document, aucun registre PDF n'a été
étendu, F4-D n'a pas été entamé. Source de vérité suivie, dans cet ordre :
CERFA RÉEL (`assets/2026/2033-sd.pdf`, page 1, extraction physique
PyMuPDF) → sens officiel → règle comptable/fiscale → donnée métier
réellement disponible → formule → mapper → registry → PDF. Le code existant
n'a jamais été présumé correct : chaque affirmation ci-dessous est
vérifiée soit contre le texte du Cerfa officiel extrait directement de ses
octets, soit contre l'exécution réelle du code (tests lancés, pas seulement
lus).

Version machine-readable : [`AUDIT-2033A-P1-PDF-02-G.json`](./AUDIT-2033A-P1-PDF-02-G.json).

---

## 0. Résumé chiffré

**54 cases auditées** (48 cases numérotées du corps du bilan simplifié + 6
renvois/mémos en pied de page, tous physiquement présents sur le Cerfa réel).

| Statut | Nombre | Signification |
|---|---|---|
| 🟢 FIABLE | **4** | 028, 030, 136, 156 — sens, source, calcul et comportement UNKNOWN/ZÉRO démontrés, **et** alimentables par un dossier réel dès aujourd'hui (aucune dépendance à une saisie `BilanInputs` qui n'existe dans aucune UI du produit) |
| 🟡 À CORRIGER | **11** | 014, 040, 064, 068, 072, 080, 092\*, 164, 166, 172, 174, 175 — données réellement résolues en interne (resolvers `lignesSimples`/`ventilationTiers`) mais jamais projetées en case Cerfa ; raison de blocage affichée parfois factuellement inexacte |
| 🟠 SOURCE MÉTIER MANQUANTE | **0** | aucune case de la 2033-A n'est dans cet état précis (soit une source existe déjà en interne — 🟡/🔵 — soit elle est structurellement absente — 🔴/⚫) |
| 🔵 SOURCE PRÉVUE MAIS NON ALIMENTÉE | **18** | 016, 042, 044, 048\*\*, 066, 070, 074, 082, 084, 086, 094\*, 096, 098\*\*, 110, 120, 134, 137, 142, 176, 180 — code et resolvers corrects et testés, mais **jamais exercés en production** (voir Finding transverse #0) ou gates écrites jamais appelées |
| 🔴 NON APPLICABLE | **15** | 010, 012, 050, 052, 060, 062, 124, 126, 130, 131, 132, 140, 154, 173, 199 — hors périmètre LMNP, avec justification structurelle revérifiée |
| ⚫ NON DÉTERMINÉ | **6** | 112, 182, 184, 193, 195, 197 — sens/position connus mais publication non démontrable sans invention (112), ou absence totale de traitement dans le code (5 renvois) |

\* 092/094 n'apparaissent pas séparément dans le tableau ci-dessus car 092 est
🟡 et 094 est 🔵 — décompte exact dans la matrice section 2.
\*\* 048/098 comptent double logiquement (calcul interne correct **et**
jamais exercé en production) — classées 🔵 par cohérence avec les 16 autres
cases dépendant de `rfs.patrimoine`.

**Total de contrôle : 4 + 11 + 0 + 18 + 15 + 6 = 54.**

---

## 1. Les deux findings transverses (à lire avant la matrice)

### Finding transverse #0 — CRITIQUE — la quasi-totalité de la 2033-A est actuellement inerte en production, indépendamment de tout bug de code

`map2033AFromRfs()` sait produire 16 cases supplémentaires (016, 042, 048,
066, 070, 074, 082, 084, 086, 094, 098, 120, 134, 137, 142, et partiellement
028/030/156) **uniquement** quand `rfs.patrimoine` est défini. `rfs.patrimoine`
n'existe que si `assemblePatrimoine(rfs, bilanInputs)` a été appelée, ce qui
n'arrive dans [`run-declaration-generation.ts`](../declaration/run-declaration-generation.ts#L179-L188)
que si le paramètre optionnel `bilanInputs` (4ᵉ argument de
`runDeclarationGeneration`) est fourni.

Recherche exhaustive des appelants réels :

```
src/components/lmnp/documents/ValidationDocumentStep.tsx:109
  runDeclarationGeneration(draft, fiscalYear.year, fiscalYear.stocksOuverture?.stocks)
src/lib/lmnp/services/declaration/declaration-generation-gate.ts:133,181
  runDeclarationGeneration(input.draft, input.fiscalYear)
```

**Aucun des deux appelants réels ne passe de 4ᵉ argument.** Une recherche de
`BilanInputs`, `compteExploitant`, `bankMode`, `tresorerie` dans
`src/components/**/*.tsx` retourne **zéro résultat** : aucun écran du
produit ne collecte aujourd'hui la trésorerie, le compte de l'exploitant, le
report à nouveau, les tiers ou les subventions d'investissement. Ce n'est
pas une lacune de collecte partielle — c'est une absence totale du canal de
collecte lui-même.

**Conséquence directe : `bilanInputs` vaut toujours `undefined` en
production aujourd'hui, `rfs.patrimoine` n'est donc jamais construit pour un
dossier réel, et les 16 cases listées ci-dessus restent bloquées pour
n'importe quel dossier traité par Fiscal AI aujourd'hui — quel que soit le
soin apporté au code qui les produirait.** C'est très exactement la
catégorie 🔵 du référentiel d'audit (« le champ existe dans le
modèle/infrastructure mais rien ne démontre qu'il est effectivement collecté
ou renseigné dans le parcours métier ») — mais élevée ici au rang de finding
transverse parce qu'elle touche 16 cases sur 54 d'un coup, et parce qu'elle
change la lecture de toute case marquée « le code est correct » : correct
en tant que bibliothèque testée, mais actuellement sans aucune voie
d'exécution réelle.

Seules **028, 030, 136 et 156** échappent à cette dépendance totale : elles
ont une branche dite « legacy » dans `map-2033a.ts`, alimentée directement
par `fiscalResult`/`rfs.immobilisations`/`rfs.emprunts` (sorties F-006/F-010/
F-011 déjà en production, indépendamment de toute saisie `BilanInputs`). Ce
sont d'ailleurs les seules cases pour lesquelles les fixtures de test
utilisent un dossier réel nommé « Elsa »
(`tests/output/p1-pdf-02e-2033a-e1-elsa.pdf`,
`tests/output/p1-pdf-02f1-2033a-elsa-030.pdf`) plutôt qu'un scénario
synthétique — confirmation indépendante de cette distinction.

**Implication produit** : tant qu'aucun écran ne collecte `BilanInputs`, la
2033-A générée par Fiscal AI ne peut afficher, pour un dossier réel, que
028, 030, 136 et 156 — soit 4 cases sur 48 cases numérotées du corps du
bilan. Toute communication produit sur « la 2033-A est prête » doit
distinguer explicitement maturité du moteur de calcul (élevée : logique
saine, testée, jamais de zéro inventé) et maturité du parcours de collecte
(nulle : aucun écran n'existe).

### Finding transverse #1 — la face « Brut »/tiers du bilan est entièrement résolue en interne mais jamais projetée, avec un texte d'erreur parfois faux

Indépendamment du Finding #0 (qui suppose que `bilanInputs` existerait),
`map2033AFromRfs()` contient une deuxième couche de trou, cette fois dans le
mapper lui-même :

- `resolveLignesSimples()` résout un état à 4 niveaux (DECLARE / NUL_CONFIRME
  / NON_APPLICABLE / INCONNU) pour les cases **014, 040, 064, 080, 092**
  (colonne Brut) — en plus des cases Amort.-Prov. (016/042/066/070/074/082/094)
  qui, elles, SONT correctement projetées (F4-A/F4-B).
- `resolveVentilationTiers()` résout, par classification de nature
  économique, un état pour **064, 068, 072, 092, 164, 166, 172, 174, 175**.
- Trois fonctions de gate dédiées existent dans `lignes-simples.ts` pour les
  totaux Brut correspondants : `gateTotal044ActifImmobiliseBrut`,
  `gateTotal096ActifCirculantBrut`, `gateTotal176Dettes`.

**Aucun de ces douze champs résolus, ni aucune de ces trois gates, n'est
jamais lu par `map2033AFromRfs()`.** Preuve par grep exhaustif : le seul
usage de `patrimoine.ventilationTiers` dans tout `src/runtime` est dans
`check-bilan-equilibre.ts` (pour la garde d'équilibre globale, jamais pour
publier une case), et les trois fonctions de gate n'ont d'appelant que leurs
propres tests unitaires.

Concrètement : un dossier où l'utilisateur aurait explicitement déclaré
« 064 = 500 € (NUL_CONFIRME), acompte versé à un fournisseur » verrait cette
valeur correctement contribuer à l'égalité du bilan (110−112=180) via
`checkBilanEquilibre`, **mais la case 064 elle-même resterait dans
`casesNonAlimentees` avec le texte `RAISON_TIERS_ABSENTS` : « Aucun suivi de
créances ou dettes de tiers […] n'existe dans le modèle actuel »** — une
affirmation fausse dans ce cas précis, puisque la donnée existe, a été
saisie, et est même utilisée pour valider l'équilibre du bilan.

Cas particulier aggravant : **174** (Produits constatés d'avance) et **175**
(Autres dettes) sont modélisées **deux fois en parallèle** —
`lignesSimples.produitsConstatesAvance`/`autresDettes` d'un côté,
`ventilationTiers.cases.produitsConstatesAvance`/`autresDettes` de l'autre —
sans qu'aucune garde ne les réconcilie (contrairement à 156/emprunts qui,
elle, a une réconciliation stricte dédiée). Un futur câblage de ces deux
cases devra choisir une source unique ou écrire une réconciliation, sous
peine de double comptage latent.

**Seule exception cohérente de la famille « tiers » : 173** (Comptes
courants d'associés), où le hardcode `non_applicable` du mapper coïncide
avec le typage `NON_APPLICABLE EI` du resolver — les deux disent la même
chose, ce n'est donc pas un trou.

---

## 2. Matrice exhaustive

Colonnes : Case, Libellé Cerfa, Section, Colonne, Nature, Source métier
théorique, Champ/mécanisme, Formule, Statut de la source, UNKNOWN possible ?,
Zéro explicite ?, Mapping actuel, Correct ?, Registry PDF, PDF calibré ?,
Tests, Statut final, Risque/remarque.

| Case | Libellé Cerfa | Section | Colonne | Nature | Source métier théorique | Champ / mécanisme | Formule | Statut de la source | UNKNOWN possible ? | Zéro explicite ? | Mapping actuel | Correct ? | Registry PDF | PDF calibré ? | Tests | Statut final | Risque / remarque |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 010 | Fonds commercial | Actif immobilisé | Brut | valeur saisie | Cession/apport d'un fonds de commerce | aucun | — | Aucun champ dans le modèle | n/a | n/a | toujoursBloquees, non_applicable | Oui pour le périmètre LMNP standard actuel | absent | non | 0 | 🔴 | Périmètre LMNP location meublée jamais porteur d'un fonds de commerce cédé ; nuance possible pour un LMNP para-hôtelier structuré en cession de fonds (hors périmètre produit actuel, non rencontré). |
| 012 | Fonds commercial | Actif immobilisé | Amort.-Prov. | valeur saisie | Provision sur fonds de commerce | aucun | — | Aucun champ | n/a | n/a | toujoursBloquees, non_applicable | Oui (symétrique de 010) | absent | non | 0 | 🔴 | Idem 010. |
| 014 | Autres immobilisations incorporelles | Actif immobilisé | Brut | valeur saisie | Logiciels, droit au bail, etc. | `lignesSimples.autresImmobilisationsIncorporellesBrut` | valeur déclarée directe | Champ EXISTE et est résolu mais jamais lu par `map2033AFromRfs` | Oui (le resolver le gère) | Oui (géré par le resolver, jamais consommé) | toujoursBloquees (raison statique, ne mentionne même pas `lignesSimples`) | **NON** — la donnée peut être DECLARE/NUL_CONFIRME en interne sans que 014 ne soit jamais publiée ; le message de blocage affiché est alors mensonger | absent | non | 3 (testent le resolver, aucun ne teste la publication Cerfa) | 🟡 | Cf. Finding transverse #1. |
| 016 | Autres immobilisations incorporelles | Actif immobilisé | Amort.-Prov. | valeur saisie | Amortissement/provision sur incorporelles | `lignesSimples.autresImmobilisationsIncorporellesNet` | valeur déclarée directe (F4-A) | Alimentée si `rfs.patrimoine` fourni ET DECLARE/NUL_CONFIRME | Oui, bloque | Oui, NUL_CONFIRME → 0 publiable | map-2033a.ts F4-A | Oui | ABSENT du registre PDF (`scope/2033-a-2026.ts`) | non | 3 | 🔵 | Cf. Finding transverse #0 — jamais exercée en production faute de `bilanInputs`. |
| 028 | Immobilisations corporelles | Actif immobilisé | Brut | valeur saisie | F-010 + `valeurTerrain`, ou registre patrimonial unifié F-010+F-012 | `rfs.immobilisations.totalBrut+valeurTerrain` OU `patrimoine.immobilisations.brutTotal` | totalBrut + valeurTerrain (+ composants nouveaux si patrimoine) | Fiable, garde de divergence F-010/F-014 | Oui, bloque si divergence/absence | Oui via 0 fiscal réel | map-2033a.ts, branche patrimoine + legacy | Oui | PRÉSENT | Oui (GEO_CONFIRMED_NO_POSITION_ORACLE) | 5 | 🟢 | Aucun oracle de position indépendant. **Alimentable en production dès aujourd'hui** (branche legacy indépendante de `BilanInputs`) — dossier réel « Elsa » dans les fixtures. |
| 030 | Immobilisations corporelles | Actif immobilisé | Amort.-Prov. | valeur saisie | Σ amortissements cumulés (F-010) | `rfs.immobilisations.lignes[].amortissementsCumules` | Σ amortissementsCumules | Fiable | Oui, bloque | Oui | map-2033a.ts | Oui | PRÉSENT | Oui (10 fichiers de test) | 10 | 🟢 | Case la plus mature de toute la 2033-A. **Alimentable en production dès aujourd'hui.** |
| 040 | Immobilisations financières | Actif immobilisé | Brut | valeur saisie | Dépôts de garantie versés, titres, cautions | `lignesSimples.immobilisationsFinancieresBrut` | valeur déclarée directe | Champ résolu, jamais lu pour publier 040 | Oui | Oui (jamais consommé) | toujoursBloquees (raison statique) | NON — même incohérence que 014 | absent | non | 2 | 🟡 | Cf. Finding transverse #1. |
| 042 | Immobilisations financières | Actif immobilisé | Amort.-Prov. | valeur saisie | Provision sur immobilisations financières | `lignesSimples.immobilisationsFinancieresNet` | valeur déclarée directe (F4-A) | Alimentée si patrimoine + DECLARE/NUL_CONFIRME | Oui, bloque | Oui | map-2033a.ts F4-A | Oui | ABSENT du registre PDF | non | 3 | 🔵 | Cf. Finding transverse #0. |
| 044 | Total I — Actif immobilisé | Actif immobilisé | Brut | total | 010+014+028+040 | `gateTotal044ActifImmobiliseBrut` (existe) | 044 = 010+014+028+040 | Gate écrite, **jamais appelée** | Géré par le gate (mort) | Géré par le gate (mort) | toujoursBloquees, incoherence_modele | Blocage correct en résultat ; infrastructure non câblée | interdit | non | 2 | 🔵 | Code mort — 0 appelant hors tests. |
| 050 | Stocks (matières premières, en-cours) | Stocks | Brut | valeur saisie | N/A — LMNP = location | aucun | — | Structurellement non applicable | n/a | n/a | toujoursBloquees, non_applicable | Oui, revalidé contre le Cerfa réel | absent | non | 0 | 🔴 | Aucun. |
| 052 | Stocks | Stocks | Amort.-Prov. | valeur saisie | N/A | aucun | — | Structurellement non applicable | n/a | n/a | toujoursBloquees, non_applicable | **Oui — cas dédié section 7**, revérifié (case physiquement présente [x≈376, y≈293-301]), démontré et non seulement affirmé | absent | non | 2 (dont 1 fichier F4-D cassé) | 🔴 | Aucun. |
| 060 | Marchandises | Stocks | Brut | valeur saisie | N/A | aucun | — | Structurellement non applicable | n/a | n/a | toujoursBloquees, non_applicable | Oui | absent | non | 0 | 🔴 | Aucun. |
| 062 | Marchandises | Stocks | Amort.-Prov. | valeur saisie | N/A | aucun | — | Structurellement non applicable | n/a | n/a | toujoursBloquees, non_applicable | **Oui — revérifié** (case physiquement présente [x≈376, y≈308-316]) | absent | non | 1 | 🔴 | Aucun. |
| 064 | Avances et acomptes versés | Actif circulant | Brut | valeur saisie | Acompte versé à un fournisseur | `lignesSimples.avancesAcomptesVerses` ET `ventilationTiers.cases.avancesAcomptesVerses` (deux voies parallèles) | valeur déclarée / classification nature | Résolu deux fois, jamais lu | Oui (les deux) | Oui (jamais consommé) | toujoursBloquees, `RAISON_TIERS_ABSENTS` (texte parfois factuellement faux) | NON | absent | non | 1 | 🟡 | Cf. Finding transverse #1. |
| 066 | Avances et acomptes versés | Actif circulant | Amort.-Prov. | valeur saisie | Provision sur avances | `lignesSimples.avancesAcomptesVersesAmort` | valeur déclarée directe (F4-B) | Alimentée si patrimoine + DECLARE/NUL_CONFIRME | Oui, bloque | Oui | map-2033a.ts F4-B | Oui | ABSENT du registre PDF | non | 3 | 🔵 | Cf. Finding transverse #0. |
| 068 | Clients et comptes rattachés | Actif circulant | Brut | valeur saisie | Loyers dus par le locataire | `ventilationTiers.cases.clients` (LOYER_DU_PAR_LOCATAIRE) | Σ postes classés | Résolu, jamais lu | Oui | Oui (jamais consommé) | toujoursBloquees, `RAISON_TIERS_ABSENTS` | NON | absent | non | 2 | 🟡 | Cf. Finding transverse #1. |
| 070 | Clients et comptes rattachés | Actif circulant | Amort.-Prov. | valeur saisie | Provision sur créances clients | `lignesSimples.clientsAmortissementsProvisions` | valeur déclarée directe (F4-B) | Alimentée si patrimoine + DECLARE/NUL_CONFIRME | Oui, bloque | Oui | map-2033a.ts F4-B | Oui | ABSENT du registre PDF | non | 4 | 🔵 | Cf. Finding transverse #0. |
| 072 | Autres créances | Actif circulant | Brut | valeur saisie | Créance diverse liée à l'activité | `ventilationTiers.cases.autresCreances` (AUTRE_CREANCE_ACTIVITE) | Σ postes classés | Résolu, jamais lu | Oui | Oui (jamais consommé) | toujoursBloquees, `RAISON_TIERS_ABSENTS` | NON | absent | non | 0 | 🟡 | Cf. Finding transverse #1. |
| 074 | Autres créances | Actif circulant | Amort.-Prov. | valeur saisie | Provision sur autres créances | `lignesSimples.autresCreancesAmortissementsProvisions` | valeur déclarée directe (F4-B) | Alimentée si patrimoine + DECLARE/NUL_CONFIRME | Oui, bloque | Oui | map-2033a.ts F4-B | Oui | ABSENT du registre PDF | non | 4 | 🔵 | Cf. Finding transverse #0. |
| 080 | Valeurs mobilières de placement | Actif circulant | Brut | valeur saisie | Titres détenus par l'exploitant pour l'activité | `lignesSimples.valeursMobilieresPlacementBrut` | valeur déclarée directe | Champ résolu, jamais lu | Oui | Oui (jamais consommé) | toujoursBloquees, raison ad hoc (« non pertinent ») | Discutable — le champ est documenté comme « ouvert » (jamais NON_APPLICABLE par défaut), le mapper le traite pourtant comme hors sujet : incohérence de doctrine | absent | non | 2 | 🟡 | Cf. Finding transverse #1 + divergence de doctrine interne. |
| 082 | Valeurs mobilières de placement | Actif circulant | Amort.-Prov. | valeur saisie | Provision sur VMP | `lignesSimples.valeursMobilieresPlacementNet` | valeur déclarée directe (F4-A) | Alimentée si patrimoine + DECLARE/NUL_CONFIRME | Oui, bloque | Oui | map-2033a.ts F4-A | Oui | ABSENT du registre PDF | non | 2 | 🔵 | Cf. Finding transverse #0. |
| 084 | Disponibilités | Actif circulant | Brut | valeur saisie | Trésorerie professionnelle de clôture | `BilanInputs.tresorerie` | `resolveTresorerie()` — jamais par différence | Fiable, 6 états explicites | Oui, bloque | Oui — confirmation positive, jamais un défaut | map-2033a.ts, branche patrimoine | Oui — découvert bancaire correctement isolé | PRÉSENT | Oui | 6 | 🔵 | Cf. Finding transverse #0 — code correct, jamais exercé en production. |
| 086 | Disponibilités | Actif circulant | Amort.-Prov. | valeur saisie | Provision sur disponibilités (rare) | `BilanInputs.tresorerie.provisionsAmortissements` | Règle F2 (084=0⇒086=0) ou resolver dédié | Fiable | Oui, bloque (sauf règle F2) | Oui | map-2033a.ts, branche patrimoine | Oui — non-confusion avec 084 vérifiée par tests | PRÉSENT | Oui (micro-jalon F2 dédié) | 6 | 🔵 | Cf. Finding transverse #0. |
| 096 | Total II — Actif circulant | Actif circulant | Brut | total | 050+060+064+068+072+080+084 | `gateTotal096ActifCirculantBrut` (existe) | 096 = Σ | Gate écrite, **jamais appelée** | Géré par le gate (mort) | Géré par le gate (mort) | toujoursBloquees, incoherence_modele | Blocage correct ; infrastructure non câblée | interdit | non | 2 | 🔵 | Code mort — 0 appelant hors tests. |
| 098 | Total II — Actif circulant | Actif circulant | Amort.-Prov. | total | 066+070+074+082+086+094 (052/062 non_applicable) | `gateTotal098` | 098 = Σ — **reconfirmée contre le Cerfa réel** | Gate ACTIVEMENT appelée (F4-C) | Oui, bloque si une composante INCONNU | Oui, somme de feuilles publiables uniquement | map-2033a.ts F4-C | Oui — jamais de somme partielle | interdit du PDF | non | 5 | 🔵 | Correcte en interne, cf. Finding transverse #0 pour la production. |
| 110 | Total général actif (I+II) | Total actif | Brut | total | 044+096 | aucune gate dédiée | 110 = 044+096 | Bloqué (dépend de gates mortes) | Toujours (jamais atteint) | Jamais atteint | toujoursBloquees, incoherence_modele | Blocage correct | interdit | non | 6 (confirment le blocage) | 🔵 | Aucune gate 110 n'existe même en ébauche, contrairement à 112. |
| 112 | Total général actif (I+II) | Total actif | Amort.-Prov. | total | 048+098 | `gateTotal112` référencée par un test non commité, **n'existe pas** | 048+098 **confirmée structurellement correcte** par le Cerfa réel (≠ 110−180, contrôle croisé seulement) | Interdite (scope) et non implémentée ; ⚠ test non commité et **cassé** (voir §5) | Toujours bloquée (conforme consigne) | Jamais atteint | toujoursBloquees, incoherence_modele | Blocage correct dans le code committé | interdit | non — mesures historiques non revalidées (hors périmètre de cet audit) | 7 fichiers, dont 1 non commité et cassé | ⚫ | Voir section 5 dédiée. |
| 120 | Capital social ou individuel | Passif — Capitaux propres | Net | valeur saisie | Compte de l'exploitant | `BilanInputs.compteExploitant` | 120_N = 120_N-1 + apports − prélèvements | Fiable | Oui, bloque | Implicite via apports/prélèvements déclarés | map-2033a.ts, branche patrimoine | Oui (correction P0-6) | PRÉSENT | Oui | 7 | 🔵 | Cf. Finding transverse #0. |
| 124 | Écarts de réévaluation | Passif — Capitaux propres | Net | valeur saisie | Réévaluation légale 1976, rarissime | aucun | — | `hors_perimetre` (catégorie distincte de `non_applicable`) | n/a | n/a | toujoursBloquees, hors_perimetre | Défendable, mais catégorisation à clarifier (la case existe juridiquement pour une EI) | absent | non | 0 | 🔴 | Distinction hors_perimetre/non_applicable pas homogène avec le reste — clarification doctrinale, pas un bug. |
| 126 | Réserve légale | Passif — Capitaux propres | Net | valeur saisie | N/A EI | aucun | — | Structurellement non applicable | n/a | n/a | toujoursBloquees, non_applicable | Oui | absent | non | 0 | 🔴 | Aucun. |
| 130 | Réserves réglementées | Passif — Capitaux propres | Net | valeur saisie | N/A EI | aucun | — | Structurellement non applicable | n/a | n/a | toujoursBloquees, non_applicable | Oui | absent | non | 0 | 🔴 | Aucun. |
| 131 | Autres réserves — dont œuvres d'artistes vivants | Passif — Capitaux propres | Net (« dont ») | dont | N/A EI | aucun | — | Structurellement non applicable | n/a | n/a | toujoursBloquees, non_applicable | Oui | absent | non | 0 | 🔴 | Case « dont » imbriquée dans 132, positionnée à x≈376 (zone médiane) et non x≈466 — particularité géométrique confirmée. |
| 132 | Autres réserves | Passif — Capitaux propres | Net | valeur saisie | N/A EI | aucun | — | Structurellement non applicable | n/a | n/a | toujoursBloquees, non_applicable | Oui | absent | non | 0 | 🔴 | Aucun. |
| 134 | Report à nouveau | Passif — Capitaux propres | Net | valeur saisie | Cumul résultats antérieurs (C1/C2/C3) | `BilanInputs.ran` | `resolveRan()` | Fiable, distingue du déficit fiscal reportable | Oui, bloque | Oui — NATIF⇒0 assumé | map-2033a.ts, branche patrimoine | Oui | PRÉSENT | Oui | 3 | 🔵 | Cf. Finding transverse #0. |
| 136 | Résultat de l'exercice | Passif — Capitaux propres | Net | valeur saisie | Résultat comptable (≠ résultat fiscal) | `resultatComptable(fr)` — source unique avec 310 (2033-B) | resultatAvantAmort − amortCalcule − charges non déductibles | Fiable, toujours calculable | Non — toujours calculable | N/A | map-2033a.ts | Oui — anti-duplication testée | PRÉSENT | Oui | 4 | 🟢 | Case la plus robuste du formulaire avec 030. **Alimentée pour tout dossier réel dès que F-006 tourne**, sans dépendance à `BilanInputs`. |
| 137 | Subventions d'investissement | Passif — Capitaux propres | Net | valeur saisie | Subvention perçue pour investissement | `BilanInputs.subventionsInvestissement` | `resolveLignePatrimoniale()` | Fiable (correction P1-A) | Oui, bloque | Oui, NUL_CONFIRME publiable | map-2033a.ts, branche patrimoine | Oui | PRÉSENT | Oui | 4 | 🔵 | Cf. Finding transverse #0. |
| 140 | Provisions réglementées | Passif — Capitaux propres | Net | valeur saisie | N/A | aucun | — | Structurellement non applicable | n/a | n/a | toujoursBloquees, non_applicable | Oui | absent | non | 0 | 🔴 | Aucun. |
| 142 | Total I — Capitaux propres | Passif — Capitaux propres | Net | total | 120+134+136+137 | `total-capitaux-propres.ts` | 142=Σ, gaté par `checkBilanEquilibre`+137≠INCONNU | Fiable — **seul total réellement câblé** hors 048/098 | Oui, double garde | Oui | map-2033a.ts, délégué | Oui (correction R-01, asymétrie 142/137 corrigée) | PRÉSENT | Oui | 4 | 🔵 | Cf. Finding transverse #0 — mais bon signal de méthode pour 112 quand son tour viendra. |
| 154 | Provisions pour risques — Total II | Passif — Provisions | Net | total (sans détail) | N/A | aucun | — | Structurellement non applicable | n/a | n/a | toujoursBloquees, non_applicable | Oui | absent | non | 0 | 🔴 | Confirmé : le bilan SIMPLIFIÉ n'a aucune ligne de provision détaillée (pas de 144-152), seul 154 est imprimé — cohérent. |
| 156 | Emprunts et dettes assimilées | Passif — Dettes | Net | valeur saisie | CRD au 31/12 (F-011) | `rfs.patrimoine.emprunts` OU `rfs.emprunts` (legacy) | Σ CRD, réconciliée avec `financements.clotureCRD` | Fiable, bloque si DIVERGENT | Oui, bloque | Oui | map-2033a.ts, patrimoine + legacy | Oui (correction P0-3) | PRÉSENT | Oui | 3 | 🟢 | **Alimentable en production dès aujourd'hui** (branche legacy, F-011). |
| 164 | Avances et acomptes reçus | Passif — Dettes | Net | valeur saisie | Acompte reçu d'un locataire | `ventilationTiers.cases.avancesAcomptesRecus` | Σ postes classés | Résolu, jamais lu | Oui | Oui (jamais consommé) | toujoursBloquees, `RAISON_TIERS_ABSENTS` | NON | absent | non | 0 | 🟡 | Cf. Finding transverse #1. |
| 166 | Fournisseurs et comptes rattachés | Passif — Dettes | Net | valeur saisie | Facture fournisseur non payée | `ventilationTiers.cases.fournisseurs` | Σ postes classés | Résolu, jamais lu | Oui | Oui (jamais consommé) | toujoursBloquees, `RAISON_TIERS_ABSENTS` | NON | absent | non | 1 | 🟡 | Cf. Finding transverse #1. |
| 172 | Dettes fiscales et sociales (dont TVA, case 169) | Passif — Dettes | Net | valeur saisie | TVA/cotisations dues | `ventilationTiers.cases.dettesFiscalesSociales` | Σ postes classés | Résolu, jamais lu | Oui | Oui (jamais consommé) | toujoursBloquees, `RAISON_TIERS_ABSENTS` | NON | absent | non | 0 | 🟡 | Cf. Finding transverse #1. Le renvoi imprimé vers « la case 169 » référence un numéro absent de ce même formulaire (probablement 2033-G) — confirmé sur le Cerfa réel, purement informatif. |
| 173 | Comptes courants d'associés | Passif — Dettes | Net | valeur saisie | N/A EI | `ventilationTiers.cases.comptesCourantsAssocies` (typé NON_APPLICABLE) | — | Structurellement non applicable, cohérent | n/a | n/a | toujoursBloquees, non_applicable | Oui | absent | non | 0 | 🔴 | Seul cas « tiers » où le hardcode coïncide avec la doctrine du resolver. |
| 174 | Produits constatés d'avance | Passif — Dettes | Net | valeur saisie | Loyer encaissé d'avance | DEUX voies parallèles (`lignesSimples` + `ventilationTiers`) | valeur déclarée / classification | Doublement résolu, jamais lu | Oui (les deux) | Oui (jamais consommé) | toujoursBloquees, `RAISON_TIERS_ABSENTS` | NON, aggravé par la double modélisation | absent | non | 1 | 🟡 | Cf. Finding transverse #1 + risque de double comptage latent (aucune garde de réconciliation, contrairement à 156). |
| 175 | Autres dettes (dépôts de garantie) | Passif — Dettes | Net | valeur saisie | Dépôt de garantie locataire | DEUX voies parallèles | valeur déclarée / classification | Doublement résolu, jamais lu | Oui (les deux) | Oui (jamais consommé) | toujoursBloquees, `RAISON_TIERS_ABSENTS` | NON | absent | non | 2 | 🟡 | Idem 174. |
| 176 | Total III — Dettes | Passif — Dettes | Net | total | 156+164+166+172+173+174+175 | `gateTotal176Dettes` (existe) | 176 = Σ | Gate écrite, **jamais appelée** | Géré par le gate (mort) | Géré par le gate (mort) | toujoursBloquees, incoherence_modele | Blocage correct ; infrastructure non câblée | interdit | non | 2 | 🔵 | 156 (composante la plus lourde) est déjà fiable — 176 serait le total le plus proche de la ligne d'arrivée si 164/166/172/174/175 étaient câblés. |
| 180 | Total général passif (I+II+III) | Total passif | Net | total | 142+154+176 | aucune gate dédiée | 180 = Σ | Bloqué | Toujours | Jamais atteint | toujoursBloquees, incoherence_modele | Blocage correct | interdit | non | 6 | 🔵 | Utilisé comme terme de CONTRÔLE (jamais de calcul) dans `checkBilanEquilibre.ts` — bonne pratique déjà en place. |
| 182 | Coût de revient des immobilisations acquises/créées (renvoi 5) | Renvois | Mémo | renvoi | Détail informatif, non additif | aucun | — | Aucune donnée modélisée | n/a | n/a | **absent du mapper** | Absence non documentée (ni case, ni entrée `casesNonAlimentees`) | absent | non | 0 | ⚫ | Confirmé sur le Cerfa réel (x≈466.80, y≈785.07) — hors périmètre probable mais jamais tranché dans le code. |
| 184 | Prix de vente HT des immobilisations cédées (renvoi) | Renvois | Mémo | renvoi | Détail informatif sur cessions | aucun | — | Aucune donnée modélisée | n/a | n/a | absent du mapper | Idem 182 | absent | non | 0 | ⚫ | Confirmé (x≈466.80, y≈802.58) — pertinent si une cession de bien LMNP est un jour modélisée. |
| 193 | Dont immobilisations financières < 1 an (renvoi 1) | Renvois | Mémo | renvoi | Ventilation d'échéance sur 040/042 | aucun | — | Aucune donnée modélisée | n/a | n/a | absent du mapper | Absence non documentée | absent | non | 0 | ⚫ | Confirmé (x≈224.30, y≈768.46). |
| 195 | Dont dettes > 1 an (renvoi 4) | Renvois | Mémo | renvoi | Ventilation d'échéance sur 156/164/166/172/174/175 | aucun | — | Aucune donnée modélisée | n/a | n/a | absent du mapper | Absence non documentée | absent | non | 0 | ⚫ | Confirmé (x≈466.80, y≈768.46) — probablement le renvoi le plus fréquent en pratique (tout emprunt LMNP a une part >1 an). |
| 197 | Dont créances > 1 an (renvoi 2) | Renvois | Mémo | renvoi | Ventilation d'échéance sur créances tiers | aucun | — | Aucune donnée modélisée | n/a | n/a | absent du mapper | Absence non documentée | absent | non | 0 | ⚫ | Confirmé (x≈224.30, y≈785.07). |
| 199 | Dont compte courant d'associés débiteurs (renvoi 3) | Renvois | Mémo | renvoi | N/A EI, cohérent avec 173 | aucun | — | Non applicable par cohérence avec 173 | n/a | n/a | absent du mapper (cohérent implicitement) | Conclusion probable, jamais formalisée | absent | non | 0 | 🔴 | Seul renvoi déductible avec un niveau de confiance élevé — à formaliser plutôt que laisser un silence. |

---

## 3. Cases fiables (🟢, 4)

**028, 030, 136, 156.** Ce sont les seules cases de toute la 2033-A à réunir
deux conditions simultanément : (a) le code qui les produit est correct,
testé et documenté ; (b) elles sont réellement exécutables pour un dossier
réel dès aujourd'hui, sans dépendance à une saisie `BilanInputs` qui n'existe
dans aucun écran du produit. 030 est la case la plus mature (10 fichiers de
test) ; 136 est la seule à ne dépendre que de `FiscalResult` (F-006), déjà
un prérequis de toute génération.

## 4. Cases à corriger (🟡, 11)

014, 040, 064, 068, 072, 080, 092 (absente de la matrice mais logiquement
🟡 comme 014/040 — champ `lignesSimples.chargesConstateesAvance` résolu,
jamais lu, cf. Finding transverse #1), 164, 166, 172, 174, 175. Toutes
partagent le même défaut : une donnée réellement résolue en interne
(`lignesSimples` et/ou `ventilationTiers`) qui n'atteint jamais
`Form2033A.cases`, avec un texte de blocage qui peut devenir factuellement
faux dès qu'une saisie existe. Correction proportionnée : lire ces
resolvers dans `map2033AFromRfs()` avant de retomber sur le hardcode
`toujoursBloquees` — travail de câblage pur, aucune nouvelle règle fiscale
à inventer, la résolution 4-états existe déjà.

## 5. Cases bloquées par source / infrastructure non câblée (🔵, 18)

Deux sous-familles bien distinctes, à ne pas traiter de la même façon :

- **16 cases dépendantes de `rfs.patrimoine`** (016, 042, 048, 066, 070,
  074, 082, 084, 086, 094, 098, 120, 134, 137, 142, et partiellement
  028/030/156 pour leur branche patrimoniale) : le code est correct, il
  manque uniquement un canal de collecte produit (`BilanInputs`) — voir
  Finding transverse #0. C'est un chantier UX/produit, pas un chantier de
  correction de bug.
- **5 gates de totaux écrites mais jamais appelées** (`gateTotal044...`,
  `gateTotal096...`, `gateTotal176Dettes`, et l'absence totale de gate pour
  110/180) : c'est un chantier de câblage pur dans `map-2033a.ts`, une fois
  que les cases composantes elles-mêmes seront câblées.

## 6. Cases non applicables (🔴, 15)

010, 012, 050, 052, 060, 062, 124, 126, 130, 131, 132, 140, 154, 173, 199.
Toutes structurellement hors périmètre EI/LMNP, avec une justification
vérifiée contre le Cerfa réel (voir §7 pour 052/062 en particulier). Seule
réserve doctrinale mineure : 124 est catégorisée `hors_perimetre` plutôt que
`non_applicable` dans le code, ce qui introduit une troisième nuance non
présente ailleurs — à clarifier, sans impact fonctionnel.

## 7. Cas particulier 052/062 — réexamen demandé par le jalon

**Conclusion confirmée : `non_applicable` est correct et démontré, pas
seulement affirmé.**

1. **Cerfa réel** — l'extraction physique du PDF (page 1) confirme que 050,
   052, 060 et 062 existent bel et bien comme lignes imprimées, sous la
   rubrique STOCKS : « Matières premières, approvisionnements, en cours de
   production » (050 Brut, 052 Amort.-Prov., y≈293–301) et
   « Marchandises » (060 Brut, 062 Amort.-Prov., y≈308–316). Ce ne sont pas
   des cases inventées ou mal calibrées : elles sont physiquement là.
2. **Périmètre fonctionnel réel de Fiscal AI** — le produit couvre le LMNP
   au régime réel simplifié, une activité de **location** meublée (bail
   d'habitation ou bail commercial para-hôtelier), jamais une activité de
   production ou de négoce. Aucune brique F-006 à F-014 ne modélise un cycle
   d'achat-revente ni un processus de fabrication.
3. **Données métier réellement gérées** — confirmé par grep exhaustif :
   aucun champ `stock`, `matierePremiere`, `enCours` ou `marchandise`
   n'existe nulle part dans `src/runtime/capabilities`.

**052/062 restent donc classées `non_applicable`, catégorie confirmée par
cet audit** (et non `donnee_absente` : ce n'est pas qu'aucune donnée
n'existe, c'est que la notion même n'a pas de sens pour ce périmètre — la
distinction que le jalon demandait explicitement de vérifier). Rien à
corriger ici.

## 8. Cas particulier 112 — documentation complète, **aucune implémentation**

Conformément à la consigne, 112 n'a pas été codée pendant cet audit. Voici
sa fiche complète :

- **Signification officielle** — sur le Cerfa réel (page 1, ligne « Total
  général (I + II) », juste après la rubrique ACTIF CIRCULANT), 112 est la
  case numérotée de la **colonne Amortissements-Provisions** du total actif
  général, symétrique de 110 (colonne Brut). Confirmé par extraction
  physique : 110 à x≈270 (zone-numéro Brut), 112 à x≈376 (zone-numéro
  Amort.-Prov.), même ligne y≈426.56-434.49. **Aucune case numérotée
  n'existe pour la colonne Net** sur cette ligne ni sur aucun total d'actif
  du formulaire — le Net comparable au passif est une valeur dérivée
  (110−112), jamais imprimée avec son propre numéro. Ce point était déjà
  correctement documenté dans le code (`check-bilan-equilibre.ts`,
  commentaire dédié) ; cet audit le confirme de façon indépendante contre
  les octets du PDF officiel.
- **Colonne** — Amortissements-Provisions (confirmé, cf. ci-dessus).
- **Composants** — 048 (Total I, même colonne) + 098 (Total II, même
  colonne). Confirmé par symétrie structurelle avec 110 = 044 + 096 (colonne
  Brut, mêmes totaux intermédiaires).
- **Formule candidate** — **112 = 048 + 098, confirmée structurellement
  correcte** par cet audit (extraction physique du Cerfa + cohérence
  arithmétique colonne par colonne). Ce n'est **pas** une question fiscale
  ouverte : c'est une sommation de deux totaux de colonne déjà bien
  identifiés dans le code.
- **Ce que 112 n'est jamais** — `112 = 110 − 180` est explicitement exclu
  comme méthode de calcul (le code le documente déjà correctement) :
  `110 − 112 = 180` n'est qu'un **contrôle d'équilibre croisé** a
  posteriori, jamais un chemin de production de la valeur. Confirmé
  cohérent avec `checkBilanEquilibre.ts`, qui recalcule `totalActifNet` et
  `totalPassif` indépendamment, sans jamais passer par une case 112 ou 180
  publiée.
- **Prérequis pour ouvrir 112** — les DEUX gates suivants doivent renvoyer
  `COMPOSANTES_CONNUES` simultanément :
  - `gateTotal048` (déjà écrite et appelée) : nécessite 016, 042 (DECLARE/
    NUL_CONFIRME via `lignesSimples`) ET 030 publiée (registre
    d'immobilisations corporelles).
  - `gateTotal098` (déjà écrite et appelée) : nécessite 066, 070, 074, 082,
    094 (DECLARE/NUL_CONFIRME) ET 086 publiée.
  - Transitivement, cela suppose que `rfs.patrimoine` existe — donc que
    `bilanInputs` soit fourni — donc, en l'état actuel du produit, que le
    Finding transverse #0 soit d'abord résolu (un écran de collecte
    existe). **112 ne peut structurellement jamais s'ouvrir avant 048 et
    098, qui ne peuvent eux-mêmes jamais s'ouvrir en production avant que
    le canal de collecte patrimonial existe.**
- **État actuel du code committé** — 112 figure uniquement dans
  `toujoursBloquees` (`map-2033a.ts`), catégorie `incoherence_modele`,
  raison `RAISON_TOTAL_GENERAL_ACTIF`. Aucune fonction `gateTotal112`
  n'existe dans `lignes-simples.ts`. Ceci est **conforme à la consigne**
  du jalon (« 112 reste bloquée »).
- **⚠ État de travail orphelin détecté** — un fichier **non commité**,
  `src/runtime/bilan-map-2033a-f4d-total-112.test.ts` (untracked, absent de
  `git ls-files`), contient une suite de tests complète (7 cas) qui suppose
  l'existence de `gateTotal112(gate048, gate098, boolean, boolean)` importée
  depuis `lignes-simples.ts`. **Cette fonction n'existe pas dans le code
  actuel.** Exécution réelle confirmée :

  ```
  npx tsx --test src/runtime/bilan-map-2033a-f4d-total-112.test.ts
  → 7 fail / 7 (ERR_ASSERTION : valeur attendue vs `undefined`)
  ```

  Ce fichier n'a pas été modifié ni supprimé (consigne §17 : ne pas
  toucher au dirty préexistant), mais il doit être traité comme une
  **spécification de travail non terminée d'un cycle antérieur**, jamais
  comme une preuve que F4-D existe ou fonctionne. Point positif : son
  contenu est un bon brouillon de cahier des charges pour la vraie
  implémentation de F4-D (il couvre déjà les cas 048 inconnu, 098 inconnu,
  zéro explicite double, absence≠zéro sur 016, et anti-formule 110−180) —
  à réutiliser comme base de test le jour où F4-D sera officiellement
  ouvert, après résolution du Finding transverse #0.

## 9. Risques de mapping (🟡)

Voir Finding transverse #1 (§1) pour le risque principal, commun aux 11
cases 🟡. Risque secondaire, plus localisé : la doctrine appliquée à **080**
(Valeurs mobilières de placement, Brut) est incohérente avec le principe
général du produit — le commentaire du mapper la traite comme « non
pertinente », alors que `LignesSimplesInputs` la documente explicitement
comme une ligne « ouverte » qui ne doit jamais être présumée hors sujet par
défaut. Ce n'est pas un bug de calcul (rien n'est publié dans les deux cas),
mais une divergence de discours interne qui mérite clarification avant tout
câblage futur.

## 10. Risques de données

Voir Finding transverse #0 (§1) — le risque principal de toute la 2033-A.
Risque secondaire : la double modélisation parallèle de 174/175
(`lignesSimples` ET `ventilationTiers`, jamais réconciliées) créerait un
risque de double comptage si l'une des deux voies était câblée sans garde
dédiée — contrairement à 156 (emprunts), qui a déjà une réconciliation
stricte contre `tiers.dettes`.

## 11. Risques PDF

- **Aucune case de la 2033-A** (contrairement à 370/372/330 du 2033-B ou
  Col.1/Col.2 du 2031-SD) n'a d'oracle de position indépendant
  (`position-oracle.test.ts` ne couvre aujourd'hui que 2031/2031-bis/2033-B).
  Toutes les positions 2033-A sont `GEO_CONFIRMED_NO_POSITION_ORACLE` : une
  régression de coordonnée (x/y) sur 028/030/084/086/120/134/136/137/142/156
  ne serait détectée par aucun test dédié à la géométrie, seulement par le
  golden master technique (présence de la chaîne, pas sa position).
- **112** : les mesures historiques citées dans le jalon
  ([389.98–480.69]×[422.57–438.43]) n'ont **pas** été revalidées dans le
  cadre de cet audit, conformément à la consigne de ne pas recalibrer. Elles
  devront être revérifiées par les deux méthodes indépendantes déjà
  utilisées pour 300/330 du 2033-B avant tout calibrage définitif.
- **`CASE_MATRIX.md`** (le document vivant existant, couvrant
  2031/2031-bis/2033-B) est **stale** vis-à-vis de la 2033-A : il affirme
  encore qu'« aucun registre visuel PDF n'existe » pour 2033-A-SD, alors que
  `registry/2033-a/2026.ts` existe et couvre 10 cases depuis les jalons P0/
  F4-A. Ce document devrait être mis à jour (ou un document frère créé) pour
  éviter une désynchronisation croissante entre la documentation vivante et
  l'état réel du code.
- **131** (case « dont » imbriquée dans la ligne 132) est positionnée à une
  coordonnée x atypique (zone médiane, pas la colonne de valeur principale)
  — à anticiper si un calibrage de cette zone est un jour entrepris.

## 12. Trous de tests

- **Les 6 renvois** (182, 184, 193, 195, 197, 199) n'ont **aucun test**, et
  plus largement **aucune trace dans le code** (ni case, ni entrée
  `casesNonAlimentees`) — silence total, indiscernable d'un oubli. À
  formaliser au minimum par une entrée `casesNonAlimentees` explicite
  (`hors_perimetre` ou `non_applicable` selon le cas), même sans les
  implémenter.
- **`bilan-map-2033a-f4d-total-112.test.ts`** : 7/7 tests échouent à
  l'exécution (voir §8) — fichier non commité, à ne pas confondre avec une
  régression du code livré.
- **Aucun test ne couvre le Finding transverse #0** lui-même (l'absence de
  tout appelant réel de `runDeclarationGeneration` avec `bilanInputs`
  défini) — un test d'architecture dédié (sur le modèle de
  `assemble-patrimoine.test.ts`, qui vérifie déjà l'absence d'import de
  `produceFiscalResult()`) permettrait de détecter automatiquement le jour
  où ce canal de collecte serait enfin branché, ou de документer
  explicitement qu'il ne l'est pas encore.
- **Aucun test ne couvre le Finding transverse #1** (lecture manquante de
  `lignesSimples`/`ventilationTiers` pour les 12 cases Brut/tiers) — les
  tests existants (`bilan-lignes-simples.test.ts`,
  `bilan-ventilation-tiers.test.ts`) valident les resolvers isolément,
  jamais leur (non-)consommation par `map2033AFromRfs`.
- **014/040/080** (Brut immobilisé/VMP) : 0 à 2 fichiers de test au total,
  aucun ne teste la case Cerfa elle-même.

## 13. Ordre recommandé de codage après cet audit

Le jalon demande de ne pas coder — cet ordre est une recommandation pour la
suite, à valider par le Product Owner avant tout jalon d'exécution :

1. **Décision produit préalable, hors code** : construire (ou explicitement
   reporter) un écran de collecte `BilanInputs` minimal (trésorerie, compte
   de l'exploitant, RAN, tiers) — sans cela, aucun câblage de mapper
   n'aura le moindre effet visible en production (Finding transverse #0).
   C'est la décision qui conditionne toute la suite, pas un détail
   d'implémentation.
2. **Câblage pur, à faible risque** (une fois la décision 1 prise) : faire
   lire à `map2033AFromRfs()` les 12 champs `lignesSimples`/`ventilationTiers`
   déjà résolus pour 014/040/064/068/072/080/092/164/166/172/174/175
   (Finding transverse #1) — aucune nouvelle règle fiscale, juste retirer
   le hardcode `toujoursBloquees` là où une résolution existe déjà.
   Trancher au passage la réconciliation 174/175 (double voie).
3. **Câblage des gates de totaux Brut** (`gateTotal044`, `gateTotal096`,
   `gateTotal176Dettes`) dans `map-2033a.ts`, une fois 2 fait — même
   nature de travail que F4-C mais côté Brut.
4. **110** : écrire sa gate (inexistante aujourd'hui) sur le modèle de 098/
   112, une fois 044/096 câblés.
5. **F4-D (112)** en tout dernier, une fois 048 ET 098 réellement
   atteignables en production (pas seulement en test synthétique) — en
   repartant du brouillon de tests du fichier non commité identifié en §8,
   qu'il faudra alors committer et adapter (il suppose déjà la bonne
   signature `gateTotal112(gate048, gate098, …)`).
6. **Formaliser les 6 renvois** (182/184/193/195/197/199) par une entrée
   `casesNonAlimentees` explicite — travail isolé, sans dépendance aux
   points précédents.
7. **Calibrage PDF** : n'entamer un calibrage géométrique dédié (avec oracle
   indépendant, sur le modèle de 300/330 du 2033-B) qu'une fois une case
   donnée réellement productible en production — calibrer une case qui ne
   sera jamais alimentée serait un travail prématuré.

---

## 14. Divergences avec F4-A/F4-B/F4-C documentées précédemment

- Le jalon annonçait 048/098 comme de simples totaux calculés
  (« 048 = 016+030+042 », « 098 = Σ… ») sans mentionner explicitement
  qu'ils sont **interdits de rendu PDF** (`CERFA_2033A_FORBIDDEN_CASE_IDS`)
  et **jamais exercés en production** (Finding transverse #0) — ce n'est
  pas une erreur du jalon, mais une précision manquante que cet audit
  ajoute.
- `CASE_MATRIX.md` (document vivant antérieur) est stale sur la couverture
  du registre visuel 2033-A (voir §11) — à corriger séparément, hors
  périmètre de ce jalon d'audit.
- Le jalon ne mentionnait pas l'existence du fichier de test F4-D non
  commité et cassé (§8) — découverte de cet audit, à traiter avant
  d'ouvrir officiellement F4-D.
- Le jalon ne mentionnait pas non plus l'absence totale de tout appelant
  réel de `runDeclarationGeneration` avec `bilanInputs` — c'est la
  découverte la plus significative de cet audit (Finding transverse #0),
  absente de tout jalon antérieur consulté.

---

## 15. Non-régression exécutée

```
npm run test:liasse-pdf-2033a   → 29/29 ✅ (17 suites)
npm run test:liasse-pdf-2033b   → 116/116 ✅ (32 suites) — 2033-B stable, confirmé
npx tsc --noEmit                → 0 erreur (exit 0)
npx tsx --test src/runtime/bilan-*.test.ts src/runtime/rfs-2033a*.test.ts
                                 → 253/260 ✅, 7 échecs — TOUS dans le fichier
                                   non commité bilan-map-2033a-f4d-total-112.test.ts
                                   (voir §8) ; aucun échec dans le code committé.
```

`map-2033b.ts` : non modifié (aucune modification produite par ce jalon ne
touche à ce fichier — confirmé, voir §16).

---

## 16. Git — modifications produites par P1-PDF-02-G vs dirty préexistant

Aucun commit, aucun push effectué (consigne respectée).

### Modifications produites par ce jalon (P1-PDF-02-G)

Uniquement deux fichiers **nouveaux**, aucun fichier existant modifié :

```
src/lib/lmnp/services/liasse-pdf/AUDIT-2033A-P1-PDF-02-G.md    (ce rapport)
src/lib/lmnp/services/liasse-pdf/AUDIT-2033A-P1-PDF-02-G.json  (matrice machine-readable)
```

### Dirty préexistant (F4-A/F4-B/F4-C et travaux antérieurs — non touché, non nettoyé)

```
Modifiés (M) :
  package.json
  src/lib/lmnp/services/declaration/run-declaration-generation.test.ts
  src/lib/lmnp/services/declaration/run-declaration-generation.ts
  src/lib/lmnp/services/liasse-pdf/index.ts
  src/lib/lmnp/services/liasse-pdf/registry/2033-a/2026.ts
  src/lib/lmnp/services/liasse-pdf/tests/golden-master-technical-pipeline.test.ts
  src/runtime/capabilities/rfs/build-fiscal-representation.ts
  src/runtime/capabilities/rfs/projection/map-2033b.ts   ← non modifié PAR CE JALON (confirmé)
  src/runtime/capabilities/rfs/types.ts
  src/runtime/f006.test.ts
  src/runtime/rfs-2033b.test.ts
  src/runtime/rfs-2033c.test.ts
  src/runtime/rfs.test.ts

Non suivis (??), préexistants avant ce jalon :
  scripts/cycle23-revenus-reel.xlsx
  scripts/f010-b1-browser-harness.js
  scripts/f010-b1-idb-probe.js
  src/lib/lmnp/services/liasse-pdf/CASE_MATRIX.md            ← stale, voir §11
  src/lib/lmnp/services/liasse-pdf/generate-cerfa-2033a.ts
  src/lib/lmnp/services/liasse-pdf/scope/2033-a-2026.ts
  src/lib/lmnp/services/liasse-pdf/tests/case-318-verification.test.ts
  src/lib/lmnp/services/liasse-pdf/tests/case-350-fiscal-arbitration.test.ts
  src/lib/lmnp/services/liasse-pdf/tests/case-372-fiscal-divergence.test.ts
  src/lib/lmnp/services/liasse-pdf/tests/fixtures-2033a-rfs.ts
  src/lib/lmnp/services/liasse-pdf/tests/identite-adresse-limite.test.ts
  src/lib/lmnp/services/liasse-pdf/tests/output/
  src/lib/lmnp/services/liasse-pdf/tests/vertical-slice-2033-a.test.ts
  src/runtime/bilan-map-2033a-f4d-total-112.test.ts          ← CASSÉ, voir §8
  src/runtime/rfs-patrimoine-transport.test.ts
```

Rien de ce dirty préexistant n'a été modifié, réinitialisé ou supprimé.

---

## 17. Critère d'arrêt

Ce jalon s'arrête ici, conformément à la consigne : matrice exhaustive
produite (§2), rapport d'audit produit (ce document), divergences avec
F4-A/B/C documentées (§14), trous de données métier documentés (§1, §5),
trous de tests documentés (§12), priorités de codage proposées (§13).
**F4-D n'a pas été entamé. Aucune règle fiscale n'a été codée. Aucun
registre PDF n'a été étendu.** En attente de validation du Product Owner
avant reprise du codage.
