# F010 B1 — Rapport de reproduction persistance

**Date** : 2026-08-28
**Contrainte** : aucune modification du code de production.

## Synthèse

| Hypothèse | Verdict | Preuve |
|-----------|---------|--------|
| **A. debounce/flush** | **Confirmée en simulation** ; non observée comme cause unique en navigateur Glass | Test `f010-b1-persistence-race.test.ts` : F5 <350 ms sans flush → disque vide |
| **B. race last-write-wins** | **Confirmée en simulation** ; non observée en navigateur (aucune écriture concurrente) | Même fichier de test : write lent `ventilation` écrase `review_plan` |
| **C. hydration tardive** | **Possible mais secondaire** | `initialResume` figé au mount (`useMemo([])`), mitigé par `isReady` |
| **D. environnement Glass** | **Contributeur majeur dans cette session** | `fiscal-ai-bound-auth-user-id` absent → aucune écriture IDB |
| **E. autre** | **Cause racine navigateur** : `scheduleSaveWorkspace` no-op si `userId === null` | IDB inchangée pendant tout le parcours |

**Classification B1 pour le symptôme observé (F5 → orientation)** :

> **E (gate auth / pas d’écriture IDB)** dans l’environnement Glass testé, avec **A et B comme risques résiduels** une fois l’auth OK.

---

## Chaîne de persistance (rappel)

```
persistSession()  [F010LogementAssistantPanel.tsx ~L981]
  → dispatch DECLARATION_PATCH_DRAFT { logementAssistantState }
  → lmnpReducer
  → useEffect provider [provider.tsx L202-217] scheduleSaveWorkspace(data, authUserIdRef.current)
  → persistence.ts scheduleSaveWorkspace — **if (!userId) return;** [L256]
  → debounce 350 ms → saveWorkspace → putWorkspaceRecord(user:{id})
  → reload → hydrateLmnpStore(userId) → HYDRATE → isReady
  → F010LogementAssistantPanel initialResume useMemo([]) → resolveF010ResumeDecision
```

---

## Instrumentation temporaire ajoutée (hors prod)

| Fichier | Rôle |
|---------|------|
| `scripts/f010-b1-idb-probe.js` | Sonde IDB console (`window.f010B1`) |
| `scripts/f010-b1-browser-harness.js` | Harness capture + reload (`window.f010B1Harness`) |
| `src/lib/lmnp/services/f010/f010-b1-persistence-race.test.ts` | Simulation debounce + race (6 tests, tous verts) |

Run tests :
```bash
npx tsx --test src/lib/lmnp/services/f010/f010-b1-persistence-race.test.ts
```

---

## Reproduction navigateur (Glass, localhost:3000)

### Parcours
`orientation` → achat ancien/neuf → saisie manuelle → 285 000 € → frais estimés (ancien) → pas de mobilier → ventilation (grande métropole, 25 %) → **`review_plan`**

### Mesure à l’arrivée sur `review_plan`

| Champ | Valeur |
|-------|--------|
| `state.step` (écran) | `review_plan` — titre « Validation du plan d'amortissement » |
| `declarationDraft.logementAssistantState` (mémoire) | présent en session (UI cohérente) |
| `declarationDraft.logementAssistantState` (IDB) | **`null` pendant 2+ s de polling (100 ms)** |
| `persistSession` count | non hookable sans toucher prod ; **0 effet IDB observable** |
| Clé IDB | seule entrée `workspace/active`, `updatedAt` figé `2026-05-25T15:47:13.061Z` |
| `fiscal-ai-bound-auth-user-id` (sessionStorage) | **`null`** |
| Autosave UI | « Dossier enregistré » (trompeur : `markAutosaveSaved()` aussi sur reset auth) |

Timeline IDB à `review_plan` (extrait) :
```json
{"ms":2,"idbStep":null}
{"ms":512,"idbStep":null}
{"ms":1023,"idbStep":null}
{"ms":2046,"idbStep":null}
```

### Matrice F5

| Cas | Délai avant F5 | IDB avant F5 | IDB après hydration | `resolveF010ResumeDecision` | Écran final |
|-----|----------------|--------------|----------------------|----------------------------|-------------|
| **C** | 5 s | `las: null`, `active` stale | identique | `start` | **Type d'acquisition** (`orientation`) |

Cas A/B/D non différenciés dans Glass : **tous équivalents** tant que `userId` est null (aucune écriture).

---

## Simulation Node (auth OK, saves actives)

### A — debounce 350 ms
- F5 à 100 ms : disque vide → `start()`
- Après ~950 ms : `review_plan` sur disque → `resume_step`
- `flush()` immédiat : `review_plan` avant 350 ms

### B — race ventilation → review_plan
- `scheduleSave(ventilation)` puis 400 ms plus tard `scheduleSave(review_plan)`
- Write async lent de `ventilation` **écrase** `review_plan` sur disque
- Au reload : reprise sur `ventilation`, pas `review_plan`

### C — initialResume figé
- Draft vide au mount → `start()` même si IDB se remplit ensuite (si panel monté avant données — atténué par `isReady`)

---

## Fichier / fonction exacte

| Priorité | Fichier | Fonction | Problème |
|----------|---------|----------|----------|
| **P0** | `src/lib/lmnp/store/persistence.ts` | `scheduleSaveWorkspace` L255-256 | `if (!userId) return` — silence total, aucune persistance F010 |
| **P0** | `src/lib/lmnp/store/provider.tsx` | `subscribeAuthBoundary` L93-96 + `finally` L191-195 | `isReady=true` même sans `userId` ; UI « enregistré » sans écriture |
| **P1** | `src/lib/lmnp/store/persistence.ts` | `scheduleSaveWorkspace` / `saveWorkspace` | Debounce 350 ms ; `beforeunload` ne garantit pas flush async |
| **P1** | `src/lib/lmnp/store/persistence.ts` | `saveWorkspace` | Pas de sérialisation : last-write-wins entre appels async |
| **P2** | `src/components/lmnp/assistants/F010LogementAssistantPanel.tsx` | `initialResume` L792-816 | `useMemo([])` fige le draft du premier mount |

---

## Correctif minimal recommandé (cycle suivant — pas implémenté ici)

1. **Bloquer ou avertir** si `authUserIdRef.current` est null pendant un parcours assistant (ne pas afficher « Dossier enregistré »).
2. **`flushWorkspaceSave` après transitions critiques F010** (`review_plan`, `complete`) — appel depuis `persistSession` ou effet dédié — pour couvrir F5 <350 ms.
3. **Sérialiser `saveWorkspace`** (queue / `await` chaîne) pour éliminer la race B sur `ventilation → review_plan`.
4. **QA** : vérifier présence de `user:{uuid}` dans IDB (pas seulement `active`) avant de valider B1 en environnement réel.

---

## Commandes utiles

```js
// Console sur /assistants/logement
await f010B1.probe()
await f010B1.watch(5000, 100)
```

```bash
npx tsx --test src/lib/lmnp/services/f010/f010-b1-persistence-race.test.ts
```
