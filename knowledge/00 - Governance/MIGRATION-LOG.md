# MIGRATION-LOG — Vault Obsidian → dépôt Git

Date : 2026-07-07

## Ce qui s'est passé

Le Knowledge System vivait auparavant dans un Vault Obsidian externe au
dépôt Git :

```
/Users/forniantoine/Documents/Obsidian Vault/Sans titre 1/FISCAL AI
```

Il est désormais versionné dans le dépôt, sous `knowledge/` :

```
/Users/forniantoine/Developer/fiscal-ai/knowledge
```

Le dépôt Git est la seule source de vérité. Obsidian reste l'éditeur du
Knowledge System, mais pointe maintenant directement sur `knowledge/`.

## Copies archivées (aucune suppression)

Déplacées vers `~/Documents/Archive Fiscal AI (migration 2026-07-07)/` :

- `FISCAL AI (Vault original - migre vers fiscal-ai_knowledge le 2026-07-07)`
  — le Vault d'origine, intact, conservé par précaution
- `FISCAL AI - COPIE MIGRATION` — instantané figé d'une réorganisation
  antérieure abandonnée (taxonomie différente, 25 % de fichiers vides)
- `FISCAL_AI_BACKUP_20260628_133342.zip`
- `FISCAL_AI_BACKUP_V2_20260629_085617.zip`

## Vérifications effectuées avant l'archivage

- Nombre de fichiers identique (441) entre la source et `knowledge/`
- Checksums (`shasum`) identiques fichier par fichier
- Configuration Obsidian (`.obsidian/`) préservée à l'identique
  (plugins core, apparence, graph)
- Liens internes `[[...]]` vérifiés : les seuls liens non résolus (6,
  tous dans `05 - Workspace/Archive/Migration-V1/`) étaient déjà
  cassés dans la source avant la migration — aucune régression
