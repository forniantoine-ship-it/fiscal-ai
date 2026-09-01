# Decisions

DEC-001

Le pilotage du projet est orienté produit.

---

DEC-002

Le MVP est prioritaire sur la dette technique.

---

DEC-003

Rôles

CEO : Antoine

CTO : ChatGPT

Lead Developer : Claude

---

DEC-004

Aucune session ne se termine sans mise à jour de la gouvernance.

---

DEC-005

Le Runtime devient la source de vérité.

Les Wizards ne doivent être que des interfaces utilisateur.

---

DEC-006

Aucun Sprint n'est validé sans démonstration complète en QA.

---

DEC-007

Fiscal AI n'est plus considéré comme un logiciel fiscal.

Le produit est officiellement défini comme un conseiller numérique spécialisé.

---

DEC-008

La philosophie du produit est inspirée des principes stoïciens.

Objectif :

Réduire la charge mentale.

Créer une relation calme, fiable et rassurante.

---

DEC-009

Le concept d'Ataraxia devient l'étoile polaire de conception.

Toutes les décisions produit devront être évaluées selon leur capacité à réduire la charge mentale.

---

DEC-010

Toute interface devra respecter les Principes de Conception définis dans la Constitution.

---

DEC-011

Le produit sera conçu autour d'une relation continue avec l'utilisateur.

Chaque ouverture de Fiscal AI devra être pensée comme une reprise de conversation et non comme l'ouverture d'un logiciel.

---

DEC-012

Fiscal AI construit une relation, et non un logiciel (Article I — La Relation).

Chaque ouverture est une reprise de conversation. Le produit travaille pendant l'absence de l'utilisateur. La mémoire est une preuve de respect. Le produit accompagne plusieurs années.

---

DEC-013

Le Conversation System devient une couche du produit (Article VI — La Conversation).

Le conseiller guide, ce n'est pas un chatbot. Le Runtime pilote la conversation. L'utilisateur ne tape presque jamais ; les interactions sont principalement des validations et des choix. GPT n'intervient que lorsque cela apporte une réelle valeur.

---

DEC-014

Le dashboard disparaît. L'accueil devient un parcours de trois chapitres plein écran : Le Conseiller, Les Espaces de travail, Le Coffre-fort Fiscal AI (Article VII — Design).

---

DEC-015

Les couleurs ne sont jamais décoratives ; elles possèdent toujours une signification (Color Philosophy). Blanc = calme, orange = conseiller, vert = validation, gris = stabilité. Le bouton orange devient la signature visuelle de Fiscal AI.

---

DEC-016

Le scroll ne sert pas à afficher davantage d'informations ; il sert à changer de contexte (Scroll Narrative). Chaque chapitre occupe environ une hauteur d'écran complète. L'utilisateur ne voit jamais plusieurs intentions en même temps.

---

DEC-017

La prochaine étape du projet consiste à traduire fidèlement la Constitution en interface. Aucune nouvelle fonctionnalité ne doit être développée avant la validation du premier écran. Le premier écran est désormais considéré comme le point d'entrée de toute l'expérience Fiscal AI.

---

DEC-018

Le remplacement du Dashboard (DEC-014) est une évolution du concept, pas un conflit fonctionnel.

UXP-004 est mis à jour (v1.0 → v2.0) pour décrire le parcours narratif en trois chapitres (Le Conseiller, Les Espaces de travail, Le Coffre-fort) plutôt qu'un Dashboard classique, en conservant intégralement sa philosophie : une seule action prioritaire, réduction de la charge mentale, guidage, situation → raison → action → suite.

---

DEC-019

Le Design Language de Fiscal AI est fondé : Fiscal AI ne cherche jamais à impressionner, il cherche à rassurer. Chaque décision graphique poursuit cet objectif.

Principes validés : une intention par écran ; le vide comme outil de guidage ; la typographie porte l'émotion (peu de tailles, peu de graisses, beaucoup d'espace) ; une illustration sans compréhension ou émotion utile disparaît ; les animations expliquent et n'existent jamais pour divertir ; chaque composant peut être résumé par une phrase que l'utilisateur comprendrait ; chaque chapitre de l'accueil a une intention unique (Comprendre / Agir / Retrouver) ; avant de valider un écran, toujours vérifier qu'il réduit réellement la charge mentale de l'utilisateur.

---

DEC-020

Le conseiller n'est jamais représenté par un avatar, un personnage, une photo ou une mascotte.

Il existe uniquement par ses mots, sa mémoire, ses décisions, son accompagnement.

---

DEC-021

Le conseiller est présent sur toutes les pages de Fiscal AI (Article VI — La Conversation).

Il est une présence conversationnelle intégrée à l'interface, jamais une fenêtre de chat séparée.

---

DEC-022

Chaque page possède une illustration liée à son contexte métier — Activité, Logement, Revenus, Coffre-fort... (Design Language, section 6).

L'illustration sert à comprendre la page, jamais à décorer.

---

DEC-023

Ratification de fin de séance — confirmation explicite, sans contenu nouveau, des décisions suivantes comme structure officielle du produit :

- les trois chapitres (Le Conseiller, Les Espaces de travail, Le Coffre-fort) deviennent la structure officielle de l'accueil (confirme DEC-014) ;
- une seule carte est active à la fois dans les Espaces de travail (confirme DEC-014 / Article VII) ; ⚠ **révisé par DEC-029** (10/07/2026) — le principe « carte active unique » est remplacé par un modèle de progression, voir DEC-029 ;
- le Coffre-fort devient la représentation officielle des documents sécurisés (confirme DEC-014 / Language System — composant Vault) ;
- le conseiller sans avatar (confirme DEC-020) et les illustrations non décoratives (confirme DEC-019, DEC-022) sont réaffirmés comme définitifs pour cette v1.

---

DEC-024

La Constitution Produit v1 est considérée comme terminée : Articles I à VII, Design Language, Language System, Color Philosophy, Scroll Narrative.

Le produit entre dans sa phase de conception UX/UI.

⚠ Article VIII — Gouvernance produit reste non rédigé et n'est pas couvert par ce v1 — **à confirmer** : périmètre volontairement exclu, ou oubli à traiter en priorité au prochain sprint.

---

DEC-025

L'ordre des travaux du projet est désormais : UX → UI → PRD → Développement → Validation.

Sprint UX-001 — Le Conseiller est ouvert. Objectif : concevoir et implémenter le premier chapitre de l'expérience utilisateur (Acte I — Le Conseiller). Livrable : le premier écran complet. Aucun autre écran ne doit être développé avant sa validation.

---

---

DEC-026

Le Chapitre 1 — Accueil n'est plus pensé comme un espace de travail. Son rôle est exclusivement d'accueillir, rassurer, expliquer ce qui va se passer, et recommander la prochaine étape.

Le Chapitre 1 ne lance jamais directement une page métier. Le bouton principal ("Continuer") fait défiler la page jusqu'au Chapitre 2 — il n'ouvre jamais Activité, Logement ou une autre page métier. Ce choix d'expérience est assumé : il matérialise la frontière entre "on vous accueille" (Chapitre 1) et "vous commencez à travailler" (Chapitre 2).

---

DEC-027

Le Conseiller n'est ni un chatbot, ni une FAQ, ni un centre d'aide. Il est une présence qui observe avant de répondre.

Il s'exprime toujours par une observation proactive sur l'état réel du dossier (ex. « J'ai regardé votre dossier. Il manque uniquement votre acte d'acquisition. »), jamais par une question ouverte du type « Que souhaitez-vous faire ? ». Des compléments d'information (pourquoi ce document, le renseigner manuellement, où le trouver) peuvent être consultés ensuite, à la demande de l'utilisateur, mais restent des approfondissements secondaires — jamais le cœur du panneau, jamais un menu de premier niveau.

Le contenu précis du Conseiller (personnalité, ton, formulations, scénarios) relève du chantier Conversation System, volontairement distinct — voir DEC-031.

---

DEC-028

Le Chapitre 1 conserve deux cartes, avec des responsabilités strictement distinctes et non interchangeables :

- **Carte principale** : répond uniquement à « Que faisons-nous maintenant ? ». Elle porte l'action du moment et le bouton principal. C'est l'unique point focal de l'écran.
- **Carte Conseiller** : répond uniquement à « Que dois-je savoir ? ». Elle apporte du contexte (l'observation proactive de DEC-027), jamais une reformulation de la priorité déjà annoncée par la carte principale. Son poids visuel est structurellement inférieur (plus petite, plus discrète, moins contrastée) — voir DEC-032 pour la direction artistique précise.

Les deux cartes doivent provenir d'une **source unique de vérité**. Deux calculs indépendants pouvant produire des messages divergents entre les deux cartes sont explicitement refusés — le Conseiller et la carte principale doivent toujours raconter la même histoire, jamais deux versions différentes de l'état du dossier.

---

DEC-029

Le Chapitre 2 — Les Espaces de travail abandonne la logique active / inactive (posée par DEC-014 / Article VII et confirmée par DEC-023) au profit d'un modèle de **progression**.

Principe retenu : une étape devient accessible dès qu'elle est atteinte dans le parcours recommandé, et le reste alors **définitivement** — l'utilisateur peut y revenir, corriger ou compléter, même après être passé à l'étape suivante. Le Conseiller continue de recommander la priorité du moment (Chapitre 1), mais le Chapitre 2 ne décide plus de ce qui est cliquable : il raconte l'état réel du dossier.

États retenus, en remplacement d'actif/inactif : **à découvrir** (non atteint, non accessible — jamais présenté comme un verrou, seulement comme « nous n'en sommes pas encore là »), **en cours**, **à compléter** (correction attendue), **terminé** (consultable et modifiable). Le traitement graphique de ces états est délibérément différé à un sprint dédié ; seul le principe fonctionnel est acté ici.

Cette décision révise explicitement le point correspondant de DEC-023.

---

DEC-030

Le Chapitre 3 — Le Coffre-fort devient un véritable coffre-fort documentaire, pas un tableau de fichiers.

Le haut de l'écran raconte la confiance (protection, confidentialité, conservation) avant que les documents n'apparaissent. Les documents sont regroupés par exercice fiscal. Les onglets par exercice n'apparaissent qu'à partir du moment où plusieurs exercices existent réellement — on évite délibérément de montrer un onglet vide dès la première année d'usage.

Le texte de conservation rappelle que les documents restent conservés pour faciliter les prochaines déclarations et pour pouvoir répondre, si nécessaire, à une demande de l'administration fiscale pendant les délais de conservation applicables. ⚠ La formulation exacte des délais applicables n'est pas tranchée ici — elle relève de l'expertise fiscale (01 - Expertise) et doit être sourcée avant publication, pas laissée vague indéfiniment.

---

DEC-031

Le chantier Conversation System (personnalité, ton, textes, scénarios, suggestions, réponses, états conversationnels) est formellement repoussé à un sprint indépendant, distinct du sprint structurel en cours.

Le sprint UX-001 ne traite que la structure, le rythme et les interactions du parcours d'accueil. La voix du Conseiller sera écrite une fois cette structure figée, jamais l'inverse. Ceci précise, pour ce sprint, le principe déjà posé par DEC-013 (le Conversation System est une couche du produit).

---

DEC-032

Direction artistique validée pour le Chapitre 1, à partir de la capture de référence validée en séance (utilisée comme direction — proportions, contrastes, hiérarchie — jamais comme spécification pixel par pixel) :

- Carte principale dominante, environ 65 à 70 % de la largeur disponible, fond dans la couleur d'accent du produit (orange), bouton principal blanc pour un contraste fort.
- Carte Conseiller plus étroite, environ 30 à 35 % de la largeur, fond clair (blanc ou crème), volontairement moins contrastée, n'utilisant jamais les mêmes contrastes que la carte principale.
- Objectif : que la hiérarchie visuelle soit évidente avant même la lecture du contenu — l'œil est attiré par la carte principale, puis découvre la présence du Conseiller.

---

DEC-033

Le scroll narratif entre chapitres (DEC-016, Scroll Narrative) est resserré : `scrollSnapType` passe de `proximity` à `mandatory` dans `FullHeightChapters.tsx`, afin de garantir qu'aucun arrêt intermédiaire n'est possible pendant un scroll normal (molette, trackpad, tactile).

Ce resserrement est validé uniquement entre le Chapitre 1 et le Chapitre 2. Le Chapitre 3 (Coffre-fort) reste en `variant="flow"`, structure et comportement de scroll inchangés — son passage éventuel en panneau plein écran et scroll-snap est explicitement hors périmètre du sprint UX-001, à traiter dans un futur sprint dédié au Coffre-fort.

Le comportement de scroll interne « façon Apple » (un chapitre dont le contenu dépasse la hauteur du viewport conserve son propre scroll, le scroll principal ne reprend qu'une fois le chapitre entièrement parcouru) est identifié comme un sujet d'ingénierie à part entière — pas une simple propriété CSS. Il est explicitement reporté au futur sprint Coffre-fort, où il sera le plus nécessaire (contenu documentaire potentiellement long), plutôt que traité par improvisation dans ce sprint.

---

DEC-034

Le Chapitre 2 — Les Espaces de travail adopte une nouvelle métaphore de représentation visuelle : la **roue de progression**. L'étape active occupe le centre ; les étapes voisines gravitent, réduites, de part et d'autre ; la roue tourne d'elle-même lorsqu'une étape se termine et que le Conseiller désigne la suivante. La roue matérialise physiquement le principe déjà acté : le produit désigne la prochaine étape, l'utilisateur ne la choisit jamais dans une liste.

Cette décision est actée **avec conditions explicites**, à la suite d'un audit qui a identifié plusieurs contradictions dans la première proposition visuelle :

- **Aucune navigation manuelle vers une étape non découverte.** La roue ne comporte pas de flèches permettant de parcourir librement les étapes à venir — cela contredirait directement le principe qu'elle est censée incarner. Un geste de consultation vers l'arrière (étapes déjà découvertes) reste possible.
- **Jamais plus de deux à trois cartes visibles à la fois** (l'étape active et ses voisines immédiates). La roue ne montre jamais la totalité des étapes ni leur nombre total — conforme au principe déjà posé de ne jamais exposer d'emblée la taille complète du parcours.
- **Aucun cadenas.** Les étapes non atteintes suivent le traitement déjà validé par DEC-029 (« nous n'en sommes pas encore là », jamais un verrou visuel).
- **Un seul système de représentation de la progression.** La roue remplace toute autre jauge, bannière ou fil de points redondant — elle ne s'ajoute pas à un système existant, elle en devient l'unique porteur.
- **Limite reconnue de la métaphore** : un retour en arrière non adjacent (une étape reportée, hors séquence, redevenant prioritaire) ne peut pas être représenté par une rotation continue sans paraître un dysfonctionnement. Ce cas devra être traité par un geste distinct (pas une rotation multi-crans), à spécifier avant l'implémentation de ce cas précis — non bloquant pour la première version (cas nominal : progression séquentielle).

**Why:** la première proposition visuelle contenait des éléments directement contradictoires avec des principes déjà actés (chevrons de navigation libre vs. DEC-026/DEC-029 « le produit décide » ; cadenas vs. DEC-029 ; compteur total et multiples jauges vs. le principe de non-exposition de la taille totale du parcours, déjà formulé lors de l'audit du 10/07/2026). La métaphore de la roue est retenue pour son intention, pas pour son exécution initiale.

**How to apply:** toute implémentation de la roue doit respecter les cinq conditions ci-dessus. Si une contrainte technique oblige à en assouplir une, elle doit être renégociée explicitement avec le Product Owner, jamais réintroduite par défaut faute d'alternative trouvée en cours de développement.

⚠ **Révisée par ADR-007** (10/07/2026, Niveau 4 — Fondateur) — la roue elle-même (le mécanisme de rotation) est abandonnée : sa nature séquentielle contredit le retour non adjacent déjà validé par DEC-029. L'intention (le produit désigne, l'utilisateur ne choisit pas) est intégralement reprise par ADR-007, sous un principe plus abstrait (gestes présenter/rapprocher/retirer/ranger/rappeler) dont la forme visuelle définitive reste ouverte.

---

DEC-035

Le Chapitre 2 adopte le principe fixé par ADR-007 (Niveau 4 — Fondateur, GOUV-001) : la carte centrale ne représente plus « l'étape suivante » d'une séquence, mais le sujet que le Conseiller décide de poser devant l'utilisateur maintenant. Les autres sujets ne sont plus une liste — ce sont les autres sujets du dossier, au repos.

Toute logique de dashboard, workflow, timeline, checklist ou menu de modules est définitivement abandonnée pour ce chapitre. Le mouvement ne doit jamais donner l'impression de tourner, glisser ou constituer un carrousel — seuls cinq gestes sont autorisés : présenter, rapprocher, retirer, ranger, rappeler.

La représentation visuelle exacte (cercle, table, ou autre) reste volontairement ouverte — voir ADR-007 pour le détail complet, les options écartées et leurs raisons, la revue adversariale et le pré-mortem. Date de revisitation de ce principe : 2026-10-10.

---

DEC-036

La charge mentale reste le principe directeur unique de la Constitution (DEC-009) — ADR-008, qui avait proposé d'y ajouter la « signature produit » comme second critère constitutionnel, est rejetée.

En revanche, les espaces d'accueil et d'orientation (Chapitre 1 — Le Conseiller, Chapitre 2 — Les Espaces de travail) doivent également être évalués sur leur capacité à rendre perceptible la relation déjà actée par l'Article I — La Relation (DEC-012) : Fiscal AI prépare le travail de l'utilisateur, il ne lui demande jamais de s'organiser lui-même son parcours.

La différenciation du produit doit être une **conséquence** de cette relation correctement exprimée — jamais un objectif poursuivi pour lui-même. Une interaction n'est pas jugée insuffisante parce qu'elle ressemblerait à ce qui existe ailleurs ; elle est jugée insuffisante si elle laisse l'utilisateur organiser lui-même ce que Fiscal AI aurait dû préparer à sa place.

**Why:** distingue explicitement la recherche d'originalité (rejetée comme objectif) de la fidélité à une relation déjà définie (retenue comme critère d'évaluation) — évite qu'un futur travail sur le Dashboard soit validé ou rejeté sur un critère esthétique plutôt que relationnel.

**How to apply:** avant de valider une interaction dans le Chapitre 1 ou 2, vérifier qu'elle traduit "Fiscal AI a préparé ceci pour vous" plutôt que "voici les options, organisez-vous" — pas vérifier qu'elle est visuellement inédite.

---

DEC-037

L'émotion fondamentale du Chapitre 2 — Les Espaces de travail est fixée à deux niveaux distincts, non concurrents :

- **Le problème humain** (pourquoi Fiscal AI existe à cet endroit) : *« Je ne suis plus seul face à ça. »*
- **L'émotion recherchée** (ce que l'utilisateur doit ressentir) : *« Je me sens accompagné. »*

Cette émotion porte une clause indissociable : accompagné ne signifie jamais dépossédé. L'utilisateur reste acteur de sa déclaration — un accompagnement qui retirerait ce sentiment de maîtrise ne produirait pas l'émotion visée, il produirait de la passivité, ce que ce chapitre doit éviter au même titre que la solitude.

Cette émotion devient la référence de conception pour la mise en scène du Chapitre 2, au sommet d'une décomposition à cinq couches désormais retenue comme méthode de travail pour ce chantier :

```
Émotion       — Je me sens accompagné (ce document)
   ↓
Relation      — Fiscal AI prépare, l'utilisateur ne s'organise jamais lui-même (DEC-036)
   ↓
Gestes        — présenter, rapprocher, retirer, ranger, rappeler (ADR-007)
   ↓
Composition   — disposition spatiale des cartes — non tranchée
   ↓
Métaphore     — lieu invisible de l'interaction — non tranchée
```

**Why :** les tentatives précédentes de mise en scène (roue, table, bureau vivant, orbite) ont été comparées entre elles sans référence émotionnelle explicite au-dessus — ce qui produisait des arbitrages fondés sur la cohérence interne des métaphores plutôt que sur ce qu'elles font ressentir. Fixer l'émotion avant la composition inverse cet ordre.

**How to apply :** toute proposition de composition ou de métaphore pour le Chapitre 2 doit désormais être jugée d'abord sur sa capacité à faire ressentir « je me sens accompagné, sans être dépossédé » — la cohérence interne (physique du lieu, lisibilité du geste) reste un critère de sélection parmi les options qui passent ce premier filtre, jamais un critère qui s'y substitue.

---

DEC-038

Une image de référence est retenue comme North Star émotionnelle, spatiale et narrative du Chapitre 2 — jamais comme spécification pixel par pixel. L'architecture technique capable de la produire est actée par ADR-009 (Niveau 3 — Structural, v2.0) : six couches indépendantes — Advisor Director, Scene Engine, Composition Strategy, Lighting System, Motion Engine, Card Renderer. ⚠ Mise à jour par DEC-039 : la couche Lighting System a été ajoutée après la version initiale à cinq couches, pour isoler l'atmosphère (lumière, chaleur, halo) de la géométrie (position).

La référence visuelle est retenue **avec corrections explicites**, identifiées par l'audit qui a précédé cette décision : elle ne doit jamais être reproduite avec des flèches de navigation manuelle, des icônes de cadenas, un compteur exposant la taille totale du parcours, ou plusieurs systèmes de progression simultanés — ces quatre éléments contredisent des principes déjà actés (ADR-007, DEC-026, DEC-029) et ne sont pas corrigés par la seule liste d'améliorations formulée en séance.

**Why :** figer une image de référence sans en auditer les éléments contradictoires aurait réintroduit silencieusement des principes déjà rejetés — exactement le risque déjà rencontré avec la roue (DEC-034, révisée par ADR-007). L'auditer avant de la figer évite de répéter cette erreur une troisième fois.

**How to apply :** toute implémentation dérivée de cette référence doit être vérifiée contre les quatre corrections ci-dessus avant toute revue visuelle — elles ne sont pas optionnelles au motif que l'image de référence les montre encore.

---

DEC-039

L'architecture de scène du Chapitre 2 (ADR-009) évolue de cinq à **six couches indépendantes**, avant toute implémentation : Advisor Director, Scene Engine, Composition Strategy, Lighting System *(nouvelle)*, Motion Engine, Card Renderer.

Toutes les conditions de la v1.0 sont validées par le Product Owner : le nom Advisor Director est définitif (jamais de logique métier, jamais de calcul de statut — il reçoit une classification déjà faite) ; les cartes deviennent passives (elles reçoivent `transform`, `depth`, `lighting`, `motion`, elles ne décident rien) ; l'ombre métier et l'ombre de profondeur restent deux responsabilités distinctes, combinées plutôt que substituées ; la composition n'est plus purement indexée (chaque sujet dispose d'une personnalité spatiale stable) ; les cadenas et le compteur "Étape X sur Y" sont définitivement supprimés ; le flou CSS est évité par défaut, au profit de la profondeur, l'opacité, la saturation, la luminosité, le contraste et l'échelle.

Le Lighting System isole l'atmosphère (lumière, chaleur, pénombre, halo, disparition) de la géométrie (position), jusque-là mélangées dans une seule couche. Deux chevauchements identifiés par l'audit ont été résolus avant l'acceptation : l'opacité et le flou quittent la Composition Strategy pour rejoindre exclusivement le Lighting System ; le Lighting System ne produit que des valeurs statiques, jamais une transition dans le temps — cette dernière reste exclusivement au Motion Engine.

**Why :** un système qui mélange géométrie et lumière dans une seule couche recrée, par un autre chemin, le problème que la séparation cherchait justement à éviter — deux préoccupations différentes calculées au même endroit finissent toujours par se contredire l'une l'autre.

**How to apply :** toute implémentation doit vérifier, au moment du code, que Composition Strategy et Lighting System restent deux fonctions réellement séparées, jamais fusionnées par commodité — condition posée explicitement pour ne pas répéter, une fois de plus, l'erreur déjà commise avec l'ombre puis avec la roue.

---

Détail et raisonnement : voir `03 - Produit/Fiscal AI Constitution/` et `UX/UXP-004 — Le Dashboard.md`, et ADR-009 pour l'architecture complète.

---

## État d'implémentation — septembre 2026

*Note d'état — pas une nouvelle décision fondateur. Les DEC-007 à DEC-039 restent le registre des décisions de juillet 2026.*

### Synthèse au 01/09/2026 (branche `sprint/dashboard-narrative-premium`, commits `09ec232`–`32b184b`)

Le code a dépassé le périmètre « Chapitre 1 seul » acté en juillet (Sprint UX-001). Le dashboard narratif complet est livré sur `/dashboard`. Les décisions normatives (ADR-007, DEC-035, UXP-004 v2.3) restent la cible ; l'implémentation actuelle comporte des écarts documentés ci-dessous, traités comme **dette transitoire**, pas comme contradiction accidentelle.

### Chapitre 2 — carousel production vs ADR-007

**Cible normative (juillet 2026, inchangée) :** ADR-007 et DEC-035 — le Conseiller présente un sujet ; cinq gestes (présenter, rapprocher, retirer, ranger, rappeler) ; pas de carousel, pas de rotation, pas de navigation libre vers des étapes non découvertes.

**Implémentation actuelle (`09ec232`) :** `DashboardWorkflow` + `workflow-carousel-engine` — carousel horizontal premium avec buffer cyclique/progressif, drag pointer, navigation clavier flèches. Le modèle de progression DEC-029 est partiellement respecté (états « À venir », étapes atteintes accessibles via les cartes).

**Statut :** étape transitoire d'ingénierie, livrée avant migration vers l'architecture ADR-009. Le lab `/lab/advisor-scene` (`2120f58`) explore la cible (six couches, gestures) sans remplacer encore le carousel production.

**Résolution attendue :** arbitrage Product Owner — itérer le carousel, migrer vers la scène lab, ou chemin hybride — sans réintroduire silencieusement les éléments rejetés (cadenas, compteur « Étape X sur Y », navigation libre vers l'avenir).

### Chapitre 1 — alignements

Conforme aux intentions DEC-026–028 et DEC-032 : bouton principal scroll vers Ch2 (`scrollChapterPanelIntoView`), deux cartes ~70/30, `resolveDashboardHeroState` comme source hero. Compléments Conseiller secondaires (DEC-027 partiel). Conversation System (DEC-031) toujours ouvert pour le ton et les scénarios.

### Chapitre 3 — coffre-fort v1

`VaultSection` livré : récit de confiance (lignes TRUST_LINES), tableau documentaire, lien ajout documents. **Non livré :** regroupement par exercice fiscal, onglets conditionnels multi-exercices (DEC-030).

### Source unique complétude — F-009

`32b184b` verrouille la parité `declarationDraft.inpiConfirmedAt` entre dashboard workflow, dossier-status, declaration-progress et document-journey — en ligne avec l'esprit DEC-028 (une seule histoire sur l'état du dossier).

### Knowledge normatif

ADR-007, ADR-008, ADR-009 et Constitution v1 commités localement (`986ea26`), non poussés au 01/09/2026.