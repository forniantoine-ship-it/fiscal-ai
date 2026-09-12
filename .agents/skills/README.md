# Skills

Un Skill représente une compétence ciblée. Un agent doit charger uniquement les Skills nécessaires au chantier en cours.

Exemple — chantier Cerfa PDF :

```
project-principles
→ change-protocol
→ fiscal-proof-standard
→ cerfa-pdf
```

Il ne doit **pas** charger `rfs`, `document-extraction`, ou tout autre Skill non concerné.

## Skills disponibles

- [cerfa-pdf.md](cerfa-pdf.md) — rendu et projection Cerfa.
- [rfs.md](rfs.md) — projection déclarative RFS.
- [document-extraction.md](document-extraction.md) — chaîne document → donnée métier.

D'autres Skills seront créés au fur et à mesure des chantiers réellement abordés (just-in-time knowledge, pas de documentation exhaustive à l'avance).
