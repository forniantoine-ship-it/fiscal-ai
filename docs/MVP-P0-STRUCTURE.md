# MVP P0 — Structure projet

## Arborescence

```
src/
├── app/
│   ├── app/                          # Application LMNP (copilote)
│   │   ├── layout.tsx                # LmnpProvider + shell
│   │   ├── page.tsx                  # → redirect exercice
│   │   └── exercices/[id]/
│   │       ├── layout.tsx            # Header + Sidebar
│   │       ├── page.tsx              # Dashboard
│   │       ├── documents/            # Upload + analyse
│   │       ├── validation/           # Inbox humaine
│   │       ├── alertes/
│   │       └── activite|recettes|…   # Onglets (lecture LedgerEntry)
│   └── onboarding/lmnp/              # Parcours legacy (marketing)
├── components/lmnp/                  # UI métier
└── lib/lmnp/
    ├── types/                        # Domaine TypeScript strict
    ├── constants/                    # Catégories docs, exigences
    ├── engine/                       # Alertes, confiance, canClose
    ├── services/                     # Classification, analyse, ledger
    └── store/                        # Reducer + localStorage + Provider
```

## Pipeline implémenté

1. **Upload** → `UPLOAD_DOCUMENTS` (fichiers en mémoire + métadonnées persistées)
2. **Analyse** → `RUN_ANALYSIS` → `analyzeDocument()` (classification nom + règles métier, pas de timer mock)
3. **Validation** → `ValidationItem` pending → approve / correct / ignore / bulk ≥95 %
4. **Écritures** → `LedgerEntry` créée uniquement après validation
5. **Onglets** → affichage des `LedgerEntry` + pending par tab
6. **Alertes** → `recomputeAlerts()` dérivé du contexte
7. **Score** → `computeUserConfidence()` (4 piliers, plafond 89 % si blocage)

## Entrée utilisateur

- Landing : **Mon dossier LMNP** → `/app`
- Données : `localStorage` clé `fiscal-ai-lmnp-workspace-v1`

## Hors scope P0

- Génération liasse 2031/2033
- Multi-utilisateur / auth
- OCR cloud (remplaçable dans `services/document-analysis.ts`)
- Clôture

Voir aussi : [DATA-MODEL-LMNP.md](./DATA-MODEL-LMNP.md) · [WORKFLOW-AND-RULES-LMNP.md](./WORKFLOW-AND-RULES-LMNP.md)
