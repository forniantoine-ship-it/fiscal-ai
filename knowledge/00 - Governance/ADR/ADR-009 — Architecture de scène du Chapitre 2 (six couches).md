---
id: ADR-009
title: Architecture de scène du Chapitre 2 — six couches indépendantes
type: adr
status: accepted
version: "2.0"
created: 2026-07-10
updated: 2026-07-10
owner: product-owner
niveau_gouvernance: 3 — Structural (GOUV-001)
tags: [adr, architecture, scene-engine, composition-strategy, lighting-system, motion-engine, advisor-director, chapitre-2]
etend: [ADR-007]
depends_on: [DEC-012, DEC-028, DEC-029, DEC-036, DEC-037]
---

# ADR-009 — Architecture de scène du Chapitre 2

---

# Statut

🟢 **Acceptée, v2.0.** Cette ADR n'amende aucun principe constitutionnel — elle exécute ADR-007 (Niveau 4, qui a fixé les cinq gestes et interdit toute logique de carrousel) en lui donnant une architecture technique concrète. Classée Niveau 3 — Structural : elle engage plusieurs composants futurs et mérite une trace explicite, sans rouvrir un débat déjà tranché au niveau constitutionnel.

Une image de référence a été validée en séance comme **North Star émotionnelle, spatiale et narrative** du Chapitre 2 — jamais comme spécification pixel par pixel. Cette image a fait l'objet d'un audit avant d'être retenue comme telle (section 3).

**v2.0 (2026-07-10)** — Toutes les conditions posées par la v1.0 sont validées par le Product Owner (renommage Advisor Director, source unique de vérité métier, cartes passives, séparation ombre métier / profondeur spatiale, composition non purement indexée, suppression des cadenas et du compteur, préférence pour l'opacité/saturation/luminosité/contraste plutôt que le flou). Une sixième couche, le **Lighting System**, est ajoutée pour isoler l'atmosphère (lumière, chaleur, halo, disparition) de la géométrie (position) — voir section 2 et section 4bis.

---

# 1. Le problème

Le Chapitre 2 cesse d'être pensé comme une liste d'étapes pour devenir une scène : des sujets que le Conseiller rapproche, présente, retire, range ou rappelle (ADR-007). Cette intention a besoin d'une architecture qui garantisse deux choses simultanément :

- que la disposition spatiale (composition), l'animation (mouvement) et la décision (quel sujet est prioritaire) restent strictement indépendantes, pour pouvoir faire évoluer chacune sans toucher aux autres ;
- que cette indépendance ne recrée pas, par un autre chemin, les défauts déjà corrigés ailleurs dans le produit — en particulier la duplication de calcul déjà interdite par DEC-028.

---

# 2. Décision — six couches

```
Business Workflow  — source unique de la classification métier (DEC-028)
   ↓
Advisor Director   — quoi présenter, et par quel geste (jamais de calcul métier)
   ↓
Scene Engine       — orchestration : détient l'état de la scène, appelle
                      Composition puis Lighting, assemble leurs résultats
   ↓
Composition Strategy — géométrie pure : x, y, z-index, échelle, rotation
   ↓
Lighting System     — atmosphère : opacité, saturation, luminosité, contraste,
                      halo, flou seulement si nécessaire (valeurs statiques)
   ↓
Motion Engine       — transition entre deux états (géométrie + atmosphère),
                      selon l'un des cinq gestes
   ↓
Card Renderer       — dessine ce qu'il reçoit, ne décide rien
```

Le schéma ci-dessus communique l'ordre des préoccupations, pas une chaîne de montage littérale : le Scene Engine n'est pas un maillon qui transforme une donnée pour la passer au suivant, c'est un **orchestrateur** qui appelle Composition Strategy et Lighting System comme deux fonctions pures indépendantes, puis assemble leurs résultats — ni l'une ni l'autre ne s'appellent entre elles.

## Advisor Director *(validé, renommé — voir section 4)*

Le metteur en scène : décide quel sujet devient actif, lequel est rappelé, lequel est rangé, et par quel geste. Produit des intentions, jamais de positions ni d'atmosphère.

**Condition non négociable, validée :** l'Advisor Director reçoit des sujets **déjà classifiés** par la logique métier réelle (aujourd'hui simulée dans le laboratoire, demain dérivée de `resolveDashboardWorkflow`). Il ne calcule jamais lui-même si un sujet est terminé, reporté ou encore silencieux — cette classification reste une source unique, en amont, conformément à DEC-028. Il décide seulement *qui, parmi les sujets déjà classifiés, devient actif maintenant et par quel geste*.

## Scene Engine

Détient l'état courant de la scène (combien de sujets, lequel est actif, leur classification) et orchestre les couches suivantes. Ne calcule lui-même ni géométrie ni atmosphère — il délègue aux deux couches spécialisées ci-dessous et assemble leurs sorties pour le Motion Engine.

## Composition Strategy

Calcule uniquement la **géométrie** : position, échelle, rotation, ordre d'empilement. Jamais l'opacité, jamais le flou, jamais une propriété qui relève de la lumière — ces propriétés appartiennent désormais exclusivement au Lighting System (correction apportée par l'audit du 10/07, validée). Interchangeable par construction — ellipse aujourd'hui, éventail, profondeur, ou disposition de bureau demain ; changer de composition ne doit jamais affecter les cartes, les animations, ni la logique métier.

**Condition validée :** pour produire une disposition organique, la Composition Strategy accepte, en plus du rang d'un sujet, une valeur stable propre à ce sujet (sa « personnalité spatiale ») — jamais un nombre aléatoire tiré à chaque rendu, qui ferait sauter les cartes d'une image à l'autre.

## Lighting System *(nouvelle couche, 10/07/2026)*

Décide uniquement de l'atmosphère : lumière principale, lumière secondaire, intensité, chaleur, contraste, vignettage éventuel, pénombre, halo, focus visuel, profondeur lumineuse. Reçoit la géométrie calculée par la Composition Strategy (en particulier la distance ou le rang par rapport au sujet actif) et en dérive des valeurs statiques d'atmosphère. Jamais le mouvement, jamais la position, jamais le métier.

**Deux bornes précisées par l'audit, pour éviter qu'il ne duplique une autre couche :**
- Il ne produit que des **valeurs cibles statiques** pour un état donné — jamais une transition dans le temps. Une « disparition progressive » n'est pas calculée ici : le Lighting System donne la valeur de départ et la valeur d'arrivée, c'est le Motion Engine qui anime le passage de l'une à l'autre.
- Il ne recalcule jamais une ombre finale : il produit une intensité de profondeur lumineuse, que la carte combine avec l'ombre déjà déterminée par son statut (Design System existant) — la même règle que celle validée pour l'ombre au tour précédent, désormais portée par cette couche plutôt que par le Scene Engine.

Le Lighting raconte l'attention du Conseiller. La Composition raconte où sont les objets. Le Motion raconte comment ils évoluent.

## Motion Engine

Ne connaît que cinq gestes : présenter, rapprocher, retirer, ranger, rappeler (ADR-007, inchangés). Anime la transition entre l'état géométrique et lumineux précédent et le suivant. Aucun autre verbe, aucune animation décorative. Le mouvement raconte ce que pense le Conseiller, jamais ce que fait React.

## Card Renderer *(anciennement Card Component)*

Reçoit uniquement `transform`, `depth`, `lighting`, `motion` déjà calculés ; ne connaît jamais sa position, sa profondeur, sa taille, sa rotation, ni son atmosphère. Ne fait que se dessiner.

**Réserve maintenue par l'audit, à lever avant toute intégration réelle :** le composant carte métier actuel (`WorkflowStepCard`) contient aujourd'hui sa propre logique de navigation (`<Link href={href}>` interne). Une carte qui décide elle-même où elle mène n'est pas totalement passive. Avant toute intégration au-delà du laboratoire, ce composant devra être scindé entre son apparence (réutilisable telle quelle) et sa navigation (à faire porter par un geste de l'Advisor Director, jamais par un lien propre à la carte).

---

# 3. La référence visuelle — ce qu'elle valide, ce qu'elle ne valide pas

L'image validée en séance devient la référence émotionnelle, spatiale et narrative du Chapitre 2. Elle valide : une carte centrale dominante, une hiérarchie de profondeur, une sensation d'espace vivant plutôt que mécanique.

**Elle ne valide pas, et ne doit jamais être reproduite avec :**

- des flèches de navigation manuelle gauche/droite (contredit ADR-007 et DEC-026/029 : le produit désigne, l'utilisateur ne choisit pas) ;
- des icônes de cadenas sur les sujets non atteints (contredit DEC-029 explicitement) ;
- un compteur du type "Étape X sur Y" ou toute exposition de la taille totale du parcours (contredit le principe de non-exposition posé lors de l'audit du 10/07/2026) ;
- plusieurs systèmes de progression simultanés (cartes + barre + texte) — la scène doit devenir l'unique porteur de cette information, pas s'ajouter aux systèmes existants.

Six améliorations sont retenues par rapport à la maquette de référence, actées en séance : suppression du sentiment de carrousel, suppression des flèches, réduction de la symétrie (composition organique, voir section 2), accentuation de la profondeur par disparition progressive dans la lumière (flou + désaturation, jamais un simple gris), présentation sobre et jamais brutale de la carte centrale (décélération, jamais un effet spectaculaire), réduction de la redondance des indicateurs de progression — cette dernière incluant explicitement la suppression du compteur numérique et des cadenas, au-delà de la formulation initiale.

---

# 4. Le nom — tranché

**"Advisor Director" est validé par le Product Owner** (10/07/2026), en remplacement d'"Advisor Engine" — le terme "Engine" reste exclusivement réservé aux moteurs métier du Knowledge System (04 - Engineering/Engines/, ENG-001 à ENG-009, gouvernés par ENGINE_INTERACTION_STANDARDS et KS-CTR). Son rôle est exclusivement la mise en scène ; jamais de logique métier.

"Scene Engine", "Composition Strategy", "Lighting System" et "Motion Engine" ne posent pas de risque de collision comparable et conservent leur nom.

---

# 5. Revue adversariale

*Posture : Principal AI Architect, mandat de trouver les raisons de rejeter cette architecture.*

**Attaque 1 — "Cinq couches pour une seule scène, c'est une architecture disproportionnée pour ce que ça produit."**
Non retenue. Le laboratoire déjà construit démontre le contraire : une version à quatre couches proches de celle-ci a été livrée sans friction majeure, et c'est précisément l'absence de séparation qui a coûté deux tentatives ratées (le chemin horizontal, la roue) avant ce sprint. La complexité n'est pas gratuite, elle répond à un historique documenté.

**Attaque 2 — "La distinction Scene Engine / Composition Engine est artificielle : dans les faits, une seule fonction calcule tout."**
Partiellement fondée si l'implémentation les fusionne en pratique. C'est un risque d'exécution à surveiller au moment du code, pas une faille de l'architecture elle-même — le laboratoire montre que la séparation est faisable proprement (`CompositionStrategy` est déjà une fonction pure et interchangeable, indépendante du reste).

**Attaque 3 — "La classification métier (terminé/reporté/silencieux) n'a nulle part où vivre clairement dans ce schéma tant qu'elle reste simulée."**
Fondée, et déjà intégrée à la décision (section 2, Advisor Director) : cette couche reçoit une classification déjà faite, elle ne la produit jamais. Tant que le vrai moteur métier n'est pas branché, cette classification reste simulée dans le laboratoire — c'est assumé, pas un défaut caché.

**Issue de la revue :** aucune faille fatale. Les points 2 et 3 restent des vigilances d'implémentation, documentées pour ne pas être découvertes en cours de développement.

## Revue adversariale — v2.0 (ajout du Lighting System)

**Attaque 4 — "Le Lighting System duplique ce que la Composition calculait déjà (opacité, flou)."**
Fondée dans la proposition initiale, corrigée par cette révision : l'opacité et le flou sont retirés du périmètre de la Composition Strategy (géométrie pure) et deviennent la responsabilité exclusive du Lighting System (section 2). Sans cette correction, l'attaque aurait été fatale.

**Attaque 5 — "Une disparition progressive est une animation ; si le Lighting System la porte, il duplique le Motion Engine."**
Fondée, corrigée par la même révision : le Lighting System ne produit que des valeurs statiques (avant/après) ; l'animation entre ces valeurs reste exclusivement au Motion Engine.

**Issue de la revue v2.0 :** les deux failles identifiées sont corrigées dans le texte de cette même ADR, pas reportées à l'implémentation — condition posée par le Product Owner ("nous consolidons l'architecture avant l'implémentation, pas pendant").

---

# 6. Conséquences

## Prérequis avant toute intégration au-delà du laboratoire

- Scission de `WorkflowStepCard` entre apparence et navigation (section 2, Card Renderer).
- Contrat explicite de la Composition Strategy incluant un paramètre de personnalité spatiale par sujet, pas seulement un rang (section 2, Composition Strategy).
- Arbitrage entre l'ombre de profondeur (Lighting System) et l'ombre de statut (Design System existant) implémenté, pas seulement documenté.
- Vérification, au moment du code, que Composition Strategy et Lighting System restent deux fonctions réellement distinctes plutôt que fusionnées par commodité (Attaque 4, section 5).

## Hors périmètre de cette ADR

- L'implémentation elle-même — explicitement demandée après cette ADR, pas avec elle.
- Le branchement au moteur métier réel (`resolveDashboardWorkflow`) — le laboratoire continue de fonctionner sur des scénarios fictifs.
- Le Chapitre 3 — inchangé, hors périmètre.

---

# Conclusion

Cette architecture ne change pas ce qui a été décidé (ADR-007) — elle lui donne un système capable de le produire de façon durable, plutôt qu'une maquette figée. Sept risques ont été identifiés puis résolus dans le texte à travers ses deux versions (collision de nom, source de vérité de la classification, propriété de l'ombre, composition organique, navigation intégrée à la carte, chevauchement géométrie/lumière, chevauchement lumière/mouvement) — documentés comme conditions, pas comme objections. L'architecture à six couches est actée avec ces conditions, pas malgré elles. Le prochain jalon est l'implémentation dans le laboratoire déjà existant, sur autorisation explicite du Product Owner.
