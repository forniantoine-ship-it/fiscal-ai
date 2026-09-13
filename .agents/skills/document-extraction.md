# Skill — Document Extraction

Chaîne à formaliser :

```
Document
→ extraction
→ observation / proposition
→ validation
→ donnée métier
```

## Principes

- Extraction IA ≠ vérité fiscale.
- Conserver provenance lorsque l'architecture le permet.
- Conserver confiance (confidence) lorsque l'architecture le permet.
- Différencier : valeur absente / valeur non détectée / extraction échouée.
- Ne jamais inventer une donnée manquante.
- Fallback explicite, jamais silencieux.

## Documents officiels à formats multiples

Un même type de document officiel peut exister sous plusieurs structures distinctes (libellés différents, ordre des champs différent). Un extracteur déterministe ne doit jamais supposer qu'un seul libellé ou un seul ordre couvre toutes les variantes réellement émises.

- Le marqueur qui délimite un bloc/enregistrement doit être le champ qui ouvre réellement l'enregistrement — jamais un champ qui peut apparaître après les données à extraire.
- Conserver l'extraction déterministe quand elle suffit ; ne pas ajouter un fallback LLM pour compenser un parseur incomplet.
- Face à plusieurs candidats plausibles pour une même donnée, ne jamais sélectionner silencieusement une valeur arbitraire — exposer l'ambiguïté.
- Les champs liés à une même entité (identifiant, statut, type, adresse…) doivent rester associés ensemble, jamais recombinés entre entités différentes.

## Test de régression sur document réel

Quand un bug provient d'un document réel, le test de régression doit reproduire fidèlement ce document : libellés observés, ordre réel des champs, structure de bloc réelle. Une fixture reconstruite de mémoire ou réordonnée pour faire passer le test n'est pas une preuve suffisante.
