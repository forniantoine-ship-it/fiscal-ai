# Fiscal Proof Standard

Une affirmation fiscale n'est pas démontrée uniquement parce que « le code le fait » ou « un test passe ».

Lorsque pertinent, rechercher une chaîne de preuve :

```
source / règle
→ donnée métier
→ transformation
→ projection fiscale
→ champ déclaratif
→ rendu
→ test
```

## Types de preuve à distinguer

- **preuve métier** — justification de la règle ;
- **preuve technique** — implémentation correcte ;
- **preuve documentaire** — concordance avec référence appropriée ;
- **preuve de rendu** — sortie effectivement produite ;
- **preuve de non-régression** — absence d'impact non souhaité.

## Si une règle fiscale est incertaine

NE PAS INVENTER. La remonter comme point nécessitant arbitrage humain.
