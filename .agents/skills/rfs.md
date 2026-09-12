# Skill — RFS

RFS est une projection déclarative. Éviter d'introduire dans cette couche une logique métier qui devrait être calculée en amont.

Chaque mapping doit être traçable.

## Surveiller notamment

- double comptage ;
- champ non mappé ;
- mauvais signe ;
- fallback silencieux ;
- dépendances année 1 / années suivantes ;
- divergence entre donnée métier et projection.

Ne pas documenter toutes les cases ici — ce Skill reste une interface légère.
