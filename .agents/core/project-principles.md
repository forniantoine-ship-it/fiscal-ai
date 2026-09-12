# Project Principles

Fiscal AI est un assistant déclaratif destiné notamment au LMNP au réel simplifié.

Le système cherche à conserver une chaîne traçable :

```
Document source
→ extraction
→ observation / donnée proposée
→ validation
→ donnée métier
→ écriture
→ transformation
→ projection déclarative
→ sortie
```

## Principes

- Règles fiscales explicables.
- Résultats reproductibles.
- Transformations déterministes autant que possible.
- Traçabilité de bout en bout.
- Séparation entre connaissance métier et implémentation.
- Le comportement actuel du code n'est pas automatiquement la vérité fiscale.
- Un test existant n'est pas automatiquement la vérité fiscale.
- Les références documentaires officielles ne doivent pas être modifiées pour faire correspondre le logiciel.
- Toute incertitude fiscale significative doit être remontée, jamais inventée.

## Knowledge System

Le Knowledge System (`knowledge/`) est la source officielle de vérité métier — voir `knowledge/CLAUDE.md`.
`src/` est l'implémentation de cette vérité, pas l'inverse.
