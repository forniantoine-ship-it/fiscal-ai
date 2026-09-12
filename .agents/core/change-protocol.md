# Change Protocol

## Protocole standard

1. Définir le périmètre.
2. Relever l'état Git.
3. Identifier les fichiers concernés.
4. Comprendre le comportement actuel.
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
