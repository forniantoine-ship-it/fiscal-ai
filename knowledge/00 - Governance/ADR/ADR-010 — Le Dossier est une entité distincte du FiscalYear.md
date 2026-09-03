---
id: ADR-010
title: Le Dossier est une entité distincte du FiscalYear
type: adr
status: accepted
version: "1.0"
created: 2026-09-03
updated: 2026-09-03
owner: product-owner
tags: [adr, dossier, fiscal-year, domaine, meta-model-fondation, architecture]
triggers: [P2-54c7070, AUDIT-SOCLE-P0]
---

# ADR-010 — Le Dossier est une entité distincte du FiscalYear

---

# Statut

🟢 **Décision validée par le Product Owner** — 2026-09-03, à l'issue d'un audit
décisionnel read-only (P0 — reprise du socle architectural après P2). Aucune
modification du code n'est effectuée par cette ADR. Cette décision verrouille
un choix conceptuel ; elle n'implémente rien.

---

# 1. Le problème

`ENT-002 — Dossier` décrit depuis sa création le Dossier comme l'entité
racine de Fiscal AI : *"Toutes les autres entités gravitent autour de lui."*
Le runtime actuel ne porte pas cette entité. `src/lib/lmnp/types/domain.ts`
ne contient aucun type `Dossier` ; `DossierStatus` est une simple vue dérivée
de `FiscalYear.status` (`dossier-status.ts`, qui documente lui-même cette
confusion comme un raccourci de construction, pas comme une décision
assumée). Toute donnée métier (Bien, Documents, Calculs, Déclaration) est
aujourd'hui rattachée à un `fiscalYearId`, jamais à un identifiant de
dossier — parce que cet identifiant n'existe pas.

Concrètement, un utilisateur ne peut avoir qu'un seul `FiscalYear` actif à
la fois : la clé de stockage (`workspaceKeyForUser(userId)`) ne dépend que
de l'utilisateur. L'action la plus proche d'un "nouvel exercice"
(`CREATE_NEW_DECLARATION`) ne crée pas un second `FiscalYear` à côté du
premier — elle détruit et recrée l'intégralité de l'espace de travail.

Cette confusion contredit directement une intention produit déjà actée dans
la Constitution (`05 - La Relation.md`) : *"Le produit accompagne plusieurs
années [...] à l'échelle de plusieurs années de vie du dossier."* Aucune des
capacités suivantes, toutes déjà présentes dans la roadmap produit
(F-101 Multi-biens, F-105 Déclarations des années précédentes, PROF-002 Le
Vétéran Organisé), n'est représentable tant que `FiscalYear` reste racine :
dossier multi-années, reprise d'un dossier historique, réouverture d'un
exercice antérieur avec distinction identité/exercice/version.

# 2. Options envisagées

## Option A — `Dossier` distinct de `FiscalYear`

`Dossier` devient l'entité racine (identité stable, Bien(s), documents à
portée dossier, historique transversal) ; `FiscalYear` devient un enfant du
Dossier, un par exercice.

**Avantages :** seule option représentant nativement le multi-années, la
reprise de dossier, la réouverture avec distinction identité/exercice/
version, et le rattachement correct du Bien et de l'identité INPI/exploitant
(stables, pas annuels). Aligne enfin le runtime sur ENT-002, déjà écrit et
verrouillé depuis l'origine du Knowledge System. Ne touche aucun moteur de
calcul (F-006 à F-014 restent mono-exercice en entrée).

**Inconvénients :** nécessite, dans une étape ultérieure distincte, de
redéfinir la clé de persistance et de faire remonter `properties` /
l'identité exploitant du niveau `FiscalYear` vers le niveau `Dossier`.

## Option B — `FiscalYear` reste la racine

**Avantages :** aucun changement, coût immédiat nul.

**Inconvénients :** aucune des capacités ci-dessus n'est atteignable sans,
tôt ou tard, réintroduire un objet qui *sera* un Dossier sous un autre nom —
à un coût strictement supérieur (dette accumulée + données réelles
d'utilisateurs à migrer a posteriori) à celui de trancher maintenant, avant
la première feature structurante construite sur ce socle.

**Raison du rejet :** cette option ne résout aucun des besoins produit déjà
documentés, elle ne fait que reporter, à coût croissant, une décision déjà
implicitement prise par ENT-002.

# 3. Décision

**`Dossier` et `FiscalYear` sont deux objets conceptuellement distincts.**

- **`Dossier`** = identité et continuité du dossier métier dans le temps.
- **`FiscalYear`** = périmètre d'un exercice fiscal donné.

Relation conceptuelle :

```
Dossier 1 ─── N FiscalYear
```

## Responsabilités (conceptuel — aucun type créé par cette ADR)

**Dossier porte :**
- l'identité stable ;
- les données stables du dossier ;
- le(s) Bien(s) ;
- les documents à portée dossier ;
- la continuité inter-exercices ;
- l'historique transversal du dossier.

**FiscalYear porte :**
- l'année fiscale et le statut de l'exercice ;
- les données fiscales propres à cet exercice ;
- les calculs, résultats, la déclaration de cet exercice ;
- les documents propres à cet exercice (avis d'imposition N, quittances de
  l'année).

Le modèle actuel du runtime (`workspace → FiscalYear` unique) est reconnu
comme **état historique de construction**, pas comme architecture cible.

# 4. Ce que cette décision NE décide PAS

Explicitement hors périmètre, à traiter par des décisions ultérieures
distinctes :

- le multi-biens effectif (roadmap F-101) ;
- l'import de données historiques externes (roadmap F-105, PROF-002) ;
- l'agrégat Client → plusieurs Dossiers (déjà noté hors périmètre par
  ADR-006 §5) ;
- le mécanisme technique de report automatique (déficits, amortissements)
  entre exercices ;
- le versioning technique du contenu d'un Dossier/FiscalYear ;
- le modèle définitif de l'objet `History` ;
- la clé exacte de persistance (IndexedDB ou autre) ;
- la stratégie de migration des workspaces existants ;
- la structure exacte du futur Meta Model KM-001.

# 5. Compatibilité avec l'existant

- Le runtime actuel est mono-`FiscalYear` par utilisateur (persistance
  IndexedDB, clé `user:<userId>`, un seul enregistrement possible).
- `Dossier` n'existe pas encore comme entité runtime.
- Cette divergence entre le modèle cible (section 3) et le runtime actuel
  est connue, documentée ici, et **assumée** — pas une anomalie à corriger
  dans l'urgence.
- **Aucune correction technique n'est demandée ni attendue à la suite de
  cette ADR.** F-006 à F-014 ne sont pas concernés.

# 6. Conséquence pour les conceptions futures

Toute nouvelle conception structurante ne doit plus prendre `FiscalYear`
comme synonyme implicite de `Dossier`. Si une future Feature nécessite une
donnée stable inter-exercices (identité exploitant, Bien, document
pluriannuel), elle doit être analysée comme une donnée potentiellement
portée par `Dossier` — **même si le runtime actuel ne possède pas encore cet
objet** — plutôt que d'être ajoutée par défaut à `FiscalYear` par facilité,
reproduisant la confusion que cette ADR referme.

# 7. Vérification de cohérence avec les documents existants

## ENT-002 — Dossier

Pleinement cohérent — cette ADR ne fait que confirmer et dater formellement
ce qu'ENT-002 énonce depuis l'origine (*"Toutes les autres entités gravitent
autour de lui"*). Aucune contradiction.

## STATE-001 — Cycle de vie d'un dossier

Cohérent sur le fond (le cycle qu'il décrit reste celui d'un `FiscalYear` au
sens de cette ADR, pas d'un `Dossier` au sens large). Une incohérence
**préexistante et indépendante de cette ADR** est signalée pour mémoire :
ENT-002 décrit un cycle de vie se terminant par "Terminé → Archivé", tandis
que STATE-001 (plus récent) s'arrête à `DOSSIER_TERMINE`, sans état
"Archivé". Cette divergence n'est pas résolue ici — elle est antérieure et
hors périmètre de la présente décision.

## FIELD-041 — Exercice fiscal

Tension réelle à noter : FIELD-041 rattache aujourd'hui l'Exercice fiscal à
l'entité **Dossier** (`# Entité — Dossier`). Au sens de cette ADR, ce champ
devrait conceptuellement être porté par `FiscalYear` (`year`), pas par
`Dossier` lui-même. Cette ADR ne modifie pas FIELD-041 ; le sujet est
identifié comme correction documentaire de suivi (section 8 ci-dessous).

## F-013 — Assistant Revenus

Compatible. La règle *"F-013 est mono-exercice [...] chaque exercice fera
l'objet d'un dossier distinct"* reste valide en tant que règle
d'**exécution** de l'assistant (un F-013 traite un FiscalYear à la fois) —
elle ne préjuge pas de l'existence ou non d'un Dossier commun englobant ces
exercices, qui est précisément l'objet de la présente ADR.

# 8. Suivi documentaire proposé (non exécuté par cette ADR)

Un correctif minimal et ciblé de FIELD-041 (déplacer son rattachement de
`Dossier` vers `FiscalYear`) découle logiquement de cette décision, mais
n'est pas appliqué ici conformément au périmètre strict demandé pour cette
étape. À traiter dans une passe documentaire dédiée, après validation de
cette ADR.

---

# Conclusion

Cette ADR ne construit rien : elle nomme et verrouille une distinction que
le Knowledge System portait déjà implicitement (ENT-002) et que le runtime
avait, par raccourci de construction, laissé s'effondrer en une seule
entité. Elle fixe le point de départ conceptuel commun aux quatre décisions
qui en dépendent — modèle multi-années, Contracts Runtime↔Persistence↔RFS,
remise à niveau d'Engineering, et futur KM-001 — sans trancher aucune
d'entre elles.
