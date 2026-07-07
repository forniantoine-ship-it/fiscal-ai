# UXP-004 — Le Dashboard

> Ce document définit la mission du Dashboard de Fiscal AI, à chaque instant de la vie du dossier.
> Il ne décrit pas une interface. Il décrit une intention.
> Références : [[UXP-001 Parcours psychologique client]] — [[UXP-002 — Le moment de la récompense]] — [[UXP-003 — Le principe de guidage]]

Version : 1.0
Date : 2026-07-02

---

## Principe directeur

Le Dashboard n'est pas un écran de synthèse.

Le Dashboard n'est pas un tableau de bord.

Le Dashboard n'est pas une page d'accueil.

Le Dashboard est le directeur de mission du client.

Un directeur de mission ne raconte pas tout ce qu'il sait. Il ne montre pas tout ce qui existe. Il dit à la personne qu'il accompagne trois choses, et seulement trois : où elle en est, pourquoi elle en est là, ce qu'elle doit faire maintenant. Puis il annonce ce qui va se passer ensuite, pour qu'elle n'ait jamais à se demander si elle a été oubliée.

Le Dashboard porte cette responsabilité en continu, du premier jour où le client crée son dossier jusqu'au jour où il archive sa déclaration et referme l'année fiscale.

Un client peut n'ouvrir Fiscal AI qu'une fois par semaine, parfois moins. Le Dashboard doit donc fonctionner comme un point de reprise : chaque visite doit reconstituer instantanément la situation, sans que le client ait à se souvenir de ce qu'il faisait la dernière fois.

**Test ultime du document** : si un client n'ouvre le Dashboard qu'une seule fois par semaine et ne lit que cette page, il doit, en moins de trente secondes, comprendre où il en est, pourquoi il en est là, ce qu'il doit faire maintenant, et ce qui se passera ensuite. Il ne doit jamais se sentir perdu.

---

## 1. Pourquoi le Dashboard existe-t-il ?

Le Dashboard existe parce que le client n'a pas une relation ponctuelle avec Fiscal AI. Il a une relation qui dure une saison fiscale entière, parfois plusieurs années.

Le tunnel de déclaration (décrit dans [[UXP-001 Parcours psychologique client]]) est un moment concentré : vingt minutes, une intention, un aboutissement. Le Dashboard, lui, couvre tout le reste du temps — les semaines d'attente, les retours ponctuels, les années suivantes.

Sans Dashboard, le client serait seul entre deux visites. Il devrait se souvenir lui-même de ce qu'il a fait, de ce qui reste à faire, de ce qui l'attend. Cette charge mentale n'appartient pas au client. Elle appartient à Fiscal AI.

Le Dashboard existe pour porter cette charge à la place du client.

Il existe pour qu'à chaque retour, aussi espacé soit-il, le client retrouve immédiatement le fil — sans effort de mémoire, sans reconstruction mentale, sans avoir à rouvrir des documents pour comprendre où il en est.

Le Dashboard est la mémoire externe du client sur sa propre obligation fiscale.

---

## 2. Quelle promesse fait-il au client ?

Le Dashboard fait une seule promesse, répétée sous des formes différentes selon le moment :

> **"Vous n'avez rien à retenir. Nous savons où vous en êtes. Voici ce qui compte maintenant."**

Cette promesse a trois conséquences directes.

**Elle décharge.** Le client n'a pas à tenir un calendrier fiscal dans sa tête, ni à se souvenir des pièces qu'il a fournies ou non.

**Elle oriente.** Le client n'a jamais à choisir entre plusieurs priorités. Le Dashboard a déjà fait ce tri.

**Elle rassure sur la durée.** La promesse ne porte pas seulement sur l'instant présent. Elle porte sur la continuité : Fiscal AI reste présent après le paiement, après le dépôt, d'une année sur l'autre. Le Dashboard est la preuve visible que la relation ne s'arrête pas à la transaction.

Cette promesse est cohérente avec [[UXP-003 — Le principe de guidage]] : un produit qui ne s'arrête jamais au résultat a besoin d'un lieu où cette continuité se manifeste physiquement. Ce lieu est le Dashboard.

---

## 3 & 4. Ce que le client doit ressentir et la mission du Dashboard, selon l'état du dossier

Le Dashboard n'a pas une mission fixe. Sa mission change avec l'état du dossier, mais son architecture ne change jamais : une situation, une raison, une action, une suite.

Chaque état ci-dessous répond à la même question — quelle est la mission du Dashboard à cet instant précis ? — pas à la question de l'apparence.

---

### État 1 — Premier jour

**Ce que le client ressent en arrivant**
Un mélange d'incertitude et d'attente. Il vient de créer son dossier. Il ne sait pas encore ce que représente concrètement l'expérience à venir.

**Ce qu'il doit ressentir en repartant**
Qu'un chemin existe, qu'il est court, et qu'il vient d'en franchir le premier pas.

**Mission du Dashboard**
Transformer une intention vague ("je dois déclarer mon LMNP") en un chemin concret et amorcé. Le Dashboard ne montre encore aucun résultat, parce qu'il n'y en a pas. Sa mission est de convertir l'inconnu en une suite d'étapes lisibles, et de pousser vers la première d'entre elles.

Le Dashboard ne doit jamais, à ce stade, donner au client l'impression qu'il regarde une page vide. Une page vide est un vide. Une page qui annonce un chemin est un début.

---

### État 2 — Analyse en cours (le dossier se construit)

**Ce que le client ressent en arrivant**
Il revient après avoir laissé le dossier en suspens — parfois une pièce à retrouver, parfois simplement un manque de temps. Il craint d'avoir à tout reprendre depuis le début.

**Ce qu'il doit ressentir en repartant**
Que rien n'a été perdu, qu'il reprend exactement là où il s'était arrêté, et qu'il progresse réellement.

**Mission du Dashboard**
Restaurer la continuité. La mission n'est pas d'afficher un pourcentage d'avancement pour informer — c'est un effet secondaire. La mission réelle est de dire au client, sans qu'il ait à chercher : "voici ce qu'il vous reste à faire, et c'est plus court que ce que vous croyez."

Le Dashboard doit ici combattre un risque psychologique précis : l'abandon par lassitude. Un dossier interrompu perd de sa valeur perçue à chaque semaine qui passe si personne ne relance l'élan. Le Dashboard est cette relance.

---

### État 3 — Corrections (une information manque ou est incohérente)

**Ce que le client ressent en arrivant**
Une inquiétude diffuse : "qu'est-ce qui ne va pas ?" Ce moment est fragile — un client mal guidé ici peut se sentir en échec et abandonner.

**Ce qu'il doit ressentir en repartant**
Que la demande est légitime, précise, et facile à satisfaire. Jamais qu'il a commis une faute.

**Mission du Dashboard**
Transformer un blocage en une tâche simple. La mission n'est pas de signaler un problème — n'importe quel système sait signaler un problème. La mission est de le désamorcer immédiatement : dire quoi apporter, pourquoi c'est nécessaire, et combien de temps cela prendra.

Une correction n'est jamais présentée comme un échec du client. Elle est présentée comme la dernière pièce d'un puzzle presque terminé.

---

### État 4 — Attente (le moteur travaille)

**Ce que le client ressent en arrivant**
Une impatience teintée d'espoir. Il a fini sa part. Il attend maintenant la preuve que cela en valait la peine.

**Ce qu'il doit ressentir en repartant**
Que quelque chose de sérieux est en train de se produire pour lui, et que cela ne prendra pas longtemps.

**Mission du Dashboard**
Habiter l'attente au lieu de la vider. Un client qui ne voit rien pendant l'attente projette ses propres doutes dans le silence. Le Dashboard doit occuper cet espace avec du sens, pas avec de l'animation : expliquer, en une phrase compréhensible, ce qui est en train d'être vérifié ou calculé pour lui.

L'attente n'est jamais un défaut à cacher. C'est la preuve qu'un travail réel a lieu. Elle doit être nommée, jamais dissimulée sous un silence.

---

### État 5 — Résultat prêt (avant paiement)

**Ce que le client ressent en arrivant**
De l'anticipation à son maximum. C'est l'instant que tout le parcours précédent a préparé.

**Ce qu'il doit ressentir en repartant**
Une certitude : ce qu'il a sous les yeux est réel, lui appartient déjà en substance, et ne demande plus qu'à être confirmé.

**Mission du Dashboard**
Faire culminer la valeur perçue avant de proposer l'échange. C'est l'état le plus sensible du Dashboard, celui qui rejoint directement le moment de décision d'achat identifié dans [[UXP-001 Parcours psychologique client]]. Le Dashboard ne doit ni précipiter ni retenir : il doit exposer la valeur (le résultat, la liasse en devenir) avec une clarté totale, puis proposer une suite unique et évidente.

---

### État 6 — Paiement

**Ce que le client ressent en arrivant**
Une décision déjà prise intérieurement, qu'il vient formaliser. Ce n'est plus un moment de doute — c'est un moment d'exécution.

**Ce qu'il doit ressentir en repartant**
Que l'acte qu'il vient d'accomplir ouvre quelque chose, plutôt qu'il ne referme une transaction.

**Mission du Dashboard**
Ne jamais traiter le paiement comme une fin de parcours. Conformément à la règle 5 de [[UXP-003 — Le principe de guidage]], le Dashboard doit immédiatement rediriger l'attention du client vers ce qui s'ouvre : son dossier complet, la suite concrète. Le Dashboard ne célèbre pas une vente. Il accueille un client dans la phase suivante de sa relation avec Fiscal AI.

---

### État 7 — Dossier terminé (post-dépôt, archivé)

**Ce que le client ressent en arrivant**
Un sentiment d'accomplissement qui, livré à lui-même, s'estompe vite. Sans rien pour l'entretenir, l'expérience redevient un souvenir neutre.

**Ce qu'il doit ressentir en repartant**
Que l'année n'est pas simplement close, mais rangée — et que la suivante est déjà anticipée, sans qu'il ait à s'en inquiéter avant l'heure.

**Mission du Dashboard**
Clore sans abandonner. Le Dashboard confirme que le dossier est complet, accessible, protégé dans le temps — et annonce, sans anxiété ni urgence prématurée, quand et comment la prochaine échéance reviendra. Il transforme un aboutissement ponctuel en le premier chapitre d'une relation qui se répète chaque année.

Un dossier terminé qui ne dit rien sur la suite laisse le client seul face à l'année prochaine. Un dossier terminé qui annonce la suite construit une fidélité qui ne dépend d'aucune relance commerciale.

---

## 5. Quelles informations doivent être visibles immédiatement ?

Le Dashboard résiste à la tentation de tout montrer. Il hiérarchise volontairement.

Trois informations, et seulement trois, doivent être visibles sans aucune action du client :

**1. La situation actuelle du dossier**, exprimée en une phrase compréhensible sans vocabulaire fiscal ni technique — pas un statut interne, une phrase humaine.

**2. La raison de cette situation**, en une ligne — pourquoi le dossier en est là, ce qui vient de se passer ou ce qui est en cours.

**3. L'action unique attendue du client à cet instant**, si une action est attendue — sinon, l'annonce claire de ce qui va se passer sans lui.

Rien d'autre ne doit disputer l'attention à ces trois éléments. Toute autre information — historique, détails, documents secondaires, données de contexte — existe, mais en retrait, accessible à qui la cherche, jamais imposée à qui ne la cherche pas.

Ce choix découle directement de la Règle 1 de [[UXP-003 — Le principe de guidage]] : où suis-je, qu'a-t-on fait, quelle est la prochaine action. Le Dashboard est l'endroit où cette règle s'applique de façon la plus stricte, parce que c'est l'endroit où le client revient avec le moins de contexte frais en tête.

---

## 6. Quelles informations ne doivent jamais être visibles en permanence ?

**Le détail des calculs.** Sa présence permanente transforme un accompagnement en tableau de comptable. Le client doit savoir qu'il peut vérifier — voir [[UXP-002 — Le moment de la récompense]], Document 5 — mais pas être confronté à ce détail par défaut. La confiance se construit par la disponibilité de la preuve, pas par son exposition constante.

**L'historique complet des actions passées.** Un historique exhaustif en permanence dilue l'attention sur ce qui compte maintenant. Il doit être consultable, jamais imposé.

**Les états d'autres exercices fiscaux tant qu'ils ne sont pas pertinents pour l'action en cours.** Multiplier les dossiers visibles simultanément fragmente l'attention. Le Dashboard ne doit exposer en avant-plan qu'un seul dossier actif à la fois — celui qui a besoin du client maintenant.

**Toute proposition commerciale non liée à l'action prioritaire du moment.** Une sollicitation parallèle à la mission du moment revient à faire concurrence à sa propre priorité. Voir Règle 3 de [[UXP-003 — Le principe de guidage]] : une seule action mise en avant à la fois.

**Les indicateurs internes du moteur ou du système.** Le client n'a pas à connaître l'état technique de ce qui travaille pour lui. Il a besoin de savoir ce que cela signifie pour lui, jamais comment cela fonctionne — principe déjà posé dans [[UXP-001 Parcours psychologique client]].

La justification commune à ces exclusions : chaque information rendue visible en permanence dispute l'attention à la mission de l'instant. Le Dashboard qui montre tout ne dirige plus rien.

---

## 7. Comment le Dashboard construit-il progressivement la valeur perçue ?

La valeur ne doit jamais être révélée d'un bloc. Elle se construit par paliers, chacun préparant le suivant.

**L'estimation** apparaît tôt, dès que le dossier contient assez d'éléments pour esquisser un ordre de grandeur. Elle n'est pas présentée comme un résultat final, mais comme une preuve précoce que le système comprend déjà la situation du client. Elle crée l'engagement : "ça avance, et ça me concerne déjà."

**Le résultat** apparaît lorsque le dossier est complet, avant tout accès à la liasse elle-même. Il constitue la première preuve chiffrée et stable. Il doit être montré seul, sans être immédiatement noyé par le document qui le contient, pour que le client ait le temps de le mesurer, de le comprendre, de se l'approprier mentalement.

**La liasse** n'apparaît qu'ensuite, comme la matérialisation du résultat déjà digéré. C'est le pic de valeur perçue, documenté dans [[UXP-001 Parcours psychologique client]] : le moment où la décision d'achat se forme réellement. Le Dashboard ne doit jamais montrer la liasse avant que le client ait eu le temps d'intégrer le résultat qu'elle contient — sinon les deux preuves se confondent et s'affaiblissent mutuellement.

**Les documents** (au sens du dossier complet décrit dans [[UXP-002 — Le moment de la récompense]]) n'apparaissent qu'après l'acte de paiement. Leur venue tardive n'est pas une restriction commerciale — c'est une construction narrative : ils sont la preuve que l'engagement du client a ouvert quelque chose de plus large que ce qu'il avait déjà vu.

Cette séquence — estimation, résultat, liasse, documents — reproduit à l'échelle du Dashboard la courbe de confiance déjà identifiée dans [[UXP-001 Parcours psychologique client]] : chaque palier doit être une preuve tangible avant que la suivante ne soit montrée. Montrer un palier trop tôt dilue l'effet du suivant. Montrer un palier trop tard frustre inutilement une attente déjà mûre.

---

## 8. Le Dashboard doit-il raconter une histoire ?

Oui. Sans histoire, le Dashboard n'est qu'un état — une photographie sans direction. Avec une histoire, il devient un récit dans lequel le client avance.

**L'histoire racontée par le Dashboard est celle-ci** :

> *"Vous n'êtes pas seul face à une obligation administrative. Quelqu'un — quelque chose — s'occupe de votre dossier avec vous, étape après étape, jusqu'à ce qu'il soit clos. Et cela recommencera, plus facilement, l'année prochaine."*

Ce n'est pas l'histoire d'un outil qui produit un document. C'est l'histoire d'un client accompagné d'un début à une fin, puis reconduit vers un nouveau cycle.

**Comment le client doit avoir l'impression d'avancer**

Il ne doit jamais ressentir l'avancement comme une jauge qui se remplit. Il doit le ressentir comme une suite de petites victoires nommées : une pièce fournie, une inquiétude levée, un chiffre confirmé, un document obtenu. Chaque passage d'un état à un autre du Dashboard doit être perceptible comme un jalon franchi, pas comme un simple changement d'écran.

L'histoire ne se raconte pas par un texte narratif affiché au client. Elle se raconte par la cohérence de ce que le Dashboard choisit de dire à chaque étape, et par le fait qu'il se souvient toujours de ce qui précède. Un directeur de mission qui oublie ce qui s'est passé hier ne raconte pas une histoire — il improvise des instructions isolées. Le Dashboard, lui, relie toujours l'instant présent à ce qui a été accompli avant, et à ce qui viendra après.

---

## 9. Quels sont les principes absolus du Dashboard ?

1. **Un seul objectif à la fois.** Le Dashboard ne poursuit jamais deux missions simultanées.

2. **Une seule action prioritaire.** Toute autre action possible existe en retrait, jamais en concurrence visuelle ou cognitive avec la principale.

3. **Aucune ambiguïté sur la situation actuelle.** Le client ne doit jamais avoir à interpréter un état. Il doit le comprendre.

4. **Toujours expliquer pourquoi.** Un état sans raison est une source d'angoisse. La raison précède ou accompagne toujours le constat.

5. **Toujours annoncer la suite.** Aucun état du Dashboard n'est terminal tant que la relation entre le client et Fiscal AI n'est pas close pour de bon.

6. **Ne jamais exposer un vide.** Un Dashboard sans donnée ni action visible n'est jamais neutre pour le client — il est anxiogène. Un début de chemin doit toujours remplacer une absence d'information.

7. **Ne jamais faire porter au client la charge de se souvenir.** Le Dashboard est la mémoire externe du dossier. Si le client doit se rappeler quoi que ce soit d'une visite à l'autre, le Dashboard a échoué.

8. **Construire la valeur par paliers, jamais d'un bloc.** Chaque information sensible (estimation, résultat, liasse, documents) est révélée au moment où elle produit le plus d'effet, jamais plus tôt par facilité technique, jamais plus tard par excès de prudence commerciale.

9. **Ne jamais traiter un aboutissement comme une fin absolue.** Le paiement, le dépôt, l'archivage sont chacun l'ouverture d'une étape suivante, jamais une clôture silencieuse.

10. **Rester lisible en moins de trente secondes, à tout instant du cycle fiscal.** Le Dashboard doit être conçu pour un client qui ne revient qu'une fois par semaine, jamais pour un client qui l'aurait sous les yeux en continu.

---

## 10. Comment reconnaître un mauvais Dashboard ?

Un mauvais Dashboard se reconnaît à un seul test, dérivé du test de [[UXP-003 — Le principe de guidage]] et appliqué spécifiquement au Dashboard :

> **"Un client qui n'ouvre cette page qu'une fois par semaine et ne lit qu'elle sait-il, en moins de trente secondes, où il en est, pourquoi, ce qu'il doit faire, et ce qui va se passer ensuite ?"**

Si la réponse est non à n'importe lequel de ces quatre éléments, le Dashboard échoue — quelle que soit la qualité de sa présentation.

### Checklist de validation

- [ ] La situation actuelle est compréhensible sans effort d'interprétation.
- [ ] La raison de cette situation est explicite, pas seulement le constat.
- [ ] Une action unique est proposée, ou l'absence d'action attendue est explicitement confirmée.
- [ ] La suite est annoncée, même si elle ne dépend pas d'une action du client.
- [ ] Aucune information secondaire ne dispute visuellement ou cognitivement l'attention portée aux trois informations essentielles.
- [ ] Aucun état du dossier n'est présenté sans que le client sache ce qu'il signifie pour lui.
- [ ] Le Dashboard ne demande jamais au client de se souvenir de sa dernière visite.
- [ ] Aucun palier de valeur (estimation, résultat, liasse, documents) n'est révélé avant ou après le moment qui en maximise l'effet.
- [ ] Un aboutissement (paiement, dépôt, archivage) est toujours suivi d'une ouverture, jamais d'un silence.
- [ ] Le Dashboard reste intelligible pour un client qui ne l'a pas visité depuis plusieurs semaines.

Un Dashboard qui échoue à un seul de ces points n'est pas un mauvais détail d'exécution. C'est une mission mal remplie.

---

## Synthèse

```
Le Dashboard n'est pas un résumé.
Le Dashboard n'est pas un workflow.
Le Dashboard n'est pas une homepage.

Le Dashboard est le directeur de mission du client :
il connaît la situation, explique la raison, désigne l'action, annonce la suite.

Sa mission change à chaque état du dossier.
Sa structure ne change jamais : situation → raison → action → suite.

Test de validation —
"Si le client ne lit que cette page, une fois par semaine,
sait-il où il en est, pourquoi, ce qu'il doit faire, et ce qui vient ensuite ?"
```

---

*Référence : UXP-004 v1.0 — Antoine Forni — 2026-07-02*
*Documents parents : [[UXP-001 Parcours psychologique client]] — [[UXP-002 — Le moment de la récompense]] — [[UXP-003 — Le principe de guidage]]*
