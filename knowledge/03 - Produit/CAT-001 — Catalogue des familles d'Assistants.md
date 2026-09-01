---
id: CAT-001
title: Catalogue des familles d'Assistants
type: catalogue
status: approved
version: "1.0"
created: 2026-07-01
updated: 2026-07-01
version_history:
  - version: "1.0" — création initiale (2026-07-01)
  - version: "1.1" — renommage SYNTHÈSE → CONCLUSION (2026-07-01)
owner: product-owner
tags: [catalogue, familles, patterns, conception, assistants]
scope: guide de conception — ne décrit pas les Features, décrit les patterns
---

# CAT-001 — Catalogue des familles d'Assistants

---

# Pourquoi ce document existe

Chaque Assistant de Fiscal AI résout un problème utilisateur différent. Mais sous la diversité des sujets (logement, charges, revenus…), il existe un petit nombre de **patterns cognitifs** — des manières fondamentalement différentes de traiter un problème.

Ce document ne décrit pas les Features. Il décrit ces patterns.

Son objectif est double :
1. **Accélérer la conception** des futurs Assistants en identifiant rapidement leur famille avant d'écrire une ligne de spécification.
2. **Prévenir les erreurs de conception** en documentant les pièges propres à chaque famille.

Un Assistant mal classifié dans sa famille produit inévitablement une mauvaise UX — soit parce qu'il pose des questions inutiles (confond CARACTÉRISATION avec COLLECTION OUVERTE), soit parce qu'il ne détecte pas les erreurs qu'il pourrait détecter (confond RÉCONCILIATION avec COLLECTE).

---

# Vue d'ensemble

| # | Famille | Verbe central | Direction | Assistants |
|---|---|---|---|---|
| 1 | CONTEXTE | Établir | Utilisateur → Système | F-009 |
| 2 | CARACTÉRISATION | Décrire | Utilisateur + Documents → Système | F-010, F-011 |
| 3 | COLLECTION OUVERTE | Qualifier | Utilisateur + Documents → Système | F-012 |
| 4 | RÉCONCILIATION | Vérifier | Système ↔ Utilisateur | F-013 |
| 5 | CONCLUSION | Obtenir | Système → Utilisateur | F-006, F-014 (anticipés) |

**Familles manquantes identifiées :** EXPLICATION, ARBITRAGE (voir fin de document).

---

# Analyse des Assistants existants

## F-009 — Assistant Activité

**Vrai problème utilisateur :** "Je dois déclarer une activité fiscale que je ne comprends pas bien. J'ai besoin que le système sache qui je suis avant de commencer."

**Pattern cognitif :** L'utilisateur répond à des questions sur des faits qu'il connaît avec certitude (il est propriétaire, il a une date d'acquisition, il a un statut). Il n'y a aucune ambiguïté sur les réponses — elles sont vraies ou fausses, pas plus ou moins justes.

**Ce que le système sait :** Rien. C'est le premier Assistant.

**Ce que l'utilisateur doit apporter :** Sa situation telle qu'elle est, en langage courant.

**Rôle de l'Assistant :** Traduire la situation réelle en paramètres formels (régime fiscal, dates, statut administratif) qui serviront de contraintes à tout ce qui suit.

**Verbe central :** Établir.

**Famille :** CONTEXTE

---

## F-010 — Assistant Logement

**Vrai problème utilisateur :** "Mon bien a coûté plusieurs prix différents selon ce qu'on y inclut. Je ne sais pas comment le valoriser fiscalement, et je ne connais pas les concepts d'amortissement."

**Pattern cognitif :** L'utilisateur doit décrire une entité complexe (le bien) avec suffisamment de précision pour que le système puisse en dériver des valeurs calculées (prix de revient, base amortissable, plan d'amortissement). L'entité a une structure connue à l'avance mais dont la valeur est construite — elle n'existe dans aucun document sous cette forme.

**Ce que le système sait :** La `date_mise_en_service` (de F-009).

**Ce que l'utilisateur doit apporter :** Des documents (acte notarié, factures) et des jugements (mobilier inclus ou non, nature des travaux).

**Rôle de l'Assistant :** Guider la description de l'entité, appliquer les Jugements, calculer les valeurs dérivées. L'output n'existe nulle part avant que l'Assistant l'ait construit.

**Verbe central :** Établir (par construction).

**Famille :** CARACTÉRISATION (mode : construction)

---

## F-011 — Assistant Financement

**Vrai problème utilisateur :** "J'ai un prêt. Je sais que les intérêts sont déductibles, mais je ne sais pas lesquels exactement ni à quel montant."

**Pattern cognitif :** L'utilisateur doit décrire une entité plus simple (le prêt) dont la structure est standardisée et la réponse existe déjà dans un document (le tableau d'amortissement bancaire). La valeur cherchée n'est pas à construire — elle est à extraire et à isoler correctement.

**Ce que le système sait :** Le `prix_revient` du bien (de F-010).

**Ce que l'utilisateur doit apporter :** Son tableau d'amortissement, ou à défaut ses conditions de prêt.

**Rôle de l'Assistant :** Extraire les intérêts déductibles de la période exacte. L'output existe dans un document — l'Assistant aide à le trouver et à ne prendre que ce qui est déductible.

**Verbe central :** Identifier (par extraction).

**Famille :** CARACTÉRISATION (mode : extraction)

---

## F-012 — Assistant Charges

**Vrai problème utilisateur :** "J'ai eu des dépenses. Je ne sais pas lesquelles sont déductibles, à quel montant, sous quelle forme — et je ne sais même pas si j'ai pensé à tout."

**Pattern cognitif :** L'ensemble des transactions est inconnu à l'avance, de cardinalité variable, et chaque transaction nécessite une qualification individuelle avant d'être comptabilisée. L'Assistant ne peut pas savoir si la collecte est complète — il peut seulement demander si chaque catégorie attendue a été renseignée.

**Ce que le système sait :** La `date_mise_en_service`, le contexte du bien.

**Ce que l'utilisateur doit apporter :** Toutes ses factures et pièces justificatives, sans en connaître le classement fiscal.

**Rôle de l'Assistant :** Structurer la collecte (scaffold des catégories attendues), qualifier chaque transaction (réparation vs amélioration, déductible vs à amortir), et vérifier la complétude de l'inventaire.

**Verbe central :** Qualifier.

**Famille :** COLLECTION OUVERTE

---

## F-013 — Assistant Revenus

**Vrai problème utilisateur :** "Je sais approximativement ce que j'ai encaissé, mais je ne suis pas sûr que mon chiffre soit le bon — ni même ce qu'il doit inclure exactement."

**Pattern cognitif :** Le système peut calculer indépendamment une référence (revenu théorique = loyer × mois). L'utilisateur arrive avec une estimation. L'Assistant confronte les deux, explique les écarts, et produit un total défendable. L'Assistant peut détecter des erreurs que l'utilisateur n'aurait pas signalées spontanément.

**Ce que le système sait :** Le loyer mensuel, la durée de location, les vacances connues.

**Ce que l'utilisateur doit apporter :** Le total de ce qu'il a encaissé — et les explications des écarts.

**Rôle de l'Assistant :** Produire la référence, confronter, qualifier les écarts, valider le total.

**Verbe central :** Vérifier.

**Famille :** RÉCONCILIATION

---

# Challenge de la taxonomie

Avant de figer les familles, voici les fusions et scissions que j'ai envisagées — et les raisons de les rejeter ou de les accepter.

---

**Tentative de fusion : F-010 et F-011 → une seule famille**

F-010 et F-011 décrivent tous deux une entité pour en extraire une valeur fiscale. La tentation est de les fusionner en "CARACTÉRISATION".

**Verdict : fusion acceptée, avec deux modes.**

La distinction "construction vs extraction" n'est pas une différence de famille — c'est une différence de mode à l'intérieur de la même famille. Le pattern cognitif est identique : l'entité a une structure connue, un nombre fini de champs, et converge vers un output calculé. Ce qui varie, c'est la source de la valeur (à construire ou à extraire d'un document). Les invariants UX, les pièges de conception, et la logique d'exécution sont les mêmes.

---

**Tentative de fusion : CONTEXTE et CARACTÉRISATION**

F-009 décrit aussi une situation (l'activité). Pourquoi ne pas l'inclure dans CARACTÉRISATION ?

**Verdict : rejet. Les familles restent distinctes.**

La différence est structurelle. CONTEXTE ne produit pas de valeurs calculées — il produit des paramètres qui contraignent tous les calculs suivants. Ce sont des invariants du dossier, pas des inputs d'une Transformation spécifique. Fusionner CONTEXTE et CARACTÉRISATION obscurcirait ce rôle fondateur.

De plus, CONTEXTE est toujours le premier Assistant. Il n'a pas de prédécesseur. Il initialise le cadre d'interprétation dans lequel tous les autres opèrent. Cette propriété le distingue structurellement.

---

**Tentative de scission : COLLECTION OUVERTE → deux familles**

F-012 a deux modes : le scaffold (inventaire des catégories) et les micro-flux (qualification de chaque transaction). Faut-il les séparer en deux familles ?

**Verdict : rejet. Ce sont deux niveaux du même pattern, pas deux patterns distincts.**

Le scaffold existe précisément parce que la qualification individuelle est impossible sans structure préalable. Les deux niveaux sont co-dépendants. Les séparer créerait deux familles artificiellement liées.

---

**Tentative de scission : RÉCONCILIATION → RÉCONCILIATION et COLLECTE STRUCTURÉE**

F-013 bascule en mode COLLECTE STRUCTURÉE pour les utilisateurs de plateforme pure (pas d'ancrage disponible). Faut-il créer une famille séparée ?

**Verdict : rejet pour l'instant, à surveiller.**

La COLLECTE STRUCTURÉE de F-013 n'est pas suffisamment distincte de la COLLECTION OUVERTE de F-012 pour justifier une nouvelle famille. Les deux collectent des transactions sans ancrage de référence. La différence principale est que F-013 en mode plateforme collecte des flux homogènes (virements d'une même source), pas des transactions hétérogènes. C'est une variante, pas un nouveau pattern.

**Si deux nouveaux Assistants utilisent ce mode collecte homogène sans ancrage, reconsidérer.**

---

# Famille 1 — CONTEXTE

## Problème utilisateur résolu

L'utilisateur doit fournir au système les paramètres fondamentaux de sa situation — ceux qui ne changent pas au cours de l'exercice et qui conditionnent tous les traitements suivants.

## Principe de fonctionnement

```
Situation réelle (en langage courant)
    ↓ questions de diagnostic
Paramètres formels
    ↓ validation
Cadre d'interprétation du dossier
```

Il n'y a pas de calcul. Il n'y a pas d'ambiguïté sur la réponse — les faits sont objectifs. L'Assistant traduit, pas ne juge.

## Invariants UX

- L'utilisateur ne peut pas se tromper sur les faits — s'il se trompe, c'est un problème de question, pas de réponse.
- Aucune question ne doit supposer de connaissance fiscale préalable.
- L'output doit être confirmé explicitement — l'utilisateur doit comprendre ce que le système a retenu.
- La correction doit être possible à tout moment (ces paramètres servent de base à tout le dossier).

## Pièges de conception

**Piège 1 — Confondre CONTEXTE et CARACTÉRISATION.** Le CONTEXTE établit les paramètres invariants. Si une question produit une valeur calculée (prix de revient, base amortissable), on est en CARACTÉRISATION.

**Piège 2 — Demander des informations trop tôt.** Le CONTEXTE ne doit contenir que ce qui est nécessaire à l'initialisation du dossier — pas tout ce que le système voudrait savoir à terme.

**Piège 3 — Présenter des choix fiscaux sans les expliquer.** Si l'utilisateur doit choisir entre régime micro et régime réel, le CONTEXTE doit soit guider ce choix (c'est alors partiellement un ARBITRAGE), soit l'accueillir comme une donnée (il a déjà choisi).

## Assistants concernés

- F-009 Assistant Activité

---

# Famille 2 — CARACTÉRISATION

## Problème utilisateur résolu

L'utilisateur possède ou a fait quelque chose (acheté un bien, contracté un prêt). Il doit en donner une description suffisamment précise pour que le système puisse en calculer les conséquences fiscales.

## Principe de fonctionnement

```
Entité réelle (bien, prêt, véhicule…)
    ↓ description guidée
Description structurée (champs typés)
    ↓ Transformations
Valeurs fiscales dérivées (base amortissable, intérêts déductibles…)
```

L'entité a une structure connue à l'avance (le KS définit quels champs sont nécessaires). La cardinalité est finie. L'output est déterminé par les Transformations applicables à cette entité.

## Deux modes

**Mode Construction** (F-010) : la valeur fiscale n'existe dans aucun document — elle est construite à partir de plusieurs sources et jugements. L'Assistant assemble.

**Mode Extraction** (F-011) : la valeur fiscale existe déjà dans un document — elle doit être correctement identifiée et isolée. L'Assistant extrait.

## Invariants UX

- L'utilisateur ne doit jamais avoir à comprendre pourquoi une information est demandée en termes fiscaux. Il doit comprendre ce qu'on lui demande de décrire, pas pourquoi.
- Chaque question doit être directement au service d'une Transformation ou d'un Jugement identifié dans le KS.
- Une question sans Transformation cible n'a pas sa place dans un Assistant de CARACTÉRISATION.
- L'output (valeur dérivée) doit être présenté avec une explication en langage courant.

## Pièges de conception

**Piège 1 — Collecter plus que nécessaire.** Chaque champ collecté doit avoir une Transformation cible. Sans cible, le champ n'appartient pas à cet Assistant.

**Piège 2 — Ignorer les modes de CARACTÉRISATION.** En mode Extraction, le document est la source de vérité — l'utilisateur ne doit pas ressaisir ce que le document contient déjà. En mode Construction, l'absence de document ne bloque pas — l'Assistant reconstitue par questions.

**Piège 3 — Faire de la CARACTÉRISATION un formulaire.** L'Assistant guide une description. Ce n'est pas un formulaire à remplir de haut en bas. Le parcours doit s'adapter à ce que l'utilisateur sait et à ce qu'il apporte.

## Assistants concernés

- F-010 Assistant Logement (mode Construction)
- F-011 Assistant Financement (mode Extraction)

---

# Famille 3 — COLLECTION OUVERTE

## Problème utilisateur résolu

L'utilisateur a réalisé un ensemble d'opérations (dépenses, transactions) dont il ne connaît ni le nombre exact, ni la qualification fiscale. Il doit tout déclarer, et le système doit qualifier chaque élément.

## Principe de fonctionnement

```
Inventaire attendu (scaffold — catégories probables selon profil)
    ↓ pour chaque catégorie
Micro-flux de collecte et qualification
    ↓ agrégation
Total qualifié (déductible / à amortir / non déductible)
```

La cardinalité est inconnue. Il n'existe pas de référence pour valider la complétude — l'Assistant peut seulement vérifier que chaque catégorie attendue a été parcourue.

## Invariants UX

- Le scaffold doit être personnalisé (construit à partir du profil utilisateur) — présenter toutes les catégories à tous les utilisateurs est une erreur.
- Chaque transaction est traitée individuellement — il n'y a pas de qualification collective.
- La qualification doit être produite par le système, pas par l'utilisateur. L'utilisateur décrit la transaction en langage courant ; le système qualifie.
- Le parcours doit être interruptible et reprendre là où il s'est arrêté.
- Il n'existe pas de fin naturelle — l'Assistant doit poser explicitement la question de complétude.

## Pièges de conception

**Piège 1 — Confondre COLLECTION OUVERTE et CARACTÉRISATION.** CARACTÉRISATION a une structure connue et finie. COLLECTION OUVERTE a une cardinalité variable. Si on sait à l'avance combien d'éléments on va collecter, c'est probablement de la CARACTÉRISATION.

**Piège 2 — Ne pas construire le scaffold.** Présenter une liste ouverte sans structure préalable conduit à l'oubli systématique des catégories peu intuitives. Le scaffold est la protection contre l'incomplétude.

**Piège 3 — Vouloir garantir la complétude.** Un Assistant de COLLECTION OUVERTE ne peut pas savoir si la collection est complète. Il peut seulement s'assurer que toutes les catégories attendues ont été parcourues. Ne jamais promettre à l'utilisateur que tout a été pris en compte.

**Piège 4 — Traiter toutes les transactions de la même façon.** Certaines catégories (travaux, copropriété) ont des règles de qualification plus complexes que d'autres (assurance, frais de gestion). Le scaffold doit refléter cette hétérogénéité.

## Assistants concernés

- F-012 Assistant Charges

---

# Famille 4 — RÉCONCILIATION

## Problème utilisateur résolu

L'utilisateur a une estimation de la valeur à déclarer. Mais cette estimation peut être fausse — par ignorance des règles, par oubli de sources, ou par erreur de périmètre. Le système peut calculer indépendamment ce que la valeur devrait être.

## Principe de fonctionnement

```
Référence calculée indépendamment (ancrage système)
    ↓
Valeur déclarée par l'utilisateur
    ↓ confrontation
Écart mesuré et qualifié
    ↓ micro-flux d'explication ou correction
Total réconcilié (justifiable)
```

La propriété distinctive : **le système sait quelque chose que l'utilisateur ne sait pas encore qu'il devrait savoir**. La réconciliation permet de détecter des erreurs que l'utilisateur n'aurait pas signalées spontanément.

## Invariants UX

- L'ancrage doit être affiché à l'utilisateur avant qu'il déclare sa valeur. Il doit voir la référence du système, pas la construire lui-même.
- L'écart ne doit jamais être présenté comme une accusation — c'est une question, pas un jugement.
- Chaque écart doit avoir une explication possible proposée par le système — l'utilisateur ne doit pas avoir à deviner pourquoi il y a un écart.
- Si l'ancrage n'existe pas (le système ne peut pas calculer de référence), le pattern RÉCONCILIATION ne s'applique pas. Basculer en COLLECTION OUVERTE ou COLLECTE STRUCTURÉE.

## Pièges de conception

**Piège 1 — Présenter la référence sans l'expliquer.** L'utilisateur doit comprendre d'où vient le chiffre du système (bail × mois, par exemple). Une référence opaque crée de la méfiance.

**Piège 2 — Traiter un écart faible comme un écart majeur.** Un écart de 2% peut être un décalage de paiement normal. Un écart de 25% mérite une investigation. Le seuil de déclenchement de la confrontation est critique.

**Piège 3 — Confondre RÉCONCILIATION et vérification.** RÉCONCILIATION suppose que le système a une référence CALCULÉE, pas seulement une règle de cohérence. Si le système vérifie seulement "est-ce que ça semble plausible ?", c'est de la validation, pas de la réconciliation. Cette distinction conditionne tout le parcours.

**Piège 4 — Ignorer le cas sans ancrage.** Tous les types de situation ne permettent pas de calculer une référence (location saisonnière pure, par exemple). Tenter de réconcilier sans ancrage produit un Assistant qui prétend valider ce qu'il ne peut pas valider.

## Assistants concernés

- F-013 Assistant Revenus

---

# Famille 5 — CONCLUSION (anticipée)

## Statut

Cette famille n'a pas encore d'Assistant existant. Elle est anticipée sur la base de F-006 (Calcul fiscal) et F-014 (Amortissements).

## Problème utilisateur résolu

L'utilisateur a fourni toutes les informations nécessaires dans les Assistants précédents. Il vient maintenant chercher la conclusion que le système a produite à partir de ces connaissances validées — sans avoir à calculer, sans avoir à comprendre la mécanique. Son rôle est de comprendre ce résultat et de le valider.

## Principe de fonctionnement

```
Toutes les connaissances validées (contexte, entités, charges, revenus)
    ↓ Transformations et Raisonnements du KS
Décision métier calculée (résultat fiscal, plan d'amortissement…)
    ↓ présentation en langage courant
Utilisateur comprend et valide
```

**Direction inversée :** tous les autres Assistants vont de l'utilisateur vers le système. La CONCLUSION va du système vers l'utilisateur. L'utilisateur ne fournit plus rien — il reçoit une conclusion fondée sur tout ce qu'il a déjà fourni.

**Propriété distinctive :** le système agit en premier. L'utilisateur n'a pas de question à répondre avant de voir le résultat. Sa seule décision est : "est-ce que cette conclusion reflète ma situation ?"

## Invariants UX (anticipés)

- La conclusion doit être présentée en langage courant avant tout détail technique.
- Chaque composante doit être consultable — l'utilisateur peut demander "d'où vient ce chiffre ?"
- La correction d'un input amont doit être possible depuis cet écran — la conclusion se recalcule.
- L'utilisateur doit pouvoir valider globalement sans avoir tout compris dans le détail.
- La validation est un acte explicite — elle ne se fait pas par défaut.

## Pièges de conception

**Piège 1 — Présenter le résultat sans l'ancrer.** L'utilisateur doit comprendre que la conclusion vient de ses propres données, pas d'une boîte noire. La traçabilité vers les inputs validés est obligatoire.

**Piège 2 — Bloquer la présentation sur un input manquant.** Si un input secondaire est absent, présenter la conclusion avec une hypothèse conservatrice et signaler l'incertitude — ne pas bloquer.

**Piège 3 — Confondre CONCLUSION et RÉCONCILIATION.** En RÉCONCILIATION, le système a une référence indépendante et la confronte à la valeur de l'utilisateur. En CONCLUSION, l'utilisateur n'a pas de valeur à comparer — il attend entièrement le résultat du système.

## Assistants concernés (anticipés)

- F-006 Assistant Calcul fiscal
- F-014 Assistant Amortissements

---

# Observations en cours

Les éléments suivants ont été identifiés lors de la conception des premiers Assistants. Leur statut est délibérément indéterminé : ils pourraient être des familles d'Assistants à part entière, ou des comportements transversaux mobilisables dans plusieurs familles existantes.

La distinction est importante. Une **famille** résout un problème utilisateur autonome qui ne peut pas être traité par une famille existante. Un **comportement transversal** est une capacité du système (un Engine, un pattern UX) qui s'exprime à l'intérieur d'Assistants de familles connues.

Nous ne trancherons pas sans un cas réel.

---

## Observation A — EXPLICATION

**Signal détecté :** dans chaque Assistant conçu à ce jour, l'Explanation Engine est mobilisé ponctuellement pour justifier une règle, expliquer un retraitement, ou rassurer l'utilisateur sur un calcul. Ces moments d'explication sont toujours intégrés dans le flux d'un autre Assistant — ils ne constituent pas un problème utilisateur autonome.

**Hypothèse non confirmée :** après F-006 (Synthèse), l'utilisateur pourrait avoir besoin d'un espace dédié pour interroger son résultat fiscal. Ce serait un problème distinct, rétrospectif, qui ne s'insère dans aucune famille existante.

**Hypothèse concurrente :** l'explication est un comportement transversal de la SYNTHÈSE — la phase de présentation du résultat inclut naturellement la possibilité de l'interroger. Pas de nouvelle famille nécessaire.

**Ce que F-014 (Amortissements) permettra d'observer :** les Jugements de durée d'amortissement (SAV-005, SAV-006) nécessitent-ils une explication dédiée, ou sont-ils absorbés naturellement dans le flux CARACTÉRISATION ?

---

## Observation B — ARBITRAGE

**Signal détecté :** plusieurs Jugements (JUG-001 intégration vs déduction des frais, JUG-002 ventilation terrain/bâti, durées d'amortissement) impliquent un choix utilisateur avec des conséquences fiscales. Jusqu'ici, ces choix sont gérés à l'intérieur d'Assistants de CARACTÉRISATION ou de COLLECTION OUVERTE — ils n'ont pas exigé de famille séparée.

**Hypothèse non confirmée :** certains Jugements seront suffisamment complexes (conséquences significatives, alternatives multiples, simulation requise) pour justifier un espace de délibération autonome — un Assistant dont l'unique mission est de présenter un choix, le chiffrer, et recueillir une décision.

**Hypothèse concurrente :** l'arbitrage est un moment à l'intérieur d'un Assistant existant, pas un problème utilisateur à part entière. La CARACTÉRISATION de F-010 absorbe déjà JUG-001 et JUG-002 sans friction notable.

**Ce que F-014 (Amortissements) permettra d'observer :** le choix des durées d'amortissement par composant est-il suffisamment structurant pour exiger un flux dédié, ou s'intègre-t-il naturellement dans la CARACTÉRISATION du bien ?

---

**Règle de promotion :** un de ces éléments devient une famille à part entière si et seulement si un Assistant réel ne peut pas être conçu correctement dans une famille existante sans lui. Tant que ce cas n'est pas rencontré, ces observations restent ici — sans statut, sans artefact KS associé.

---

# Guide d'utilisation — Identifier la famille d'un nouvel Assistant

Face à un nouveau besoin utilisateur, répondre à ces quatre questions dans l'ordre :

**Q1 — Le système a-t-il une référence calculée indépendante avant que l'utilisateur parle ?**
→ Si oui → **RÉCONCILIATION**

**Q2 — L'utilisateur fournit-il tous les inputs ? Ou reçoit-il un résultat ?**
→ Si le système produit un résultat depuis des inputs déjà connus → **CONCLUSION**

**Q3 — Ce que l'utilisateur doit fournir a-t-il une cardinalité connue à l'avance ?**
→ Si oui (structure connue, champs définis) → **CARACTÉRISATION**
→ Si non (nombre d'items variable) → **COLLECTION OUVERTE**

**Q4 — S'agit-il du premier Assistant du dossier ? Produit-il des paramètres qui contraignent tous les suivants ?**
→ Si oui → **CONTEXTE**

**Si aucune question ne produit de réponse claire :** vérifier si la famille EXPLICATION ou ARBITRAGE correspond. Si non, décrire précisément en quoi ce problème est différent de toutes les familles existantes — c'est peut-être une nouvelle famille à documenter ici.

---

# Tableau de synthèse des invariants

| | CONTEXTE | CARACTÉRISATION | COLLECTION OUVERTE | RÉCONCILIATION | SYNTHÈSE |
|---|---|---|---|---|---|
| **Cardinalité** | Finie, connue | Finie, connue | Variable, inconnue | Finie, connue | Zéro (pas de collecte) |
| **Source de vérité** | Utilisateur | Documents + Jugements | Transactions + Documents | Système + Utilisateur | KS + Données validées |
| **Peut détecter une erreur** | Non | Partiellement | Non | Oui | Oui |
| **Direction principale** | U → S | U + Docs → S | U + Docs → S | S ↔ U | S → U |
| **Complétude garantissable** | Oui | Oui | Non | Oui | Oui |
| **Prérequis** | Aucun | CONTEXTE | CONTEXTE + CARACTÉRISATION | CONTEXTE + CARACTÉRISATION | Tous |
| **Verbe JTBD** | Établir | Décrire / Extraire | Qualifier | Vérifier | Obtenir |

*Colonne 5 = CONCLUSION (anciennement SYNTHÈSE — renommé v1.1 pour aligner le nom sur le problème utilisateur, pas sur l'opération système)*
