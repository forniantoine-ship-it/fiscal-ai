/**
 * Point d'entrée unique du registre visuel — résout (formulaire, millésime,
 * caseId) → `CerfaVisualMapping | undefined`. Aucune règle fiscale : une
 * résolution manquante n'est jamais comblée par une valeur par défaut, elle
 * remonte telle quelle à la generation gate (`gate/generation-gate.ts`).
 */
import type { CerfaFormId, CerfaVisualMapping, Millesime } from "../types";
import { registry2031SD2026 } from "./2031-sd/2026";
import { registry2031Bis2026 } from "./2031-bis/2026";
import { registry2033A2026 } from "./2033-a/2026";
import { registry2033B2026 } from "./2033-b/2026";
import { registry2033C2026 } from "./2033-c/2026";
import { registry2033D2026 } from "./2033-d/2026";
import { registry2033E2026 } from "./2033-e/2026";
import { registry2033F2026 } from "./2033-f/2026";
import { registry2033G2026 } from "./2033-g/2026";

type RegistryByForm = Readonly<Record<CerfaFormId, readonly CerfaVisualMapping[]>>;

/**
 * Un seul point d'ajout par millésime. Ajouter 2027 signifie créer un
 * nouveau bloc ici (`2027: {...}`) référençant de NOUVEAUX fichiers
 * `registry/<form>/2027.ts` — ne jamais modifier les entrées 2026
 * existantes. Le moteur de génération ne référence jamais un registre par
 * millésime en dur : il reçoit le millésime en paramètre et résout ici.
 */
const REGISTRIES_BY_MILLESIME: Readonly<Record<Millesime, RegistryByForm>> = {
  2026: {
    "2031-SD": registry2031SD2026,
    "2031-bis-SD": registry2031Bis2026,
    "2033-A-SD": registry2033A2026,
    "2033-B-SD": registry2033B2026,
    "2033-C-SD": registry2033C2026,
    "2033-D-SD": registry2033D2026,
    "2033-E-SD": registry2033E2026,
    "2033-F-SD": registry2033F2026,
    "2033-G-SD": registry2033G2026,
  },
};

export function resolveVisualMapping(
  form: CerfaFormId,
  millesime: Millesime,
  caseId: string,
): CerfaVisualMapping | undefined {
  return REGISTRIES_BY_MILLESIME[millesime]?.[form]?.find((entry) => entry.caseId === caseId);
}

/**
 * Toutes les entrées du registre pour un formulaire/millésime donné —
 * indépendamment de ce qu'un mapper produit à l'exécution. Utilisé par la
 * generation gate pour détecter, de façon STATIQUE (sans avoir besoin d'un
 * `CerfaCase[]` en entrée), deux cases dont le registre lui-même définirait
 * la même position (voir `checkOverlappingPositions`, `gate/generation-gate.ts`).
 */
export function resolveAllVisualMappings(form: CerfaFormId, millesime: Millesime): readonly CerfaVisualMapping[] {
  return REGISTRIES_BY_MILLESIME[millesime]?.[form] ?? [];
}

export function isMillesimeKnown(millesime: Millesime): boolean {
  return millesime in REGISTRIES_BY_MILLESIME;
}
