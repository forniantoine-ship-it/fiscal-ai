<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# Fiscal AI — Multi-Agent Operating System

Fiscal AI uses a shared multi-agent operating system, independent of any specific agent tool.

## Avant chaque chantier

Lire, dans l'ordre :

1. [.agents/core/project-principles.md](.agents/core/project-principles.md)
2. [.agents/core/change-protocol.md](.agents/core/change-protocol.md)
3. uniquement les règles supplémentaires nécessaires parmi [.agents/core/](.agents/core/) ;
4. uniquement le ou les Skills pertinents — voir [.agents/skills/README.md](.agents/skills/README.md).

Ne jamais charger automatiquement tous les Skills.

## Modes

Les prompts peuvent spécifier :

```
MODE AUDIT
MODE BUILDER
MODE CHECKPOINT
```

Définitions détaillées : [.agents/core/change-protocol.md](.agents/core/change-protocol.md).

## Principe fondamental

Commencer par le périmètre demandé. Élargir uniquement lorsqu'une dépendance réelle l'exige — voir [.agents/core/context-budget.md](.agents/core/context-budget.md).

## Connaissance métier

La connaissance Fiscal AI appartient au repository (`knowledge/`), pas à un agent ou une conversation particulière — voir `knowledge/CLAUDE.md`.
