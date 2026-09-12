# Git Rules

- Toujours relever HEAD et le dirty state avant toute action.
- Protéger les fichiers historiques dirty préexistants : ne pas les modifier, stager, restaurer ou supprimer.
- Comparer le diff avant/après toute intervention.
- Aucune commande Git destructive (`reset --hard`, `clean -fd`, `checkout --`, `restore` sur du travail non commité) sans autorisation explicite.
- Pas de staging implicite (`git add -A`, `git add .`).
- Pas de commit implicite.
- Pas de push implicite.

## Avant tout commit demandé

```bash
git diff --cached --name-only
```

doit correspondre exactement au périmètre attendu.
