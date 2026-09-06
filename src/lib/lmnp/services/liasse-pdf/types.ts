/**
 * Couche PDF Cerfa officielle — types partagés.
 *
 * Frontière stricte (GO implémentation, périmètre verrouillé) : ce module ne
 * contient AUCUNE règle fiscale. Il décrit uniquement la géométrie d'un
 * document PDF (où écrire) et la forme de ce que les mappers fiscaux
 * existants produisent déjà (`CerfaCase`, réutilisé tel quel depuis
 * `runtime/capabilities/f007/types.ts` — jamais redéfini ici).
 *
 * Chaîne de responsabilité :
 *   Fiscal Engine → RFS → Fiscal mapper (existant, inchangé) → CerfaCase[]
 *     → Visual Registry (ce module)
 *     → PDF Generator (ce module)
 *     → Generation Gate (ce module)
 *     → PDF final, rattachable à une DeclarationVersion (existant, inchangé)
 */

/** Réexport volontaire — un seul type `CerfaCase` dans tout le projet. */
import type { CerfaCaseValue } from "@/runtime/capabilities/f007/types";
export type { CerfaCase, CerfaCaseValue } from "@/runtime/capabilities/f007/types";

/**
 * Les 9 formulaires réels d'une liasse LMNP réel simplifié (cf. audit
 * "Dossier témoin" — ADR-004/SAV-029 n'en documentent que 5 ; le dossier
 * réellement télétransmis en compte 9). SUIV39C n'est PAS dans cette liste :
 * aucun PDF officiel distinct n'a été localisé pour cette annexe au moment de
 * cette mission — voir `assets/README.md` et le rapport final, section E.
 */
export type CerfaFormId =
  | "2031-SD"
  | "2031-bis-SD"
  | "2033-A-SD"
  | "2033-B-SD"
  | "2033-C-SD"
  | "2033-D-SD"
  | "2033-E-SD"
  | "2033-F-SD"
  | "2033-G-SD";

export const ALL_CERFA_FORM_IDS: readonly CerfaFormId[] = [
  "2031-SD",
  "2031-bis-SD",
  "2033-A-SD",
  "2033-B-SD",
  "2033-C-SD",
  "2033-D-SD",
  "2033-E-SD",
  "2033-F-SD",
  "2033-G-SD",
];

export type Millesime = number;

/**
 * Format d'affichage d'une case — une transformation de PRÉSENTATION pure
 * (arrondi, alignement, glyphe), jamais une règle fiscale. Le générateur ne
 * décide jamais QUAND une case s'affiche (ça, c'est le mapper fiscal, via la
 * présence/absence de la `CerfaCase` elle-même) — seulement COMMENT.
 */
export type CerfaValueFormat =
  /** Nombre arrondi à l'euro, séparateur de milliers fr-FR, jamais de décimales. */
  | "eur-arrondi"
  /** Chaîne telle quelle, tronquée avec ellipse si elle dépasse la largeur calibrée. */
  | "texte"
  /** `true` → glyphe "X" dessiné ; `false` ou absent → rien dessiné (jamais une case cochée par défaut). */
  | "case-a-cocher"
  /** Chaîne déjà formatée en amont (ex. "01/02/2025") — passthrough strict, aucun reformatage. */
  | "date"
  /** Chaîne de chiffres répartie sur les cases individuelles de `digitPositions` (ex. SIREN à 9 cases). */
  | "chiffres-repartis";

export type CerfaAlign = "left" | "right" | "center";

/**
 * Confiance du calibrage — champ additif (au-delà de la forme demandée),
 * pour ne jamais laisser une position mesurée par symétrie/estimation se
 * faire passer pour une position confirmée par preuve directe. Purement
 * documentaire : n'affecte aucun comportement du générateur à ce stade.
 */
export type CalibrationConfidence =
  /** Coordonnée retrouvée par recherche de texte exacte sur le Cerfa officiel vierge ET confirmée par comparaison directe avec une valeur réellement écrite au même endroit sur le dossier témoin. */
  | "mesure-empirique"
  /** Dérivée par symétrie à partir d'une coordonnée confirmée voisine (ex. colonne "Bénéfice" déduite de la colonne "Déficit" mesurée) — jamais vérifiée avec une valeur positive réelle. */
  | "estimee-par-symetrie"
  /** Placeholder de structure — aucune mesure réelle effectuée. Ne doit jamais être utilisée en production sans calibrage visuel préalable. */
  | "a-calibrer";

/**
 * Coordonnée telle que mesurée par les outils d'inspection (origine en HAUT
 * À GAUCHE, y croissant vers le bas — convention PyMuPDF/la plupart des
 * outils, PAS la convention PDF native). Ce type existe pour qu'un
 * développeur ne puisse jamais, par erreur, passer une coordonnée mesurée
 * directement à `page.drawText()` de pdf-lib sans passer par la conversion
 * explicite de `coordinates.ts` — voir ce module pour le "pourquoi".
 */
export type TopLeftPoint = {
  readonly space: "top-left";
  readonly x: number;
  readonly y: number;
};

export function topLeft(x: number, y: number): TopLeftPoint {
  return { space: "top-left", x, y };
}

/**
 * Registre de mapping visuel — forme imposée par la mission GO implémentation.
 * Ne contient AUCUNE règle fiscale : jamais un `if (caseId === "330") ...`,
 * jamais une valeur, jamais une condition d'affichage. Une ligne de ce
 * registre dit uniquement "si cette case existe dans le CerfaCase[] produit
 * par le mapper, voici où et comment l'écrire" — jamais "cette case doit
 * exister".
 */
export type CerfaVisualMapping = {
  form: CerfaFormId;
  millesime: Millesime;
  caseId: string;
  /** Page du formulaire LUI-MÊME (1-indexé, relative à ce formulaire) — jamais la page de l'asset PDF partagé. Voir `asset-manifest.ts` pour la résolution vers la page réelle. */
  page: number;
  /** Coordonnée du point d'ancrage, en convention `top-left` (voir `TopLeftPoint`). */
  position: TopLeftPoint;
  /** Largeur disponible en points — dépassement = échec de génération, jamais une troncature silencieuse pour "eur-arrondi"/"chiffres-repartis" (seul "texte" tronque explicitement, cf. format-value.ts). */
  width: number;
  height?: number;
  fontSize?: number;
  align?: CerfaAlign;
  format?: CerfaValueFormat;
  /**
   * Utilisé uniquement quand `format === "chiffres-repartis"` : position x de
   * chaque case-chiffre, une par caractère attendu, en convention `top-left`
   * (même y que `position`). Ex. SIREN officiel 2031-SD (9 chiffres).
   */
  digitPositions?: readonly number[];
  /** Traçabilité du calibrage — voir `CalibrationConfidence`. */
  calibration: CalibrationConfidence;
  /** Note libre expliquant la mesure ou l'estimation — jamais vide pour "estimee-par-symetrie"/"a-calibrer". */
  note?: string;
};

/** Résultat de génération — jamais un PDF partiel silencieux : soit généré, soit bloqué avec la liste exhaustive des raisons. */
export type LiasseGenerationResult =
  | {
      status: "generated";
      pdfBytes: Uint8Array;
      manifest: RenderManifestEntry[];
      millesime: Millesime;
      forms: CerfaFormId[];
      /**
       * Cases produites par un mapper mais explicitement retirées du
       * périmètre de génération (voir `excluded-cases.ts`) — jamais
       * silencieuses : chaque exclusion apparaît ici, avec sa raison et sa
       * classification (`GEOMETRIC_UNCERTAINTY` ou
       * `FISCAL_ARBITRATION_REQUIRED`), même quand la génération réussit
       * par ailleurs.
       */
      excludedCases: ExcludedCaseRecord[];
    }
  | {
      status: "blocked";
      violations: GateViolation[];
    };

/** Une case exclue effectivement rencontrée pendant CETTE génération (le mapper l'a produite). */
export type ExcludedCaseRecord = {
  form: CerfaFormId;
  caseId: string;
  value: CerfaCaseValue;
  classification: "GEOMETRIC_UNCERTAINTY" | "FISCAL_ARBITRATION_REQUIRED";
  reason: string;
};

/** Une entrée par valeur effectivement dessinée — le "post-render" au sens où le générateur sait exactement ce qu'il a écrit, sans avoir à ré-analyser les octets produits pour le vérifier. */
export type RenderManifestEntry = {
  form: CerfaFormId;
  caseId: string;
  /** Page dans le PDF FINAL assemblé (toutes formes concaténées), pas la page relative au formulaire. */
  outputPage: number;
  text: string;
  /** Coordonnée réellement utilisée pour `drawText`, en espace pdf-lib (origine bas-gauche) — voir `coordinates.ts`. */
  pdfLibX: number;
  pdfLibY: number;
  measuredWidth: number;
  maxWidth: number;
};

export type GateViolationCode =
  | "asset-manifest-manquant"
  | "asset-page-count-inattendu"
  | "asset-empreinte-invalide"
  | "case-sans-mapping-visuel"
  | "millesime-inconnu"
  | "case-id-dupliquee"
  | "debordement-largeur"
  | "coordonnee-hors-page"
  | "page-formulaire-invalide"
  | "positions-superposees";

export type GateViolation = {
  code: GateViolationCode;
  form: CerfaFormId;
  caseId?: string;
  message: string;
};
