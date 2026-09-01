---
id: ADR-007
title: Métaphore d'interaction du Chapitre 2 — Le Conseiller présente, il ne navigue pas
type: adr
status: accepted
version: "1.0"
created: 2026-07-10
updated: 2026-07-10
owner: product-owner
niveau_gouvernance: 4 — Fondateur (GOUV-001)
tags: [adr, ux, design-interaction, dashboard, chapitre-2, conseiller]
revise: [DEC-034]
date_revisitation: 2026-10-10
---

# ADR-007 — Le Conseiller présente, il ne navigue pas

---

# Statut

🟢 **Acceptée.** Cette ADR **révise DEC-034** (la métaphore de la « roue de progression »). DEC-034 avait déjà correctement identifié l'intention (le produit désigne, l'utilisateur ne choisit pas) mais avait figé une exécution — la roue — qui s'est révélée, à l'examen, en contradiction avec cette intention même. La présente ADR conserve l'intention, remplace le mécanisme.

Conformément à GOUV-001, cette décision est classée **Niveau 4 — Fondateur** : elle fixe un principe qui gouvernera toute représentation future du Chapitre 2, quelle que soit sa forme graphique. Une date de revisitation est fixée au 2026-10-10, après un premier usage réel de l'implémentation qui en découlera.

---

# 1. Le problème

## 1.1 Ce qui a été observé

Depuis l'abandon du dashboard à sept cartes identiques (DEC-014), quatre représentations successives du Chapitre 2 ont été envisagées : cartes alignées, timeline, liste, roue de progression (DEC-034). Aucune n'a été jugée pleinement satisfaisante. Ce n'est pas un problème d'exécution graphique répété quatre fois — c'est le signal qu'une hypothèse commune aux quatre tentatives est fausse.

## 1.2 Le problème précis, pas le symptôme

Les quatre tentatives partageaient toutes la même hypothèse implicite : **le Chapitre 2 représente un enchaînement d'étapes** (dans quel ordre, avec quel statut). Une carte alignée est une étape dans une séquence. Une timeline est une séquence temporelle. Une liste est une séquence ordonnée. Une roue est une séquence circulaire. Change la forme, pas la nature.

Or ce que le produit a validé progressivement (DEC-029 : les étapes ne se déverrouillent plus par ordre strict ; l'audit du 10/07/2026 : une étape reportée peut redevenir prioritaire hors séquence) contredit cette hypothèse depuis plusieurs sessions sans qu'elle ait été nommée explicitement. Le Chapitre 2 ne représente pas un enchaînement — il représente **ce que le Conseiller juge important maintenant**, un jugement qui peut porter sur n'importe quel sujet du dossier, dans n'importe quel ordre.

La roue (DEC-034) a rendu ce problème visible plutôt que de le résoudre : sa nature physique impose l'adjacence (elle tourne d'un cran), alors que le jugement du Conseiller n'a pas de notion de cran.

## 1.3 Pourquoi ce n'est pas un problème de composant

Les cartes elles-mêmes ne sont pas en cause. Elles restent le langage commun de Fiscal AI (Language System — Workspace Card), elles portent déjà toute l'information métier nécessaire (statut, corrections, validation, complétude). Le problème n'a jamais été « comment dessiner la carte » — c'est « quelle relation spatiale les cartes entretiennent entre elles ». Une hypothèse de séquence produit toujours, in fine, une forme de menu ou de chemin, quelle que soit la sophistication visuelle appliquée par-dessus.

---

# 2. Options envisagées

Dix métaphores ont été explorées (séance du 10/07/2026), jugées contre un critère unique : *le mouvement raconte-t-il une décision du Conseiller, ou un mécanisme ?*

## Option A — La roue / l'orbite (DEC-034, existante)

**Avantages :** rotation perçue comme un travail en cours ; recentrage automatique cohérent avec « le produit désigne ».
**Inconvénients :** mécanisme séquentiel par nature — un retour non adjacent (étape reportée redevenant prioritaire) y est soit un recul de plusieurs crans (lu comme une anomalie), soit une téléportation (lu comme un bug). Contredit directement DEC-029, qu'elle est censée servir.
**Rejetée** : contradiction structurelle avec le modèle fonctionnel déjà validé, pas un défaut d'exécution.

## Option B — Le centre de gravité (pur)

**Avantages :** la métaphore la plus fidèle au principe — une masse, pas un choix, détermine ce qui est central ; aucune notion d'adjacence, donc aucun conflit avec les retours non adjacents.
**Inconvénients :** sans incarnation concrète, l'imagerie disponible (orbites, espace) est froide et technologique — en rupture avec l'univers chaud (papier, crème, orange) déjà validé (Color Philosophy).
**Retenue comme principe sous-jacent, rejetée comme représentation visuelle autonome.**

## Option C — La pile qui se réorganise

**Rejetée** : une pile évoque l'accumulation et le retard, contraire à l'objectif d'apaisement (Ataraxia, DEC-009).

## Option D — La rivière

**Rejetée** : irréversible par construction (le courant ne remonte jamais), donc structurellement incapable de représenter un retour non adjacent — même défaut que la roue, aggravé.

## Option E — Le mobile suspendu

**Rejetée** : décoratif plutôt que fonctionnel ; aucune convention de lecture pour « qu'est-ce qui est prioritaire » dans un mobile en équilibre.

## Option F — La constellation

**Rejetée** : froide, nocturne ; une étoile qui brille invite l'utilisateur à aller vers elle — contredit le principe « le produit apporte, l'utilisateur ne cherche pas ».

## Option G — La marée / la respiration

**Rejetée** : mouvement périodique et indifférent, qui ne décide rien — un mécanisme au sens du critère, seulement plus lent.

## Option H — Le pupitre (focus unique sans trace du passé)

**Inconvénients :** perd toute réassurance de progression accomplie ; tout filet de sécurité pour les étapes reportées reposerait sur la seule mémoire du Conseiller, sans trace visible.
**Rejetée** comme représentation exclusive ; le principe de non-exposition retenu en partie (voir Décision).

## Option I — La lentille / mise au point (focus pull)

**Inconvénients :** excellente transition, mais invisible en tant qu'identité — ne se raconte pas (« c'est celui où… c'est flou ? »).
**Rejetée** comme métaphore autonome, retenue comme possible grammaire de transition subordonnée (hors périmètre de cette ADR).

## Option J — La table du Conseiller

**Avantages :** incarne littéralement la phrase fondatrice du produit (« voici ce qui mérite votre attention maintenant ») dans un geste universellement reconnu ; le retour non adjacent y est natif (un conseiller ressort un dossier du bord de la table aussi naturellement que le suivant) ; le nombre total de sujets n'est jamais exposé (ce qui repose au bord est indistinct par nature) ; aucun SaaS cité en référence (Asana, Notion, Linear, Monday, ClickUp) ne peut reprendre cette grammaire sans changer de philosophie — leur logique repose sur l'auto-organisation de l'utilisateur, celle-ci sur un service rendu.
**Inconvénients :** risque réel de skeuomorphisme si l'exécution graphique littéralise le décor (bois, ombres réalistes) plutôt que de rester une grammaire de gestes.
**Retenue comme piste de représentation la plus prometteuse — non figée définitivement par cette ADR (voir Hors périmètre).**

---

# 3. Décision

**Le Chapitre 2 abandonne définitivement toute logique de dashboard, workflow, timeline, checklist ou menu de modules.**

## Ce que représente la carte centrale

Elle ne représente plus « l'étape suivante ». Elle représente **le sujet que le Conseiller décide de poser devant l'utilisateur maintenant**. Les autres sujets du dossier ne sont plus une liste — ce sont les autres sujets, présents, au repos.

## Les gestes fondamentaux

Le mouvement du Chapitre 2 ne doit jamais donner l'impression de tourner, glisser (slider) ou constituer un carrousel. Les seuls gestes autorisés sont :

- **présenter** — un sujet vient occuper le centre de l'attention ;
- **rapprocher** — un sujet dont l'importance augmente se rapproche du centre ;
- **retirer** — un sujet traité quitte le centre ;
- **ranger** — un sujet retiré rejoint les sujets au repos, sans disparaître ;
- **rappeler** — un sujet au repos peut revenir au centre, depuis n'importe quelle position, sans notion de distance à parcourir.

Ce sont les gestes d'un conseiller. Jamais ceux d'un composant d'interface.

## Ce qui ne change pas

Les cartes du Design System restent le langage commun de Fiscal AI — leur contenu (icône, statut, titre, corrections, validation) n'est pas remis en cause par cette ADR. Seule la relation spatiale qu'elles entretiennent entre elles change.

## Ce qui reste ouvert (volontairement)

La représentation visuelle exacte — cercle, table, ou toute autre forme — **n'est pas figée par cette ADR**. Le principe (ci-dessus) est de Niveau 4 et s'applique à toute forme retenue. Le choix de la forme est une décision de niveau inférieur (Structural ou Fonctionnel, GOUV-001), à trancher lors du sprint qui produira la première implémentation.

La piste « table du Conseiller » (Option J), synthétisée avec le principe de gravité (Option B) — un sujet plus « lourd » se rapproche du centre par lui-même, sans geste explicite de l'utilisateur — est documentée ici comme la plus prometteuse identifiée à ce jour. Ce n'est pas un choix de représentation entériné ; c'est une recommandation motivée, à confirmer explicitement avant toute implémentation.

---

# 4. Revue adversariale

*Posture : Design Director, mandat explicite de trouver les raisons de rejeter cette décision plutôt que de la conforter.*

**Attaque 1 — « Cinq gestes nommés (présenter/rapprocher/retirer/ranger/rappeler) sans spécification de leurs déclencheurs exacts, c'est une ADR incomplète, pas une décision. »**
Recevable en partie : cette ADR fixe le vocabulaire et l'interdit, pas la mécanique précise de chaque geste (durée, easing, déclencheur exact). C'est volontaire — GOUV-001 distingue le principe (Niveau 4, ici) de son implémentation (Niveau 2/3, sprint suivant). Le risque résiduel est qu'une implémentation future viole l'esprit du vocabulaire sans violer sa lettre (ex. un « rapprochement » animé de façon si rapide et symétrique qu'il redevient perceptible comme une rotation). Ce risque n'est pas éliminé par cette ADR ; il doit être vérifié explicitement au moment de l'implémentation, pas supposé résolu ici.

**Attaque 2 — « La distinction entre "rapprocher" et "un carrousel qui avance d'un cran" est purement verbale si l'exécution finale produit visuellement la même chose. »**
Non réfutée entièrement. C'est la limite la plus sérieuse de cette ADR : le principe est défini par l'intention du mouvement (une décision vs. un mécanisme), pas par une propriété visuelle vérifiable automatiquement. Deux implémentations peuvent produire des pixels quasi identiques tout en étant l'une conforme, l'autre non, selon ce qui les déclenche. Cette ADR ne peut pas éliminer ce risque par construction — seule une revue de l'implémentation réelle, au sprint suivant, pourra trancher si le résultat est fidèle à l'intention.

**Attaque 3 — « Garder la forme ouverte revient à ne rien décider. »**
Rejetée. Le précédent de DEC-034 démontre l'inverse : figer une forme (la roue) avant que le principe ne soit stable a produit une contradiction découverte tardivement, après un audit complet. Fixer le principe d'abord, la forme ensuite, est la séquence qui a le mieux fonctionné dans ce projet jusqu'ici (cf. UXP-004, où la philosophie a toujours précédé l'écran).

**Issue de la revue :** aucune faille fatale identifiée. Un tradeoff explicite subsiste (Attaque 2) et doit être surveillé, pas résolu par cette ADR elle-même.

---

# 5. Pré-mortem

*Hypothèse : cette décision a été implémentée, six mois ont passé, elle a échoué. Pourquoi ?*

**Cause la plus probable identifiée :** l'équipe technique, sous pression de sprint, construit la première version avec la bibliothèque ou le pattern le plus rapide à disposition — souvent un composant de type carrousel existant, réutilisé « juste pour cette fois », en promettant de le remplacer plus tard. Le remplacement n'a jamais lieu. Six mois plus tard, Fiscal AI a, dans les faits, un carrousel avec un habillage différent — exactement ce que cette ADR interdit, réintroduit par la voie de la dette technique plutôt que par une décision produit assumée.

**Mitigation documentée :** le prompt d'implémentation qui suivra cette ADR doit interdire explicitement le réemploi d'un composant carrousel générique, même temporairement, et le rappeler comme condition de recette du sprint — pas comme une préférence.

---

# 6. Conséquences

## Conséquences positives

- Le Chapitre 2 cesse d'hériter, par défaut, du vocabulaire de tous les logiciels de gestion (dashboard, workflow, checklist) — c'est la première décision qui l'affirme au niveau du principe, pas seulement de l'exécution.
- Le retour non adjacent (étape reportée redevenant prioritaire), qui a fait échouer deux métaphores successives (chemin horizontal, roue), devient un cas natif plutôt qu'une exception à gérer.
- Les cartes existantes du Design System restent réutilisables telles quelles — aucune perte de l'investissement déjà fait sur leur contenu.

## Prérequis avant implémentation

- Confirmation explicite du Product Owner sur la forme visuelle retenue (table, ou autre) avant tout prompt d'implémentation détaillé.
- Spécification précise des déclencheurs de chacun des cinq gestes (quand « rapprocher » se déclenche-t-il exactement, avec quelle temporalité) — non traitée par cette ADR.

## Hors périmètre — explicitement non traité par cette ADR

- La forme visuelle définitive (voir Décision, « ce qui reste ouvert »).
- Le traitement du Chapitre 3 (Coffre-fort) — cette ADR ne porte que sur le Chapitre 2.
- La mécanique exacte d'animation (easing, durée, bibliothèque technique) — sujet d'implémentation, pas de principe.

---

# 7. Vérification de cohérence

## Avec DEC-029

Pleinement cohérente — DEC-029 avait déjà posé qu'une étape découverte reste accessible et que le Chapitre 2 « raconte l'état réel, ne décide plus de la priorité ». Cette ADR precise *comment* cet état est raconté (gestes du Conseiller, pas séquence), sans rouvrir DEC-029 elle-même.

## Avec DEC-034

Révisée. DEC-034 reste dans le registre des décisions comme trace historique (GOUV-001, IV — « un ADR est un artefact historique immuable » ; par extension, une DEC révisée n'est pas supprimée, elle est annotée). Son intention (le produit désigne) est intégralement reprise ; son mécanisme (la rotation) est abandonné.

## Avec Article VII — Design et UXP-004

Les deux documents doivent être mis à jour pour retirer la description spécifique de la roue et la remplacer par le principe de cette ADR, en conservant leur propre niveau d'abstraction (intention, pas spécification) — mise à jour effectuée en même temps que cette ADR.

## Avec Language System

La ligne « Timeline » de la table des composants validés devient obsolète dans son nom même (« Timeline » présuppose une séquence temporelle, contraire au principe retenu ici). Elle doit être renommée ou marquée en révision plutôt que laissée telle quelle — mise à jour effectuée en même temps que cette ADR.

---

# Conclusion

Cette ADR ne remplace pas une mauvaise idée par une meilleure — elle corrige une erreur de niveau : DEC-034 avait tranché une forme (la roue) alors que le problème réel se situait au niveau du principe (la nature séquentielle de toutes les métaphores essayées jusque-là). En figeant le principe — le mouvement raconte un jugement, jamais un mécanisme — avant la forme, cette ADR évite de répéter, une cinquième fois, l'erreur qui a coûté quatre tentatives.
