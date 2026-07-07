---
id: ADR-004
title: Architecture documentaire des formulaires fiscaux
type: adr
status: pending-decision
version: "1.0"
created: 2026-07-02
updated: 2026-07-02
owner: product-owner
tags: [adr, formulaires, liasse, knowledge-system, f-007]
triggers: [F-007]
related: [ADR-003, TRF-0032, SAV-010, SAV-011, ENT-008]
---

# ADR-004 — Architecture documentaire des formulaires fiscaux

---

# Statut

🟡 **En attente de décision** — ADR préparatoire. Aucun document FOR ni CASE n'est créé à ce stade.

---

# Contexte

Le Fiscal Engine (F-006) est terminé. TRF-0032 produit un objet `FiscalResult` cohérent, validé par CASE-001 et VER-052.

Le prochain chantier est F-007 : transformer ce `FiscalResult` en une liasse fiscale officielle composée de formulaires Cerfa.

La revue de préparation de F-007 a établi que le KS est profond sur la partie calcul et inexistant sur la partie production de formulaires. Aucun document FOR n'existe. Aucun mapping FiscalResult → case Cerfa n'existe.

La question n'est pas si ces documents doivent être créés. Ils doivent l'être.

La question est à quelle granularité, dans quel ordre, et avec quelle méthode — en appliquant le même principe qui a guidé le reste du projet : aucune abstraction avant qu'elle soit justifiée par un besoin réel.

---

# Problème

La liasse LMNP réel simplifié se compose de 5 formulaires Cerfa :

| Formulaire | Contenu |
|---|---|
| 2031-SD | Déclaration de résultats BIC — page de synthèse |
| 2033-A | Bilan simplifié |
| 2033-B | Compte de résultat simplifié |
| 2033-C | Tableau des immobilisations et amortissements |
| 2033-D | Tableau des provisions, amortissements dérogatoires, déficits reportables |

Ces 5 formulaires contiennent plusieurs centaines de cases. Chaque case a une nature (calculée, saisie, reportée), une source dans le FiscalResult ou dans les données du dossier, et parfois une règle de remplissage non triviale.

La décision à prendre est : comment représenter ces formulaires dans le KS de façon à ce que Composer puisse implémenter F-007 sans prendre de décision métier — sans sur-documenter avant d'avoir la preuve que la structure choisie est la bonne.

---

# Approches comparées

---

## Approche A — Un document FOR par formulaire

### Description

Créer cinq documents FOR-001 à FOR-005, un par formulaire. Chaque document décrit l'ensemble des cases du formulaire avec leurs règles de remplissage. Aucun document de niveau inférieur (case individuelle) n'est créé.

### Avantages

- Granularité naturelle : un formulaire est une unité administrative réelle, avec un numéro Cerfa, un millésime, et des contraintes d'ensemble.
- Maintenabilité concentrée : quand l'administration met à jour un formulaire, un seul document est à modifier.
- Composer a une référence unique par formulaire — lisible et complète.
- Structure symétrique : les 5 FOR couvrent exactement la liasse sans recouvrement.

### Inconvénients

- Un formulaire comme 2033-C peut avoir des dizaines de lignes d'immobilisations, chacune avec ses propres règles (VB, amortissement cumulé N-1, dotation N, amortissement cumulé N, VNC). Un seul document FOR-004 deviendrait soit trop volumineux, soit superficiel.
- Certaines cases ont des règles de remplissage qui mobilisent des Jugements complexes (ex. : ordre d'imputation des déficits en 2033-D, règle de limitation de l'amortissement). Si tout est dans le FOR, il mixe description structurelle et règles fiscales.
- Si le format FOR-001 est mal calibré, les quatre suivants héritent du mauvais format.

### Coût documentaire

5 documents. Coût initial modéré. Coût de maintenance concentré.

### Traçabilité

Bonne au niveau formulaire. Faible au niveau case : pour tracer une valeur jusqu'à sa source, Composer doit lire l'intégralité du FOR.

### Évolutivité

Bonne si les formulaires changent peu. Problématique si certaines cases évoluent indépendamment du reste du formulaire.

### Impact sur Composer

Composer a une référence par formulaire. Suffisant pour les cases simples (valeur directe depuis FiscalResult). Insuffisant pour les cases à règle de calcul complexe — Composer devrait interpréter plutôt que lire.

### Impact sur le KS

Structure claire mais potentiellement incomplète. Le KS reste ambigu sur les règles de cas complexes.

---

## Approche B — Un document FOR par formulaire + documents CASE pour les cases complexes

### Description

Créer les cinq FOR-001 à FOR-005 comme dans l'Approche A, puis créer des documents CASE-FOR individuels pour les cases dont la règle de remplissage est non triviale.

Exemple :
- `CASE-2033D-DEFICIT` — règle d'imputation chronologique des déficits
- `CASE-2033C-IMMO` — structure d'une ligne d'immobilisation
- `CASE-2031-RESULTAT` — cohérence entre le résultat 2031 et le résultat 2033-B

### Avantages

- Les rules complexes ont leur propre espace documentaire.
- Séparation claire entre structure (FOR) et règle fiscale (CASE).
- Un CASE peut être référencé par plusieurs FOR si la même règle s'applique à plusieurs formulaires.

### Inconvénients

- **Explosion documentaire préventive.** Sans avoir implémenté une seule case de 2031-SD, il est impossible de savoir avec certitude quelles cases sont vraiment complexes. Identifier les cases complexes a priori revient à inventer une classification avant d'avoir l'expérience.
- Deux niveaux documentaires à maintenir en cohérence (FOR + CASE). Si le FOR change, les CASE doivent être revus.
- Le gain de traçabilité est réel mais le coût de création est anticipatif — contre le principe fondamental du projet.
- L'Approche B amplifie un risque déjà présent dans l'Approche A : si FOR-001 est mal calibré, les CASE créés autour de lui hériteront du même mauvais calibrage.

### Coût documentaire

5 FOR + N CASE (N inconnu avant implémentation). Coût initial élevé, incertain, potentiellement infondé.

### Traçabilité

Maximale. Chaque case complexe a son propre document référençable.

### Évolutivité

Bonne mais fragile : un changement de formulaire peut invalider des CASE créés anticipativement.

### Impact sur Composer

Idéal en théorie. Risqué en pratique si les CASE sont créés avant que leur contenu soit empiriquement validé.

### Impact sur le KS

Richesse maximale, mais dette documentaire potentielle si les CASE créés s'avèrent mal scindés.

---

## Approche C — Architecture progressive : TRF d'abord, FOR validé par l'expérience

### Description

Ne pas commencer par la structure des formulaires. Commencer par la connaissance qui manque vraiment : le mapping entre le FiscalResult et les formulaires.

**Phase 1 — Un seul document de savoir fondateur.**

`SAV-029 — Composition de la liasse LMNP réel simplifié`

Ce document établit la vérité de base : quels formulaires composent la liasse, dans quel ordre, quelles obligations de dépôt. Il ne décrit pas les cases. Il dit uniquement : "La liasse LMNP réel simplifié se compose de 2031-SD + 2033-A + 2033-B + 2033-C + 2033-D."

C'est le seul document de ce bloc qui peut être créé avec certitude avant toute implémentation.

**Phase 2 — L'entité manquante.**

`ENT-013 — Identité déclarante`

Les formulaires exigent des champs (nom, adresse, SIRET, SIE compétent, exercice) qui n'appartiennent pas au FiscalResult et n'ont aucune entité dans le KS. Cette entité est la seule pièce manquante du côté des données d'entrée.

**Phase 3 — La transformation pivot, avec UN SEUL formulaire.**

`TRF-0033 — Mapping FiscalResult → FormData` (version partielle : 2031-SD uniquement)

TRF-0033 est le document central de F-007. Il décrit comment chaque champ du FiscalResult s'inscrit dans chaque case d'un formulaire. Il est créé d'abord pour un seul formulaire — 2031-SD, la page de synthèse — qui est le formulaire le plus simple et le plus représentatif.

La structure interne de TRF-0033 pour ce premier formulaire répondra à la question que l'Approche A et l'Approche B ne peuvent pas résoudre par le raisonnement seul : est-ce que les cases peuvent être documentées directement dans la transformation, ou est-ce que certaines requièrent un document propre ?

**Phase 4 — FOR créés lazily, par besoin observé.**

Si TRF-0033 pour 2031-SD révèle que certaines cases sont suffisamment complexes pour mériter leur propre référence documentaire stable, `FOR-001` est créé à ce moment. Il émane d'un besoin réel, pas d'une anticipation.

Si TRF-0033 suffit à décrire complètement 2031-SD sans ambiguïté, FOR-001 est inutile. Il n'est pas créé.

Les formulaires 2033-A à 2033-D suivent le même processus, l'un après l'autre, à mesure que F-007 est implémenté.

---

### Avantages de l'Approche C

- Aucune abstraction prématurée. Les FOR sont créés uniquement si l'expérience de TRF-0033 démontre qu'ils apportent de la valeur.
- TRF-0033 est le document le plus opérationnel pour Composer : c'est lui qui dit exactement quoi mettre dans quelle case, dans le même format que toutes les TRF existantes.
- La progression par formulaire permet de valider le format documentaire sur un cas simple (2031-SD) avant de le généraliser aux formulaires plus complexes (2033-C, 2033-D).
- Cohérente avec ADR-003 : comme le Registry a été supprimé parce qu'il s'est avéré inutile à l'usage, les FOR sont créés seulement s'ils s'avèrent nécessaires à l'usage.

### Inconvénients de l'Approche C

- TRF-0033 peut devenir un document volumineux si tous les mappings y sont concentrés. Risque de monofichier difficile à naviguer.
- Si plusieurs formulaires partagent des règles communes, elles seront répétées dans TRF-0033 faute de FOR centralisé pour les regrouper.
- La décision de créer ou non un FOR repose sur un jugement d'observation qui doit être fait explicitement — Composer ne peut pas décider seul.

### Coût documentaire

2 documents certains (SAV-029 + ENT-013) + 1 transformation partielle (TRF-0033/2031-SD). Coût total initial : 3 documents.

### Traçabilité

Identique à l'Approche A pour les cases couvertes par TRF-0033. Les FOR sont créés si et seulement si la traçabilité de TRF-0033 seule est insuffisante.

### Évolutivité

Maximale. Chaque formulaire est documenté à la mesure exacte de sa complexité réelle.

### Impact sur Composer

Composer commence avec TRF-0033. Si la transformation est suffisamment précise, il peut implémenter sans ambiguïté. Si elle ne l'est pas, c'est un signal que le FOR correspondant est nécessaire — et Composer le signale.

### Impact sur le KS

Structure minimale au départ, enrichie progressivement par l'expérience. Aucune dette documentaire préventive.

---

# Tableau de comparaison

| Critère | Approche A | Approche B | Approche C |
|---|---|---|---|
| Documents à créer avant F-007 | 5 | 5 + N | 3 |
| Risque de mauvais calibrage | Élevé (5 documents hériteront) | Très élevé | Faible (corrigé dès FOR-001) |
| Coût si format inadapté | Refondre 5 documents | Refondre 5 + N | Refondre 1 |
| Traçabilité | Bonne | Maximale | Progressive |
| Maintenabilité | Concentrée | Fragmentée | Concentrée puis enrichie |
| Cohérence avec ADR-003 | Partielle | Faible | Totale |
| Documents créés sans preuve | 4 | 4 + N | 0 |

---

# La question centrale : Option 1 ou Option 2 ?

## Option 1 — Créer FOR-001 à FOR-005 immédiatement, puis commencer F-007

**Argument en faveur :** La liasse est un ensemble cohérent. Les 5 formulaires sont interdépendants (les valeurs de 2033-B alimentent 2031-SD, les valeurs de 2033-C alimentent 2033-D). Documenter les 5 en même temps garantit cette cohérence.

**Argument contre :** La cohérence entre formulaires est une vérité fiscale — elle doit être documentée dans TRF-0033 (le mapping), pas dans les FOR (qui décrivent la structure individuelle). Créer les 5 FOR avant d'avoir TRF-0033 revient à documenter la cible avant de documenter la trajectoire.

De plus, les formulaires ne sont pas homogènes en complexité :
- 2031-SD est la page de synthèse : valeurs directement issues de FiscalResult, peu de règles propres.
- 2033-C contient une ligne par immobilisation, avec 5 colonnes chacune, et des règles de cumulul inter-exercices.
- 2033-D contient la gestion chronologique des déficits — une des règles les plus délicates du régime.

Créer FOR-001 à FOR-005 en même temps force à prendre des décisions de format sur des formulaires complexes sans avoir encore l'expérience du formulaire simple. C'est le même anti-pattern que le Registry : une abstraction créée avant que le besoin soit prouvé.

**Verdict Option 1 : non recommandée.**

## Option 2 — Créer FOR-001 seul, implémenter, observer, généraliser

**Argument en faveur :** L'Approche C démontre que la transformation TRF-0033 est le document pivot, pas le FOR. Si TRF-0033/2031-SD s'avère suffisant pour implémenter la génération de 2031-SD, le FOR est inutile. Si TRF-0033 seul est insuffisant, ce constat oriente précisément la structure du FOR.

Il ne s'agit pas de prudence excessive. Il s'agit d'appliquer le seul principe qui a validé toutes les décisions précédentes : laisser la réalité décider, pas la planification.

ADR-003 a supprimé le Registry après un seul Sprint d'expérience. Si FOR-001 s'avère le bon pattern après la première partie de F-007, les FOR-002 à FOR-005 seront créés immédiatement. Si TRF-0033 seul suffit, aucun FOR n'est créé — et la dette documentaire évitée est considérable.

**Argument contre :** Risque de découvrir en cours d'implémentation que 2033-C ou 2033-D requièrent une structure FOR radicalement différente de FOR-001, ce qui obligerait à refondre un document déjà validé. Ce risque est réel, mais il est inférieur au risque de créer cinq FOR inadaptés.

**Verdict Option 2 : recommandée.**

---

# Décision

L'Approche C est retenue.

L'Option 2 est retenue.

---

## Architecture décidée

**Famille documentaire : TRF d'abord, FOR par besoin observé.**

Les formulaires fiscaux sont représentés dans le KS principalement via la Transformation TRF-0033. Les FOR sont une famille documentaire complémentaire, créée uniquement si TRF-0033 révèle une complexité qui dépasse sa capacité descriptive.

### Documents à créer, dans cet ordre

**Étape 1 — Fondations (avant tout code)**

| Document | Objet | Justification |
|---|---|---|
| SAV-029 | Composition de la liasse LMNP réel simplifié | Seule vérité de base qui peut être documentée avec certitude avant implémentation |
| ENT-013 | Identité déclarante | Données d'entrée manquantes pour tout formulaire Cerfa |

**Étape 2 — Transformation pivot (premier formulaire uniquement)**

| Document | Objet | Justification |
|---|---|---|
| TRF-0033 | Mapping FiscalResult → FormData, pour 2031-SD uniquement | La transformation est le document opérationnel pour Composer. Commencer par le formulaire le plus simple pour valider le format |

**Étape 3 — Observation après la première implémentation de F-007**

À l'issue de la génération de 2031-SD, une de ces deux conclusions est possible :

- **TRF-0033 est suffisant** : les cases de 2031-SD sont toutes documentées sans ambiguïté dans la transformation. FOR-001 n'est pas créé. TRF-0033 est étendu au formulaire suivant.
- **TRF-0033 est insuffisant** : certaines cases requièrent une référence documentaire stable, indépendante de la transformation (typiquement : une case dont la règle est partagée entre plusieurs transformations, ou une case dont la définition officielle mérite d'être préservée comme source de vérité administrative). FOR-001 est alors créé, avec exactement le contenu que l'implémentation a révélé nécessaire.

**Étape 4 — Extension aux formulaires suivants**

Le même processus est appliqué dans cet ordre, du plus simple au plus complexe :

```
1. 2031-SD  (synthèse — valeurs directes depuis FiscalResult)
2. 2033-B   (compte de résultat — catégories de charges)
3. 2033-A   (bilan — actif/passif simplifié)
4. 2033-D   (déficits reportables — règle chronologique)
5. 2033-C   (immobilisations — ligne par ligne, règles de cumul)
```

Cet ordre est délibérément inverse de la numérotation Cerfa. Il va du plus immédiatement alimenté par FiscalResult au plus structurellement complexe.

### Ce qui ne sera jamais créé

Des documents CASE individuels (CASE-2033D-DEFICIT, CASE-2033C-IMMO…) ne seront créés que si une case spécifique requiert une règle de calcul non triviale qui n'existe pas encore dans les TRF. Si la règle peut être documentée dans TRF-0033 ou dans un FOR, aucun CASE n'est créé.

Un CASE se justifie uniquement si trois conditions sont simultanément vraies :
1. La case mobilise un Jugement ou une règle d'imputation propre à elle-même.
2. Cette règle n'existe pas dans les TRF existantes.
3. La règle est susceptible d'être réutilisée dans d'autres contextes au-delà du seul formulaire.

---

## Règles effectives pour F-007

**Règle 1 — TRF-0033 est le document pivot.**

Toute décision de remplissage d'une case Cerfa est documentée dans TRF-0033 avant d'être implémentée. Aucun mapping ne peut rester implicite dans le code.

**Règle 2 — Un FOR est créé uniquement si TRF-0033 est insuffisant.**

Si Composer peut implémenter une case sans ambiguïté en lisant TRF-0033, aucun FOR n'est nécessaire pour cette case. Un FOR est créé si et seulement si la référence administrative du formulaire doit exister indépendamment de la transformation (par exemple : pour valider que les cases d'un formulaire mis à jour par l'administration restent alignées avec TRF-0033).

**Règle 3 — Aucun CASE préventif.**

Aucun document CASE n'est créé avant que l'implémentation révèle la nécessité d'une règle isolée. La liste des cases complexes ne peut pas être établie par anticipation.

**Règle 4 — L'ordre des formulaires suit la complexité croissante.**

Commencer par 2031-SD. Terminer par 2033-C. Cette séquence maximise la probabilité de détecter un mauvais calibrage documentaire au moment où son coût de correction est le plus faible.

**Règle 5 — Chaque case de chaque formulaire est traçable.**

Qu'elle soit documentée dans TRF-0033 ou dans un FOR, chaque case doit pouvoir être tracée jusqu'à sa source dans le FiscalResult, le plan d'amortissement, ou ENT-013. Aucune case ne peut avoir une valeur dont l'origine est implicite.

---

# Conditions de réouverture de cette ADR

Cette décision sera reconsidérée si :

- TRF-0033 devient ingérable sur 5 formulaires (trop volumineux, trop difficile à maintenir) — auquel cas la création systématique des FOR sera justifiée par l'expérience.
- Un formulaire s'avère structurellement incompatible avec le format TRF (par exemple : un formulaire dont les cases sont interdépendantes de manière non linéaire, impossible à exprimer comme un mapping séquentiel).
- L'administration fiscale met à jour un formulaire entre deux exercices — ce qui rend la référence documentaire stable (FOR) plus précieuse que la transformation seule.

---

# Principe directeur

> Le bon niveau de documentation est celui qui permet à Composer d'implémenter sans décider. Ni plus, ni moins. Un document qui décrit ce que Composer peut inférer seul est du bruit. Un document qui laisse Composer choisir est une décision métier déguisée en implémentation. TRF-0033 est le juste milieu : une transformation explicite qui dit exactement quoi mettre dans quelle case, dans le même format que les 32 transformations qui l'ont précédée.
