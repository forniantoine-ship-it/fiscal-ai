/**
 * Registre visuel — 2033-D-SD, millésime 2026 — VIDE À DESSEIN.
 *
 * Le mapper actuel (map-2033d.ts) ne produit aucune `CerfaCase` (le
 * formulaire est structurellement "Néant" pour un LMNP réel simplifié à
 * l'IR — voir audit "Dossier témoin"). Ce registre reste vide tant qu'aucun
 * mécanisme de case "Néant" officielle n'existe côté mapper — fabriquer une
 * coche automatique ici, sans signal explicite du mapper fiscal, violerait
 * la règle absolue de cette mission (section 8 : ne jamais déduire une
 * situation fiscale à partir de l'absence de données).
 *
 * Le fond de page officiel existe déjà (`asset-manifest.ts`, page 4/7 de
 * `assets/2026/2033-sd.pdf`).
 */
import type { CerfaVisualMapping } from "../../types";

export const registry2033D2026: readonly CerfaVisualMapping[] = [];
