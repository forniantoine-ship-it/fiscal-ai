/**
 * Registre visuel — 2033-C-SD, millésime 2026 — VIDE À DESSEIN.
 *
 * Périmètre de cette mission : 2033-C-SD n'a, à ce jour, aucun mapper
 * produisant de `CerfaCase[]` couvrant les catégories "Constructions"
 * (430/436) ni "Installations générales" (450/456) — la classification des
 * composants du plan d'amortissement par nature reste à construire (voir
 * audit "Dossier témoin", écart P1). Les cases déjà correctement produites
 * ailleurs dans le code (terrain, mobilier, totaux, cf. map-2033c.ts) ne
 * sont pas dupliquées ici tant que ce mapper n'est pas branché sur la
 * couche PDF — commencer par le minimum fiable signifie ne pas construire
 * un registre à moitié vérifié.
 *
 * Le fond de page officiel existe déjà (`asset-manifest.ts`, page 3/7 de
 * `assets/2026/2033-sd.pdf`).
 */
import type { CerfaVisualMapping } from "../../types";

export const registry2033C2026: readonly CerfaVisualMapping[] = [];
