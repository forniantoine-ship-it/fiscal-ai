# Change Protocol

## Protocole standard

1. Définir le périmètre.
2. Relever l'état Git.
3. Identifier les fichiers concernés.
4. Comprendre le comportement actuel.

   Un audit, plan ou document daté n'est jamais une preuve de l'état
   actuel du code. Avant d'exécuter un chantier issu d'un document
   antérieur, vérifier que HEAD n'a pas déjà intégré des correctifs
   postérieurs — via `git log`, une recherche ciblée, la lecture du code
   actuel, et les tests existants pertinents. Le document historique
   reste valable comme preuve de l'état à une date donnée, jamais seul
   comme preuve de l'état courant.

5. Identifier l'attendu.
6. Modifier uniquement si le mode l'autorise.
7. Tester localement.
8. Élargir progressivement les tests.
9. Examiner le diff.
10. Produire les preuves.

## MODE AUDIT

READ-ONLY. Interdit de modifier.

Produire :

```
constat
→ preuve
→ impact
→ recommandation
```

## MODE BUILDER

Modification autorisée uniquement dans le périmètre.

Principe : *smallest correct change*.

Tests obligatoires. Pas de commit sauf demande explicite.

## MODE CHECKPOINT

Vérifier :

- fichiers modifiés ;
- diff ;
- tests ;
- non-régression pertinente ;
- dette historique éventuelle.

Commit uniquement si explicitement demandé.

## Knowledge & Skill Check (obligatoire en fin de mission)

Avant de clore toute mission (tous modes), répondre dans le compte rendu :

**A. Cette mission a-t-elle produit une connaissance stable et réutilisable ?**

Si NON : ne rien capitaliser.

**B. Si OUI, quelle est la nature de cette connaissance ?**

- connaissance métier/fiscale durable → candidate pour le Knowledge System (`knowledge/`) ;
- méthode opérationnelle réutilisable → candidate pour enrichissement d'un Skill ;
- règle générale de fonctionnement des agents → candidate pour `.agents/core` ;
- information utile uniquement à la mission courante → ne pas conserver.

**C. Si un Skill doit évoluer**, choisir explicitement entre : enrichir / fusionner / remplacer / créer — la création reste le dernier choix (voir [skill-governance.md](skill-governance.md)).

**Important — découverte ≠ vérité.** Une hypothèse ou conclusion non suffisamment prouvée ne doit jamais être promue automatiquement en connaissance persistante. Pour les connaissances fiscales :

```
découverte
→ preuve / source / validation (voir fiscal-proof-standard.md)
→ connaissance canonique
→ utilisation éventuelle par un Skill
```
