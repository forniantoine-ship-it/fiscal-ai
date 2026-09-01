# UXP-003 — Le principe de guidage

> Ce document définit le principe fondateur de l'expérience Fiscal AI.
> Il s'applique à l'ensemble du produit : interfaces, assistants, documents remis, Dashboard, et futurs produits.
> Références : [[UXP-001 Parcours psychologique client]] — [[UXP-002 — Le moment de la récompense]]

Version : 1.0
Date : 2026-07-02

---

## Principe directeur

Fiscal AI ne s'arrête jamais au résultat.

La plupart des logiciels considèrent leur mission accomplie lorsqu'ils produisent un résultat.

Fiscal AI considère chaque résultat comme le début d'une nouvelle étape.

Le client ne doit jamais se retrouver seul face à un résultat sans savoir ce qu'il doit faire ensuite.

À chaque instant de l'expérience Fiscal AI, le client doit savoir exactement où il en est, ce qui vient d'être fait pour lui, et quelle est la prochaine action à entreprendre.

---

## Pourquoi ce principe est fondamental

### La frustration qu'il élimine

La frustration la plus silencieuse dans les logiciels n'est pas l'erreur technique.

C'est le vide.

Le moment où l'interface affiche un résultat et s'arrête là.

Le client se retrouve avec une liasse téléchargée, un calcul affiché, une étape complétée — et aucune indication sur ce qu'il doit faire maintenant.

Ce vide génère de l'anxiété. Il crée un doute : "Est-ce que j'ai tout fait correctement ? Est-ce fini ? Qu'est-ce que j'ai raté ?"

Ce doute est incompatible avec la promesse de Fiscal AI.

Un client qui doute après avoir utilisé Fiscal AI est un client qui ne recommande pas Fiscal AI.

### Ce que ce principe construit

Un client qui ne se pose jamais la question "qu'est-ce que je fais maintenant ?" est un client confiant.

Un client confiant est un client qui revient.

Un client qui revient est un client qui recommande.

Le guidage n'est pas une fonctionnalité. C'est la posture fondamentale du produit.

---

## Les cinq règles de conception

---

### Règle 1 — Chaque écran répond à trois questions

Chaque écran de Fiscal AI doit, explicitement ou implicitement, répondre à ces trois questions :

**Où suis-je ?**
Le client doit savoir à quelle étape il se trouve, dans quel parcours, et quelle proportion de chemin il a parcouru.

**Qu'est-ce qui vient d'être fait ?**
Le client doit comprendre ce que Fiscal AI vient d'accomplir pour lui. Pas un message générique de confirmation. Un résumé lisible de ce qui s'est réellement passé.

**Quelle est la prochaine action ?**
Une seule action doit être proposée. Elle doit être visible, claire et sans ambiguïté.

Un écran qui répond à ces trois questions est un écran complet.

Un écran qui ne répond qu'à deux de ces questions est un écran incomplet, quelle que soit sa qualité visuelle.

---

### Règle 2 — Chaque assistant se termine par une prochaine action

Un assistant Fiscal AI ne se termine jamais par une simple confirmation.

"Vos données sont enregistrées." n'est pas une fin d'assistant.

"Vos données sont enregistrées. Voici la prochaine étape." est une fin d'assistant.

La dernière interaction de chaque assistant doit proposer une action concrète, immédiatement actionnable.

Cette action n'est pas une suggestion. C'est une invitation directe à continuer.

Exemples acceptables :
- "Votre calcul est prêt. Consultez votre résultat fiscal →"
- "Vos charges sont enregistrées. Passez aux revenus →"
- "Votre liasse est téléchargée. Voici comment la déposer →"

Exemples non acceptables :
- "Enregistrement réussi."
- "Étape complétée."
- "Merci."

---

### Règle 3 — Une seule prochaine action est mise en avant

Fiscal AI ne présente jamais plusieurs actions prioritaires simultanément.

Lorsqu'un client arrive sur un écran après avoir accompli quelque chose, une seule action est mise en avant visuellement.

Les autres actions disponibles — modifier, revenir, consulter — existent, mais elles ne concurrencent pas la prochaine action principale.

Le choix paralyse. La clarté libère.

Un client face à trois boutons également visibles doit réfléchir.

Un client face à un bouton principal évident avance.

---

### Règle 4 — Le résultat est le début de la prochaine étape

Fiscal AI ne traite jamais un résultat comme une finalité.

Chaque résultat est une transition, pas une conclusion.

Exemples d'application :

| Résultat produit | Prochaine étape proposée |
|---|---|
| Calcul fiscal affiché | Consulter la prévisualisation de la liasse |
| Liasse générée | Accéder au dossier complet |
| Dossier téléchargé | Lire le guide de dépôt |
| Dépôt effectué | Archiver le dossier pour l'année suivante |
| Dashboard affiché | Identifier l'action prioritaire de la saison |

Un résultat sans transition est un résultat incomplet.

---

### Règle 5 — Le paiement ouvre le dossier, il ne le ferme pas

Le paiement n'est pas la fin de l'expérience Fiscal AI.

Le paiement est le moment où l'expérience commence véritablement.

Avant le paiement, Fiscal AI est un outil de calcul.

Après le paiement, Fiscal AI est un accompagnateur fiscal.

La confirmation de paiement ne doit donc jamais ressembler à une fin de transaction.

Elle doit ressembler à une ouverture.

Elle doit dire au client : "Votre dossier est prêt. Voici ce que vous allez faire maintenant."

Et elle doit l'emmener directement vers la prochaine action : lire la Note de synthèse, consulter le Guide de dépôt, accéder au dossier complet.

L'expérience se termine uniquement lorsque le client a déposé sa déclaration et archivé son dossier.

---

## Comment ce principe influence chaque dimension du produit

---

### Les interfaces

Chaque écran porte la responsabilité de guider le client vers la suite.

Un designer qui conçoit un écran doit se poser la question : "Que fait le client après avoir vu cet écran ?"

Si la réponse n'est pas évidente depuis l'écran lui-même, l'écran est incomplet.

La navigation ne suffit pas. Le guidage actif est différent de la navigation passive.

Un menu de navigation dit : "Voici où vous pouvez aller."

Un guidage actif dit : "Voici où vous devez aller maintenant."

---

### Les assistants

Les assistants Fiscal AI sont des guides, pas des formulaires.

Un formulaire pose des questions et enregistre des réponses.

Un guide accompagne, anticipe, et indique la prochaine étape à chaque moment.

Chaque transition entre les sections d'un assistant doit être active : non pas un simple passage à l'écran suivant, mais une micro-confirmation de ce qui vient d'être accompli et une annonce de ce qui arrive.

---

### Les documents remis au client

Les documents remis après paiement ne sont pas des livrables passifs.

Chacun pointe vers une prochaine action.

La Note de synthèse conclut sur l'étape de dépôt.

Le Guide de dépôt contient des étapes numérotées et actionnables.

La Liasse fiscale est accompagnée d'une instruction claire sur comment la soumettre.

Le Journal des calculs invite à le transmettre à un expert-comptable si nécessaire.

Le Dossier de contrôle explique quoi faire en cas de courrier de l'administration.

Aucun document ne se termine par une information sans prochaine action associée.

---

### Le Dashboard

Le Dashboard de Fiscal AI n'est pas un tableau de bord d'information.

C'est un tableau de bord d'action.

Sa mission principale n'est pas de montrer au client où il en est.

Sa mission principale est de lui dire quoi faire maintenant.

Le Dashboard doit toujours afficher une action prioritaire unique, contextualisée selon la période de l'année fiscale et l'état du dossier du client.

En saison de déclaration : "Votre dossier [année] n'est pas encore déposé. Reprendre →"

En dehors de la saison : "Préparez votre dossier [année+1]. Enregistrer vos revenus →"

Après dépôt : "Votre dossier [année] est archivé. Planifier votre déclaration suivante →"

Le Dashboard ne doit jamais afficher un état neutre sans action associée.

---

### Les futurs produits Fiscal AI

Ce principe s'applique à tout produit construit sous la marque Fiscal AI, quel que soit son périmètre.

Qu'il s'agisse d'un nouveau type de déclaration, d'un outil de simulation, d'un service de conseil ou d'un espace client enrichi, la règle reste identique.

Chaque produit Fiscal AI guide le client jusqu'à la fin de son obligation.

Aucun produit Fiscal AI ne s'arrête au résultat.

---

## Comment reconnaître une mauvaise interface

Une interface est incomplète lorsque l'utilisateur doit réfléchir pour savoir ce qu'il doit faire ensuite.

Ce test est suffisant. Il n'admet pas d'exception.

---

### Les signaux d'une interface incomplète

**Signal 1 — L'écran de fin vide**
L'interface affiche un message de confirmation ou de succès, sans proposer de prochaine action.
Le client lit le message. Et attend.

**Signal 2 — Le choix parallèle**
L'interface propose deux ou trois actions de poids équivalent simultanément.
Le client doit décider laquelle est la bonne. Ce travail appartient à l'interface, pas au client.

**Signal 3 — Le résultat sans contexte**
L'interface affiche un chiffre, un document ou un statut sans expliquer ce qu'il signifie pour la suite.
Le client sait ce qui s'est passé, mais pas ce qu'il doit en faire.

**Signal 4 — La transition muette**
L'interface passe d'une étape à une autre sans transmettre ce qui vient d'être accompli.
Le client avance, mais ne sait pas s'il a bien fait quelque chose ou s'il a simplement changé d'écran.

**Signal 5 — L'assistant qui se ferme**
Un assistant se ferme sur une confirmation neutre.
Le client revient à un état antérieur sans savoir si quelque chose a changé pour lui ou ce qu'il doit faire ensuite.

---

### Le critère de validation

Lors de chaque Feature Cycle, toute nouvelle interface ou toute modification d'interface doit être soumise à ce test en une question :

> **"Si le client ne lit que cet écran, sait-il exactement quoi faire ensuite ?"**

Si la réponse est non, l'interface n'est pas prête.

Ce test s'applique à chaque écran individuellement, pas seulement aux écrans de fin de parcours.

Il s'applique aux états de succès, aux états d'attente, aux états d'erreur, et aux états neutres.

---

### Les états d'erreur sont soumis au même principe

Un message d'erreur qui dit "Une erreur est survenue" est incomplet.

Un message d'erreur qui dit "Une erreur est survenue. Voici ce que vous pouvez faire." est complet.

Les états d'erreur sont des moments où le guidage est encore plus important qu'en situation normale.

Un client bloqué qui ne sait pas quoi faire est un client perdu.

---

## Synthèse

```
Règle 1 — Chaque écran répond à : où suis-je / qu'a-t-on fait / quelle est la prochaine action ?
Règle 2 — Chaque assistant se termine par une prochaine action, jamais par une simple confirmation.
Règle 3 — Une seule prochaine action est mise en avant à la fois.
Règle 4 — Le résultat est le début de la prochaine étape, jamais une fin.
Règle 5 — Le paiement ouvre le dossier et guide le client jusqu'à la fin de son obligation fiscale.

Test de validation — "Si le client ne lit que cet écran, sait-il exactement quoi faire ensuite ?"
```

---

*Référence : UXP-003 v1.0 — Antoine Forni — 2026-07-02*
*Documents parents : [[UXP-001 Parcours psychologique client]] — [[UXP-002 — Le moment de la récompense]]*
