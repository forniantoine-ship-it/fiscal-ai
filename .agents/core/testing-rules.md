# Testing Rules

Principe : tester du plus local vers le plus large.

Ordre indicatif :

```
test ciblé
→ capability
→ projection déclarative
→ PDF si concerné
→ non-régression
→ typecheck/build si pertinent
```

- Ne pas lancer immédiatement toutes les suites si ce n'est pas nécessaire.
- Ne jamais modifier un test uniquement pour faire disparaître un échec.
- Lorsqu'un test échoue, distinguer : régression / dette historique / test obsolète / problème environnement.
