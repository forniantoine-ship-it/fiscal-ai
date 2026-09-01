# UXP-004 — Le Parcours d'Accueil
*(anciennement « Le Dashboard »)*

> Ce document définit la mission du parcours d'accueil de Fiscal AI, à chaque instant de la vie du dossier.
> Il ne décrit pas une interface. Il décrit une intention.
> Depuis le 08/07/2026 (DEC-014, [Article VII — Design](../03%20-%20Produit/Fiscal%20AI%20Constitution/07%20-%20Design.md)), cette intention est portée par un parcours narratif de trois chapitres plein écran : **Le Conseiller → Les Espaces de travail → Le Coffre-fort Fiscal AI**, reliés par le scroll (voir [Scroll Narrative](../03%20-%20Produit/Fiscal%20AI%20Constitution/Scroll%20Narrative.md)).
> Références : [[UXP-001 Parcours psychologique client]] — [[UXP-002 — Le moment de la récompense]] — [[UXP-003 — Le principe de guidage]]

Version : 2.3
Date : 2026-07-10

---

## Historique des versions

**v1.0 (2026-07-02)** — Première rédaction. Décrit un Dashboard : un écran unique et persistant, « directeur de mission » du client.

**v2.0 (2026-07-08)** — Évolution du concept, pas remplacement de la mission. Suite à DEC-014 (séance fondatrice du 08/07/2026) : le Dashboard classique devient un parcours narratif en trois chapitres plein écran. Toute la philosophie de la v1.0 est conservée à l'identique — une seule action prioritaire, réduction de la charge mentale, guidage, situation → raison → action → suite — mais elle est désormais explicitement répartie sur les trois chapitres plutôt que portée par un écran unique. La correspondance entre chaque partie de ce document et les trois chapitres est explicitée section par section ci-dessous.

**v2.1 (2026-07-10)** — Convergence d'un audit UX et de plusieurs itérations avec le Product Owner (DEC-026 à DEC-032). Trois évolutions structurelles : (1) le Chapitre 1 est redéfini strictement comme un accueil — il ne lance jamais une page métier, le bouton « Continuer » ne fait que défiler vers le Chapitre 2 — et se compose de deux cartes à responsabilités distinctes et non interchangeables, issues d'une source unique de vérité ; (2) le Chapitre 2 abandonne la logique « carte active unique » au profit d'un modèle de progression où toute étape atteinte reste accessible définitivement ; (3) le Chapitre 3 devient un véritable coffre-fort documentaire, avec un récit de confiance avant les documents et un regroupement par exercice fiscal. La philosophie fondatrice (situation → raison → action → suite, une seule action prioritaire, jamais de vide) n'est pas remise en cause — elle est précisée à l'endroit où l'expérience réelle avait révélé une ambiguïté.

**v2.2 (2026-07-10)** — ADR-007 (Niveau 4 — Fondateur) révise la représentation du Chapitre 2, actée dans un premier temps par DEC-034 sous la forme d'une « roue de progression ». Le mécanisme de rotation est abandonné : sa nature séquentielle contredisait le retour non adjacent déjà validé (une étape reportée redevenant prioritaire hors ordre). Le principe qui succède est plus abstrait et ne présuppose plus de forme graphique : la carte centrale représente le sujet que le Conseiller pose devant le client maintenant, les autres sujets restent au repos, jamais énumérés dans leur totalité, et seuls cinq gestes sont permis — présenter, rapprocher, retirer, ranger, rappeler — jamais tourner, glisser ou constituer un carrousel. La forme visuelle définitive reste ouverte, voir ADR-007.

**v2.3 (2026-07-10)** — L'émotion fondamentale du Chapitre 2 est fixée (DEC-037), voir la nouvelle sous-section en fin de section consacrée au Chapitre 2. Une décomposition à cinq couches (Émotion → Relation → Gestes → Composition → Métaphore) est retenue comme méthode pour achever la mise en scène : les deux couches supérieures sont désormais fixées (Émotion par DEC-037, Relation par DEC-036), la couche Gestes l'était déjà (ADR-007), Composition et Métaphore restent à trancher.

---

## Principe directeur

Le parcours d'accueil n'est pas un écran de synthèse.

Le parcours d'accueil n'est pas un tableau de bord.

Le parcours d'accueil n'est pas une simple page d'accueil.

Le parcours d'accueil est le directeur de mission du client — porté non par un écran unique, mais par trois chapitres plein écran que le client traverse au fil du scroll.

Un directeur de mission ne raconte pas tout ce qu'il sait. Il ne montre pas tout ce qui existe. Il dit à la personne qu'il accompagne trois choses, et seulement trois : où elle en est, pourquoi elle en est là, ce qu'elle doit faire maintenant. Puis il annonce ce qui va se passer ensuite, pour qu'elle n'ait jamais à se demander si elle a été oubliée. Ce rôle est porté en premier lieu par le **Chapitre 1 — Le Conseiller**.

Le parcours porte cette responsabilité en continu, du premier jour où le client crée son dossier jusqu'au jour où il archive sa déclaration et referme l'année fiscale.

Un client peut n'ouvrir Fiscal AI qu'une fois par semaine, parfois moins. Le parcours doit donc fonctionner comme un point de reprise : chaque visite doit reconstituer instantanément la situation, sans que le client ait à se souvenir de ce qu'il faisait la dernière fois.

**Test ultime du document** : si un client n'ouvre que le Chapitre 1 — Le Conseiller, une seule fois par semaine, et ne lit que lui, il doit, en moins de trente secondes, comprendre où il en est, pourquoi il en est là, ce qu'il doit faire maintenant, et ce qui se passera ensuite. Il ne doit jamais se sentir perdu.

---

## 1. Pourquoi ce parcours existe-t-il ?

Le parcours existe parce que le client n'a pas une relation ponctuelle avec Fiscal AI. Il a une relation qui dure une saison fiscale entière, parfois plusieurs années — voir [[UXP-001 Parcours psychologique client]] et l'Article I — La Relation de la Fiscal AI Constitution.

Le tunnel de déclaration (décrit dans [[UXP-001 Parcours psychologique client]]) est un moment concentré : vingt minutes, une intention, un aboutissement. Le parcours d'accueil, lui, couvre tout le reste du temps — les semaines d'attente, les retours ponctuels, les années suivantes.

Sans ce parcours, le client serait seul entre deux visites. Il devrait se souvenir lui-même de ce qu'il a fait, de ce qui reste à faire, de ce qui l'attend. Cette charge mentale n'appartient pas au client. Elle appartient à Fiscal AI.

Le parcours existe pour porter cette charge à la place du client.

Il existe pour qu'à chaque retour, aussi espacé soit-il, le client retrouve immédiatement le fil — sans effort de mémoire, sans reconstruction mentale, sans avoir à rouvrir des documents pour comprendre où il en est.

Le parcours d'accueil est la mémoire externe du client sur sa propre obligation fiscale.

---

## 2. Quelle promesse fait-il au client ?

Le parcours fait une seule promesse, répétée sous des formes différentes selon le moment :

> **"Vous n'avez rien à retenir. Nous savons où vous en êtes. Voici ce qui compte maintenant."**

Cette promesse a trois conséquences directes.

**Elle décharge.** Le client n'a pas à tenir un calendrier fiscal dans sa tête, ni à se souvenir des pièces qu'il a fournies ou non.

**Elle oriente.** Le client n'a jamais à choisir entre plusieurs priorités. Le Chapitre 1 — Le Conseiller a déjà fait ce tri.

**Elle rassure sur la durée.** La promesse ne porte pas seulement sur l'instant présent. Elle porte sur la continuité : Fiscal AI reste présent après le paiement, après le dépôt, d'une année sur l'autre. Le parcours tout entier — jusqu'au Chapitre 3, Le Coffre-fort — est la preuve visible que la relation ne s'arrête pas à la transaction.

Cette promesse est cohérente avec [[UXP-003 — Le principe de guidage]] : un produit qui ne s'arrête jamais au résultat a besoin d'un lieu où cette continuité se manifeste physiquement. Ce lieu est le parcours d'accueil, dès le Chapitre 1.

---

## 3 & 4. Ce que le client doit ressentir et la mission du Chapitre 1 — Le Conseiller, selon l'état du dossier

Dans la structure en trois chapitres, cette section décrit spécifiquement la mission du **Chapitre 1 — Le Conseiller** : c'est lui qui porte, à chaque état du dossier, la situation, la raison, l'action et la suite — exactement conforme à sa définition dans l'Article VII (« une seule action, un seul bouton »). Les Chapitres 2 et 3 restent stables dans leur rôle (espaces de travail, coffre-fort) ; c'est le contenu du Chapitre 1 qui change à chaque état.

Le Chapitre 1 n'a pas une mission fixe. Sa mission change avec l'état du dossier, mais son architecture ne change jamais : une situation, une raison, une action, une suite.

Chaque état ci-dessous répond à la même question — quelle est la mission du Chapitre 1 — Le Conseiller à cet instant précis ? — pas à la question de l'apparence.

---

### État 1 — Premier jour

**Ce que le client ressent en arrivant**
Un mélange d'incertitude et d'attente. Il vient de créer son dossier. Il ne sait pas encore ce que représente concrètement l'expérience à venir.

**Ce qu'il doit ressentir en repartant**
Qu'un chemin existe, qu'il est court, et qu'il vient d'en franchir le premier pas.

**Mission du Chapitre 1 — Le Conseiller**
Transformer une intention vague ("je dois déclarer mon LMNP") en un chemin concret et amorcé. Le Conseiller ne montre encore aucun résultat, parce qu'il n'y en a pas. Sa mission est de convertir l'inconnu en une suite d'étapes lisibles, et de pousser vers la première d'entre elles.

Le Chapitre 1 ne doit jamais, à ce stade, donner au client l'impression qu'il regarde une page vide. Une page vide est un vide. Une page qui annonce un chemin est un début.

---

### État 2 — Analyse en cours (le dossier se construit)

**Ce que le client ressent en arrivant**
Il revient après avoir laissé le dossier en suspens — parfois une pièce à retrouver, parfois simplement un manque de temps. Il craint d'avoir à tout reprendre depuis le début.

**Ce qu'il doit ressentir en repartant**
Que rien n'a été perdu, qu'il reprend exactement là où il s'était arrêté, et qu'il progresse réellement.

**Mission du Chapitre 1 — Le Conseiller**
Restaurer la continuité. La mission n'est pas d'afficher un pourcentage d'avancement pour informer — c'est un effet secondaire. La mission réelle est de dire au client, sans qu'il ait à chercher : "voici ce qu'il vous reste à faire, et c'est plus court que ce que vous croyez."

Le Conseiller doit ici combattre un risque psychologique précis : l'abandon par lassitude. Un dossier interrompu perd de sa valeur perçue à chaque semaine qui passe si personne ne relance l'élan. Le Conseiller est cette relance.

---

### État 3 — Corrections (une information manque ou est incohérente)

**Ce que le client ressent en arrivant**
Une inquiétude diffuse : "qu'est-ce qui ne va pas ?" Ce moment est fragile — un client mal guidé ici peut se sentir en échec et abandonner.

**Ce qu'il doit ressentir en repartant**
Que la demande est légitime, précise, et facile à satisfaire. Jamais qu'il a commis une faute.

**Mission du Chapitre 1 — Le Conseiller**
Transformer un blocage en une tâche simple. La mission n'est pas de signaler un problème — n'importe quel système sait signaler un problème. La mission est de le désamorcer immédiatement : dire quoi apporter, pourquoi c'est nécessaire, et combien de temps cela prendra.

Une correction n'est jamais présentée comme un échec du client. Elle est présentée comme la dernière pièce d'un puzzle presque terminé.

---

### État 4 — Attente (le moteur travaille)

**Ce que le client ressent en arrivant**
Une impatience teintée d'espoir. Il a fini sa part. Il attend maintenant la preuve que cela en valait la peine.

**Ce qu'il doit ressentir en repartant**
Que quelque chose de sérieux est en train de se produire pour lui, et que cela ne prendra pas longtemps.

**Mission du Chapitre 1 — Le Conseiller**
Habiter l'attente au lieu de la vider. Un client qui ne voit rien pendant l'attente projette ses propres doutes dans le silence. Le Conseiller doit occuper cet espace avec du sens, pas avec de l'animation : expliquer, en une phrase compréhensible, ce qui est en train d'être vérifié ou calculé pour lui.

L'attente n'est jamais un défaut à cacher. C'est la preuve qu'un travail réel a lieu. Elle doit être nommée, jamais dissimulée sous un silence.

---

### État 5 — Résultat prêt (avant paiement)

**Ce que le client ressent en arrivant**
De l'anticipation à son maximum. C'est l'instant que tout le parcours précédent a préparé.

**Ce qu'il doit ressentir en repartant**
Une certitude : ce qu'il a sous les yeux est réel, lui appartient déjà en substance, et ne demande plus qu'à être confirmé.

**Mission du Chapitre 1 — Le Conseiller**
Faire culminer la valeur perçue avant de proposer l'échange. C'est l'état le plus sensible du parcours, celui qui rejoint directement le moment de décision d'achat identifié dans [[UXP-001 Parcours psychologique client]]. Le Conseiller ne doit ni précipiter ni retenir : il doit exposer la valeur (le résultat, la liasse en devenir) avec une clarté totale, puis proposer une suite unique et évidente — qui conduit naturellement vers le Chapitre 2.

---

### État 6 — Paiement

**Ce que le client ressent en arrivant**
Une décision déjà prise intérieurement, qu'il vient formaliser. Ce n'est plus un moment de doute — c'est un moment d'exécution.

**Ce qu'il doit ressentir en repartant**
Que l'acte qu'il vient d'accomplir ouvre quelque chose, plutôt qu'il ne referme une transaction.

**Mission du Chapitre 1 — Le Conseiller**
Ne jamais traiter le paiement comme une fin de parcours. Conformément à la règle 5 de [[UXP-003 — Le principe de guidage]], le Conseiller doit immédiatement rediriger l'attention du client vers ce qui s'ouvre : son dossier complet, la suite concrète — les Espaces de travail, puis le Coffre-fort. Le parcours ne célèbre pas une vente. Il accueille un client dans la phase suivante de sa relation avec Fiscal AI.

---

### État 7 — Dossier terminé (post-dépôt, archivé)

**Ce que le client ressent en arrivant**
Un sentiment d'accomplissement qui, livré à lui-même, s'estompe vite. Sans rien pour l'entretenir, l'expérience redevient un souvenir neutre.

**Ce qu'il doit ressentir en repartant**
Que l'année n'est pas simplement close, mais rangée — et que la suivante est déjà anticipée, sans qu'il ait à s'en inquiéter avant l'heure.

**Mission du Chapitre 1 — Le Conseiller**
Clore sans abandonner. Le Conseiller confirme que le dossier est complet, accessible, protégé dans le temps — désormais dans le Chapitre 3, Le Coffre-fort — et annonce, sans anxiété ni urgence prématurée, quand et comment la prochaine échéance reviendra. Il transforme un aboutissement ponctuel en le premier chapitre d'une relation qui se répète chaque année.

Un dossier terminé qui ne dit rien sur la suite laisse le client seul face à l'année prochaine. Un dossier terminé qui annonce la suite construit une fidélité qui ne dépend d'aucune relance commerciale.

---

## 5. Quelles informations doivent être visibles immédiatement dans le Chapitre 1 — Le Conseiller ?

Le Conseiller résiste à la tentation de tout montrer. Il hiérarchise volontairement.

Trois informations, et seulement trois, doivent être visibles sans aucune action du client :

**1. La situation actuelle du dossier**, exprimée en une phrase compréhensible sans vocabulaire fiscal ni technique — pas un statut interne, une phrase humaine.

**2. La raison de cette situation**, en une ligne — pourquoi le dossier en est là, ce qui vient de se passer ou ce qui est en cours.

**3. L'action unique attendue du client à cet instant**, si une action est attendue — sinon, l'annonce claire de ce qui va se passer sans lui.

Rien d'autre ne doit disputer l'attention à ces trois éléments. Toute autre information — historique, détails, documents secondaires, données de contexte — existe, mais en retrait dans les chapitres suivants (Espaces de travail, Coffre-fort), accessible à qui la cherche, jamais imposée à qui ne la cherche pas.

Ce choix découle directement de la Règle 1 de [[UXP-003 — Le principe de guidage]] : où suis-je, qu'a-t-on fait, quelle est la prochaine action. Le Chapitre 1 est l'endroit où cette règle s'applique de façon la plus stricte, parce que c'est l'endroit où le client revient avec le moins de contexte frais en tête.

### Comment ces trois informations se répartissent entre les deux cartes du Chapitre 1 (DEC-026, DEC-027, DEC-028)

Le Chapitre 1 est un accueil, pas un espace de travail. Il ne lance jamais directement une page métier : le bouton principal fait défiler la page jusqu'au Chapitre 2, il n'ouvre jamais Activité, Logement ou une autre page métier. C'est un choix d'expérience assumé — le Chapitre 1 accueille, le Chapitre 2 fait travailler.

Il se compose de deux cartes à responsabilités strictement distinctes, jamais interchangeables :

- **La carte principale** est l'unique point focal de l'écran. Elle répond uniquement à « Que faisons-nous maintenant ? » : elle porte la situation, la raison, l'action unique et son bouton.
- **La carte Conseiller** est une présence, pas une deuxième action. Elle répond uniquement à « Que dois-je savoir ? » : elle apporte du contexte sur le dossier, jamais une reformulation de la priorité déjà annoncée par la carte principale. Son poids visuel est structurellement inférieur — plus petite, plus discrète, moins contrastée (direction artistique : DEC-032).

Le Conseiller observe avant de répondre. Il s'exprime toujours par une observation proactive sur l'état réel du dossier (par exemple : « J'ai regardé votre dossier. Il manque uniquement votre acte d'acquisition. »), jamais par une question ouverte du type « Que souhaitez-vous faire ? » — cela romprait le Principe absolu n°2 (une seule action prioritaire, voir section 9). Des compléments d'information peuvent être consultés ensuite, à la demande du client, mais restent des approfondissements secondaires, jamais le cœur du panneau ni un menu de premier niveau.

**Source unique de vérité** : le contenu des deux cartes doit provenir d'un seul et même calcul de l'état du dossier. Deux calculs indépendants pouvant produire des messages divergents entre les deux cartes sont explicitement refusés — la carte principale et le Conseiller doivent toujours raconter la même histoire, jamais deux versions différentes de la situation du client.

Le contenu précis de l'observation du Conseiller (formulation, ton, scénarios) relève du chantier Conversation System, volontairement distinct de ce sprint (DEC-031) : seule la structure est traitée ici.

---

## 6. Quelles informations ne doivent jamais y être visibles en permanence ?

**Le détail des calculs.** Sa présence permanente transforme un accompagnement en tableau de comptable. Le client doit savoir qu'il peut vérifier — voir [[UXP-002 — Le moment de la récompense]], Document 5 — mais pas être confronté à ce détail par défaut. La confiance se construit par la disponibilité de la preuve, pas par son exposition constante.

**L'historique complet des actions passées.** Un historique exhaustif en permanence dilue l'attention sur ce qui compte maintenant. Il doit être consultable, jamais imposé.

**Les états d'autres exercices fiscaux tant qu'ils ne sont pas pertinents pour l'action en cours.** Multiplier les dossiers visibles simultanément fragmente l'attention. Dans le Chapitre 2 — Les Espaces de travail, le Conseiller continue de recommander une seule priorité à la fois ; les autres espaces restent visibles mais ne concurrencent jamais cette priorité, même si — depuis DEC-029 — ils restent cliquables dès qu'ils ont été atteints (voir section 9, Principe 2).

**Toute proposition commerciale non liée à l'action prioritaire du moment.** Une sollicitation parallèle à la mission du moment revient à faire concurrence à sa propre priorité. Voir Règle 3 de [[UXP-003 — Le principe de guidage]] : une seule action mise en avant à la fois.

**Les indicateurs internes du moteur ou du système.** Le client n'a pas à connaître l'état technique de ce qui travaille pour lui. Il a besoin de savoir ce que cela signifie pour lui, jamais comment cela fonctionne — principe déjà posé dans [[UXP-001 Parcours psychologique client]].

La justification commune à ces exclusions : chaque information rendue visible en permanence dispute l'attention à la mission de l'instant. Un chapitre qui montre tout ne dirige plus rien.

---

## 7. Comment le parcours construit-il progressivement la valeur perçue ?

> Proposition de correspondance entre les paliers de valeur (déjà validés en v1.0) et les trois chapitres (validés le 08/07/2026) — **à confirmer par le Product Owner**, cette répartition précise n'a pas été explicitement validée en séance.

La valeur ne doit jamais être révélée d'un bloc. Elle se construit par paliers, chacun préparant le suivant.

**L'estimation** apparaît tôt, dès que le dossier contient assez d'éléments pour esquisser un ordre de grandeur, dans le Chapitre 1 — Le Conseiller. Elle n'est pas présentée comme un résultat final, mais comme une preuve précoce que le système comprend déjà la situation du client. Elle crée l'engagement : "ça avance, et ça me concerne déjà."

**Le résultat** apparaît lorsque le dossier est complet, avant tout accès à la liasse elle-même — toujours porté par le Chapitre 1. Il constitue la première preuve chiffrée et stable. Il doit être montré seul, sans être immédiatement noyé par le document qui le contient, pour que le client ait le temps de le mesurer, de le comprendre, de se l'approprier mentalement.

**La liasse** n'apparaît qu'ensuite, comme la matérialisation du résultat déjà digéré, au moment où le client entre dans le Chapitre 2 — Les Espaces de travail. C'est le pic de valeur perçue, documenté dans [[UXP-001 Parcours psychologique client]] : le moment où la décision d'achat se forme réellement. Le parcours ne doit jamais montrer la liasse avant que le client ait eu le temps d'intégrer le résultat qu'elle contient — sinon les deux preuves se confondent et s'affaiblissent mutuellement.

**Les documents** (au sens du dossier complet décrit dans [[UXP-002 — Le moment de la récompense]]) n'apparaissent qu'après l'acte de paiement, dans le Chapitre 3 — Le Coffre-fort Fiscal AI. Leur venue tardive n'est pas une restriction commerciale — c'est une construction narrative : ils sont la preuve que l'engagement du client a ouvert quelque chose de plus large que ce qu'il avait déjà vu.

Cette séquence — estimation, résultat, liasse, documents — reproduit à l'échelle des trois chapitres la courbe de confiance déjà identifiée dans [[UXP-001 Parcours psychologique client]] : chaque palier doit être une preuve tangible avant que la suivante ne soit montrée. Montrer un palier trop tôt dilue l'effet du suivant. Montrer un palier trop tard frustre inutilement une attente déjà mûre.

---

## 8. Le parcours doit-il raconter une histoire ?

Oui. Sans histoire, le parcours n'est qu'une suite d'états — une photographie sans direction. Avec une histoire, il devient un récit dans lequel le client avance, chapitre après chapitre.

**L'histoire racontée par le parcours est celle-ci** :

> *"Vous n'êtes pas seul face à une obligation administrative. Quelqu'un — quelque chose — s'occupe de votre dossier avec vous, étape après étape, jusqu'à ce qu'il soit clos. Et cela recommencera, plus facilement, l'année prochaine."*

Ce n'est pas l'histoire d'un outil qui produit un document. C'est l'histoire d'un client accompagné d'un début à une fin, puis reconduit vers un nouveau cycle.

**Comment le client doit avoir l'impression d'avancer**

Il ne doit jamais ressentir l'avancement comme une jauge qui se remplit. Il doit le ressentir comme une suite de petites victoires nommées : une pièce fournie, une inquiétude levée, un chiffre confirmé, un document obtenu. Chaque passage d'un état à un autre, ou d'un chapitre au suivant, doit être perceptible comme un jalon franchi, pas comme un simple changement d'écran.

L'histoire ne se raconte pas par un texte narratif affiché au client. Elle se raconte par la cohérence de ce que le Conseiller choisit de dire à chaque étape, et par le fait qu'il se souvient toujours de ce qui précède. Un directeur de mission qui oublie ce qui s'est passé hier ne raconte pas une histoire — il improvise des instructions isolées. Le parcours, lui, relie toujours l'instant présent à ce qui a été accompli avant, et à ce qui viendra après.

---

## 9. Quels sont les principes absolus du parcours d'accueil ?

1. **Un seul objectif à la fois.** Le Chapitre 1 — Le Conseiller ne poursuit jamais deux missions simultanées.

2. **Une seule action prioritaire.** Toute autre action possible existe en retrait, jamais en concurrence visuelle ou cognitive avec la principale. Depuis DEC-029, cela ne signifie plus qu'une seule carte est cliquable dans le Chapitre 2 : toute étape atteinte reste accessible pour revenir, corriger ou compléter. Ce qui reste absolu, c'est que le Conseiller (Chapitre 1) désigne toujours une seule priorité à la fois, et que les autres espaces ne lui font jamais concurrence visuellement — cf. Article VII.

3. **Aucune ambiguïté sur la situation actuelle.** Le client ne doit jamais avoir à interpréter un état. Il doit le comprendre.

4. **Toujours expliquer pourquoi.** Un état sans raison est une source d'angoisse. La raison précède ou accompagne toujours le constat.

5. **Toujours annoncer la suite.** Aucun état n'est terminal tant que la relation entre le client et Fiscal AI n'est pas close pour de bon.

6. **Ne jamais exposer un vide.** Un chapitre sans donnée ni action visible n'est jamais neutre pour le client — il est anxiogène. Un début de chemin doit toujours remplacer une absence d'information.

7. **Ne jamais faire porter au client la charge de se souvenir.** Le parcours est la mémoire externe du dossier. Si le client doit se rappeler quoi que ce soit d'une visite à l'autre, le parcours a échoué.

8. **Construire la valeur par paliers, jamais d'un bloc.** Chaque information sensible (estimation, résultat, liasse, documents) est révélée au moment où elle produit le plus d'effet, jamais plus tôt par facilité technique, jamais plus tard par excès de prudence commerciale.

9. **Ne jamais traiter un aboutissement comme une fin absolue.** Le paiement, le dépôt, l'archivage sont chacun l'ouverture d'une étape suivante, jamais une clôture silencieuse.

10. **Rester lisible en moins de trente secondes, à tout instant du cycle fiscal.** Le Chapitre 1 doit être conçu pour un client qui ne revient qu'une fois par semaine, jamais pour un client qui l'aurait sous les yeux en continu.

---

## 10. Comment reconnaître un mauvais parcours d'accueil ?

Un mauvais parcours se reconnaît à un seul test, dérivé du test de [[UXP-003 — Le principe de guidage]] et appliqué spécifiquement au Chapitre 1 — Le Conseiller :

> **"Un client qui n'ouvre que ce chapitre, une fois par semaine, et ne lit que lui, sait-il, en moins de trente secondes, où il en est, pourquoi, ce qu'il doit faire, et ce qui va se passer ensuite ?"**

Si la réponse est non à n'importe lequel de ces quatre éléments, le parcours échoue — quelle que soit la qualité de sa présentation.

### Checklist de validation

- [ ] La situation actuelle est compréhensible sans effort d'interprétation.
- [ ] La raison de cette situation est explicite, pas seulement le constat.
- [ ] Une action unique est proposée, ou l'absence d'action attendue est explicitement confirmée.
- [ ] La suite est annoncée, même si elle ne dépend pas d'une action du client.
- [ ] Aucune information secondaire ne dispute visuellement ou cognitivement l'attention portée aux trois informations essentielles du Chapitre 1.
- [ ] Aucun état du dossier n'est présenté sans que le client sache ce qu'il signifie pour lui.
- [ ] Le parcours ne demande jamais au client de se souvenir de sa dernière visite.
- [ ] Aucun palier de valeur (estimation, résultat, liasse, documents) n'est révélé avant ou après le moment qui en maximise l'effet.
- [ ] Un aboutissement (paiement, dépôt, archivage) est toujours suivi d'une ouverture, jamais d'un silence.
- [ ] Le parcours reste intelligible pour un client qui ne l'a pas visité depuis plusieurs semaines.

Un parcours qui échoue à un seul de ces points n'est pas un mauvais détail d'exécution. C'est une mission mal remplie.

---

## 11. Émotion fondamentale du Chapitre 2 — Les Espaces de travail (DEC-037)

Contrairement aux autres sections de ce document, qui portent sur le parcours dans son ensemble, celle-ci documente un travail mené spécifiquement sur la mise en scène du Chapitre 2 — engagé après la révision de sa représentation visuelle (ADR-007, DEC-034 → DEC-035).

**Le problème humain.** *« Je ne suis plus seul face à ça. »* — la peur précise que ce chapitre doit apaiser : celle d'affronter seul une obligation administrative qu'on ne maîtrise pas.

**L'émotion recherchée.** *« Je me sens accompagné. »* — avec une clause indissociable : accompagné ne signifie jamais dépossédé. L'utilisateur reste acteur de sa déclaration.

Cette émotion est désormais le sommet d'une décomposition à cinq couches, retenue comme méthode pour achever la mise en scène du chapitre :

```
Émotion       — Je me sens accompagné, sans être dépossédé (DEC-037)
   ↓
Relation      — Fiscal AI prépare, l'utilisateur ne s'organise jamais lui-même (DEC-036)
   ↓
Gestes        — présenter, rapprocher, retirer, ranger, rappeler (ADR-007)
   ↓
Composition   — disposition spatiale des cartes — non tranchée
   ↓
Métaphore     — lieu invisible de l'interaction — non tranchée
```

Toute proposition de Composition ou de Métaphore doit désormais être jugée d'abord sur sa capacité à faire ressentir l'émotion ci-dessus — la cohérence interne (physique du lieu, lisibilité des gestes qu'il héberge) reste un critère de sélection parmi les options qui passent ce premier filtre, jamais un critère qui s'y substitue.

Une image de référence a été retenue comme North Star émotionnelle, spatiale et narrative (DEC-038), et l'architecture technique capable de la produire — six couches indépendantes, dont un Lighting System qui isole l'atmosphère de la géométrie (DEC-039) — est actée par ADR-009. La forme visuelle définitive reste une question d'implémentation, pas encore gelée au niveau de ce document.

---

## État d'implémentation — septembre 2026

*Cette section décrit l'écart entre l'intention UX ci-dessus et le code livré sur `sprint/dashboard-narrative-premium` au 01/09/2026. Elle ne modifie pas les principes — voir DECISIONS.md.md, note septembre 2026, pour le statut « dette transitoire » du carousel.*

### Chapitre 1 — Le Conseiller

**Aligné :**

- Bouton principal scroll vers Chapitre 2, sans ouverture directe d'une page métier (DEC-026).
- Deux cartes à responsabilités distinctes, ratio desktop ~70/30 (DEC-028, DEC-032).
- Hero et observation issus de `resolveDashboardHeroState` (esprit DEC-028 — source unique pour la carte principale).
- Compléments Conseiller en retrait, consultables à la demande (DEC-027 partiel).

**Écarts mineurs :**

- Formulations et scénarios du Conseiller encore partiellement hérités du tunnel historique (chantier Conversation System, DEC-031, non clos).

### Chapitre 2 — Les Espaces de travail

**Aligné :**

- Modèle de progression : étapes atteintes restent accessibles ; états « À venir » sans cadenas (DEC-029 partiel).
- Le Conseiller (Chapitre 1) continue de désigner la priorité via `resolveDashboardHeroState`.

**Écart majeur — dette transitoire :**

- **Implémenté :** carousel horizontal (`DashboardWorkflow`, `workflow-carousel-engine`) — commit `09ec232`.
- **Cible normative :** ADR-007 / DEC-035 / v2.2–v2.3 ci-dessus — pas de carousel comme modèle final ; cinq gestes ; scène à six couches (ADR-009).
- **Exploration cible :** lab `/lab/advisor-scene` (`2120f58`) — prototype ADR-009 isolé, non branché sur `/dashboard`.

Ce n'est pas une contradiction non documentée : c'est une implémentation intermédiaire en attente d'arbitrage produit (itération carousel vs migration scène).

### Chapitre 3 — Le Coffre-fort Fiscal AI

**Aligné :**

- Récit de confiance avant la liste documentaire (DEC-030 partiel).
- Chapitre intégré au scroll narratif trois panneaux.

**Non livré :**

- Regroupement par exercice fiscal.
- Onglets par exercice uniquement si plusieurs exercices existent (DEC-030).
- `variant="flow"` pour Ch3 (DEC-033) — le code utilise `variant="panel"` comme Ch1/Ch2.

### Références code (indicatives, non exhaustives)

- `src/components/lmnp/dashboard/DashboardHome.tsx`
- `src/components/lmnp/dashboard/DashboardConseillerSection.tsx`
- `src/components/lmnp/dashboard/DashboardWorkflow.tsx`
- `src/components/lmnp/dashboard/VaultSection.tsx`
- `src/lab/advisor-scene/` (exploration ADR-009)

---

## Synthèse

```
Le parcours d'accueil n'est pas un résumé.
Le parcours d'accueil n'est pas un workflow.
Le parcours d'accueil n'est pas une homepage.

Le parcours d'accueil est le directeur de mission du client,
porté par trois chapitres plein écran :

Le Conseiller → Les Espaces de travail → Le Coffre-fort Fiscal AI

Le Chapitre 1 connaît la situation, explique la raison, désigne l'action, annonce la suite.

Sa mission change à chaque état du dossier.
Sa structure ne change jamais : situation → raison → action → suite.

Test de validation —
"Si le client ne lit que le Chapitre 1, une fois par semaine,
sait-il où il en est, pourquoi, ce qu'il doit faire, et ce qui vient ensuite ?"
```

---

*Référence : UXP-004 v2.3 — Antoine Forni — 2026-07-10 (évolution de v2.2, v2.1 et v2.0, 2026-07-08, elle-même évolution de v1.0, 2026-07-02)*
*Documents parents : [[UXP-001 Parcours psychologique client]] — [[UXP-002 — Le moment de la récompense]] — [[UXP-003 — Le principe de guidage]] — [Article VII — Design](../03%20-%20Produit/Fiscal%20AI%20Constitution/07%20-%20Design.md)*
