/**
 * Lot 4D.3 — extracteur minimal liasse N-1 → TaxPackageLiasseCaseObservation[].
 *
 * Chemin V1 :
 *   pages texte (natif) → identification 2033-A / 2033-C → 6 cases V1
 *   → Vision structurée en fallback uniquement
 *   → CandidateValue → TaxPackageLiasseCaseObservation[]
 *
 * Consommable ensuite par extractTaxPackageControlFactsFromLiasse (4D.2).
 *
 * Pas de parser Cerfa universel. Pas de registry inbound. Pas de rapprochement/arbitrage.
 * formYear / fiscalYear fournis par l'appelant — jamais détectés ici.
 */

import { z } from "zod";

import { createConfidenceScore } from "@/lib/documents/types/confidence-score";
import { parseRegisterAmount } from "./extract-depreciation-register-spreadsheet";
import {
  documentAbsentCandidate,
  extractionImpossibleCandidate,
  missingCandidate,
  presentCandidate,
  type CandidateProvenance,
  type CandidateValue,
  type TakeoverDocumentRole,
} from "./candidate-value";
import type { TaxPackageLiasseCaseObservation } from "./extract-tax-package-control-facts-from-liasse";
import { TAX_PACKAGE_CONTROL_V1_MATRIX } from "./tax-package-control-facts";

export type TaxPackageLiasseFormType = "2033A" | "2033C";

export type TaxPackageLiassePageText = {
  pageNumber: number;
  text: string;
};

export type TaxPackageLiassePageImage = {
  pageNumber: number;
  mimeType: string;
  base64: string;
};

/** Résultat Vision par case — schéma déterministe 4D.3 (pas le schéma OCR facture/bail). */
export type TaxPackageLiasseVisionCasePayload = {
  sourceCase: string;
  status: "present" | "missing" | "extraction_impossible";
  value: number | null;
};

export type TaxPackageLiasseVisionFormPayload = {
  formType: TaxPackageLiasseFormType | "unknown";
  cases: TaxPackageLiasseVisionCasePayload[];
};

/**
 * Requester Vision injectable — aucun appel réseau dans les tests.
 * Pattern technique aligné sur extract-document / vision canonical :
 * temperature 0 + json_schema (côté implémentation requester).
 */
export type TaxPackageLiasseVisionRequester = (input: {
  formType: TaxPackageLiasseFormType;
  sourceCases: readonly string[];
  pageNumber?: number;
  pageTextHint?: string;
  pageImage?: Omit<TaxPackageLiassePageImage, "pageNumber">;
}) => Promise<TaxPackageLiasseVisionFormPayload>;

export type ExtractTaxPackageLiasseObservationsInput = {
  documentId: string;
  formYear: number;
  fiscalYear: number;
  pages: readonly TaxPackageLiassePageText[];
  /** Takeover local — défaut prior_tax_package. N'élargit PAS DocumentRole production. */
  documentRole?: TakeoverDocumentRole;
  visionRequester?: TaxPackageLiasseVisionRequester;
  pageImages?: readonly TaxPackageLiassePageImage[];
  /**
   * Scan path (4D.4B) : si native = missing ET une image de page est fournie,
   * déclencher Vision au lieu d'accepter missing (texte natif absent).
   * 4D.4A / natif : laisser false/undefined — missing reste missing.
   */
  visionOnMissing?: boolean;
};

export type ExtractTaxPackageLiasseObservationsResult = {
  status: "extracted";
  observations: TaxPackageLiasseCaseObservation[];
  /** Formulaires identifiés en natif. */
  identifiedForms: TaxPackageLiasseFormType[];
  /** true si Vision a été invoquée au moins une fois. */
  visionCalled: boolean;
  diagnostics: string[];
};

type NativeCaseStatus = "present" | "missing" | "extraction_impossible";

type NativeCaseRead = {
  status: NativeCaseStatus;
  value?: number;
  pageNumber: number;
};

const AMOUNT_TOKEN =
  /-?(?:\d{1,3}(?:[ \u00a0]\d{3})+|\d+)(?:[.,]\d{1,2})?/g;

/** Cases V1 — utilisées pour borner l'association montant avant le prochain numéro de case. */
const V1_CASE_TOKEN_ALTERNATION = TAX_PACKAGE_CONTROL_V1_MATRIX.map(
  (row) => row.sourceCase,
).join("|");

/**
 * Marqueurs FORTS uniquement — une mention narrative « 2033-A » ne suffit pas.
 * Deux formes Cerfa réelles observées :
 *   1. « …-SD » (ex. 2033-A-SD, 2033-C-SD) — présent sur le Cerfa officiel vierge.
 *   2. lettre directement suivie du millésime, sans « -SD » (ex. « 2033-C2024 »)
 *      — observé sur une vraie liasse 2033-C tierce (logiciel comptable différent,
 *      même gabarit officiel « Formulaire obligatoire… », juste sans le token -SD).
 * Le millésime collé à la lettre est le signal structurel qui distingue un vrai
 * en-tête Cerfa d'une mention narrative (« …votre 2033-C signée » n'a jamais de
 * millésime immédiatement adjacent) — voir aussi extractTaxPackageLiassePrintedFormYear.
 */
const FORM_A_MARKERS: RegExp[] = [
  /2033\s*[-–]?\s*A\s*[-–]?\s*SD\b/i,
  /2033\s*[-–]?\s*A\s*[-–]?\s*\d{4}\b/i,
];

const FORM_C_MARKERS: RegExp[] = [
  /2033\s*[-–]?\s*C\s*[-–]?\s*SD\b/i,
  /2033\s*[-–]?\s*C\s*[-–]?\s*\d{4}\b/i,
];

function v1CasesForForm(formType: TaxPackageLiasseFormType): string[] {
  return TAX_PACKAGE_CONTROL_V1_MATRIX.filter((row) => row.formType === formType).map(
    (row) => row.sourceCase,
  );
}

function matchesAny(text: string, markers: RegExp[]): boolean {
  return markers.some((re) => re.test(text));
}

/**
 * Identifie le formulaire d'une page par marqueurs Cerfa forts (…-SD).
 * Ambigu A+C → null. Mention narrative sans -SD → null.
 * Ne vérifie PAS le millésime — voir isTaxPackageLiasseFormYearCompatible.
 */
export function identifyTaxPackageLiasseForm(
  pageText: string,
): TaxPackageLiasseFormType | null {
  const hasA = matchesAny(pageText, FORM_A_MARKERS);
  const hasC = matchesAny(pageText, FORM_C_MARKERS);
  if (hasA && hasC) return null;
  if (hasA) return "2033A";
  if (hasC) return "2033C";
  return null;
}

/**
 * Millésime imprimé observé sur le Cerfa officiel 2026 via pdfjs-dist :
 *   "DGFiP N° 2033-A-SD 2026" / "DGFiP N° 2033-C-SD 2026"
 *
 * Signal primaire : année collée au marqueur du formulaire demandé.
 * Signal secondaire Cerfa 15948*08 → 2026 : UNIQUEMENT pour formType 2033A
 * (observé sur la page officielle A, absent sur C). Jamais pour valider 2033C.
 *
 * Fail closed : si aucun signal fiable pour ce formType → null.
 * Un millésime primaire explicite gagne toujours sur le fallback Cerfa.
 */
export function extractTaxPackageLiassePrintedFormYear(
  pageText: string,
  formType: TaxPackageLiasseFormType,
): number | null {
  const letter = formType === "2033A" ? "A" : "C";

  const nearFormSd = pageText.match(
    new RegExp(`2033\\s*[-–]?\\s*${letter}\\s*[-–]?\\s*SD\\s+(\\d{4})\\b`, "i"),
  );
  if (nearFormSd?.[1]) {
    const year = Number.parseInt(nearFormSd[1], 10);
    if (Number.isInteger(year) && year >= 1900 && year <= 2100) {
      return year;
    }
  }

  // Variante Cerfa réelle sans « -SD » : millésime collé directement à la
  // lettre (ex. « 2033-C2024 ») — même signal structurel que ci-dessus,
  // juste sans le token -SD. Voir FORM_C_MARKERS.
  const nearFormBare = pageText.match(
    new RegExp(`2033\\s*[-–]?\\s*${letter}\\s*[-–]?\\s*(\\d{4})\\b`, "i"),
  );
  if (nearFormBare?.[1]) {
    const year = Number.parseInt(nearFormBare[1], 10);
    if (Number.isInteger(year) && year >= 1900 && year <= 2100) {
      return year;
    }
  }

  // Fallback Cerfa : 2033A seulement — jamais pour 2033C.
  if (formType === "2033A" && /15948\s*\*\s*08\b/i.test(pageText)) {
    return 2026;
  }

  return null;
}

/**
 * Une page n'est compatible avec formYear que si le millésime/version
 * attendu est établi de manière fiable pour ce formType.
 */
export function isTaxPackageLiasseFormYearCompatible(
  pageText: string,
  formType: TaxPackageLiasseFormType,
  formYear: number,
): boolean {
  const printed = extractTaxPackageLiassePrintedFormYear(pageText, formType);
  if (printed === null) return false;
  return printed === formYear;
}

function caseTokenRegex(sourceCase: string): RegExp {
  return new RegExp(`(^|[^0-9])(${sourceCase})(?=[^0-9]|$)`);
}

function hasDigitResidue(zone: string): boolean {
  return /\d/.test(zone);
}

/**
 * Montant non ambigu en mode non étiqueté.
 * Rejette les tokens qui ressemblent à des numéros de case Cerfa (3 chiffres)
 * ou à des suites de codes case — false positive interdit.
 */
function isConfidentUnlabeledAmountToken(token: string, value: number): boolean {
  const trimmed = token.trim().replace(/\u00a0/g, " ");
  if (value === 0) {
    return /^0([.,]0+)?$/.test(trimmed.replace(/\s+/g, ""));
  }
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    const head = parts[0]!.replace(/[.,]\d+$/, "");
    // Un seul groupe de 3 chiffres = collision avec un code case (029, 999…).
    if (/^\d{3}$/.test(head)) return false;
    // Entier « clair » : ≥ 4 chiffres, ou décimal.
    return head.length >= 4 || /[.,]\d+/.test(parts[0]!);
  }
  // Groupes fr-FR : accepter si dernier groupe = milliers « 000 », ou
  // premier groupe < 3 chiffres (ex. « 12 000 », « 1 500 000 »), ou décimal.
  const first = parts[0]!;
  const last = parts[parts.length - 1]!;
  if (parts.some((part) => /[.,]\d+/.test(part))) return true;
  if (/^\d+$/.test(last) && /^0+$/.test(last)) return true;
  if (/^\d{1,2}$/.test(first.replace(/[.,].*$/, ""))) return true;
  // Ex. « 111 222 » : uniquement des groupes de 3 chiffres non-nuls → pas confiant.
  if (parts.every((part) => /^\d{3}$/.test(part))) return false;
  return true;
}

function parseSignedRegisterAmount(raw: string): number | null {
  const trimmed = raw.trim();
  if (/^-/.test(trimmed) || /^\(.*\)$/.test(trimmed)) {
    return null;
  }
  return parseRegisterAmount(trimmed);
}

function collectConfidentUnlabeledAmounts(zone: string): number[] {
  const values: number[] = [];
  for (const match of zone.matchAll(new RegExp(AMOUNT_TOKEN.source, "g"))) {
    const token = match[0]!;
    const parsed = parseSignedRegisterAmount(token);
    if (parsed === null) continue;
    if (!isConfidentUnlabeledAmountToken(token, parsed)) continue;
    values.push(parsed);
  }
  return values;
}

/**
 * Associe un montant à une case sur UNE ligne — fail closed.
 * present() uniquement si l'association case→montant est non ambiguë.
 *
 * Zone associable = texte À DROITE de la case, borné par la prochaine case V1
 * (sur une rangée Cerfa, ce texte appartient à cette case ; le texte à gauche
 * appartient à la case précédente et n'est jamais candidat).
 * Plusieurs montants confiants dans cette zone → extraction_impossible.
 * Digits non confiants (codes case voisins, etc.) → extraction_impossible.
 */
function associateAmountOnLine(
  line: string,
  sourceCase: string,
): { status: NativeCaseStatus; value?: number } {
  const tokenRe = caseTokenRegex(sourceCase);
  const tokenMatch = tokenRe.exec(line);
  if (!tokenMatch || tokenMatch.index === undefined) {
    return { status: "missing" };
  }

  const caseStart = tokenMatch.index + tokenMatch[1]!.length;
  const caseEnd = caseStart + sourceCase.length;
  let afterCase = line.slice(caseEnd);

  // Zone bornée par la prochaine case V1 — évite de mélanger 028 et 030.
  const nextCase = afterCase.match(
    new RegExp(`(^|[^0-9])(${V1_CASE_TOKEN_ALTERNATION})(?=[^0-9]|$)`),
  );
  if (nextCase && nextCase.index !== undefined) {
    afterCase = afterCase.slice(0, nextCase.index);
  }

  // Format étiqueté explicite : 028: 150000 | 028 = 0 | 028:
  const labeled = afterCase.match(/^\s*[:=]\s*(.*)$/);
  if (labeled) {
    const raw = (labeled[1] ?? "").trim();
    if (!raw) return { status: "missing" };
    const amountMatches = [...raw.matchAll(new RegExp(AMOUNT_TOKEN.source, "g"))];
    if (amountMatches.length === 0) return { status: "extraction_impossible" };
    if (amountMatches.length > 1) return { status: "extraction_impossible" };
    const parsed = parseSignedRegisterAmount(amountMatches[0]![0]!);
    if (parsed === null) return { status: "extraction_impossible" };
    return { status: "present", value: parsed };
  }

  // Fenêtre de proximité à droite uniquement.
  const PROXIMITY = 48;
  const afterWindow = afterCase.slice(0, Math.min(afterCase.length, PROXIMITY));
  const amounts = collectConfidentUnlabeledAmounts(afterWindow);

  if (amounts.length === 1) {
    return { status: "present", value: amounts[0] };
  }
  if (amounts.length > 1) {
    return { status: "extraction_impossible" };
  }

  // Aucun montant confiant : digits dans la zone = ambiguïté (pas missing).
  if (hasDigitResidue(afterWindow)) {
    return { status: "extraction_impossible" };
  }

  return { status: "missing" };
}

/**
 * Lecture native d'une case sur le texte d'une page déjà identifiée.
 * Un montant ailleurs sur la page, hors proximité, n'est jamais attribué.
 */
export function readNativeTaxPackageCase(
  pageText: string,
  sourceCase: string,
  pageNumber: number,
): NativeCaseRead {
  const lines = pageText.split(/\r?\n/);
  const tokenRe = caseTokenRegex(sourceCase);
  const hitIndexes = lines
    .map((line, index) => (tokenRe.test(line) ? index : -1))
    .filter((index) => index >= 0);

  if (hitIndexes.length === 0) {
    return { status: "missing", pageNumber };
  }

  const reads = hitIndexes.map((index) => associateAmountOnLine(lines[index]!, sourceCase));
  const presents = reads.filter((r) => r.status === "present");
  if (presents.length === 1 && presents[0]!.value !== undefined) {
    return { status: "present", value: presents[0]!.value, pageNumber };
  }
  if (presents.length > 1) {
    const values = new Set(presents.map((p) => p.value));
    if (values.size === 1) {
      return { status: "present", value: presents[0]!.value, pageNumber };
    }
    return { status: "extraction_impossible", pageNumber };
  }
  if (reads.some((r) => r.status === "extraction_impossible")) {
    return { status: "extraction_impossible", pageNumber };
  }
  return { status: "missing", pageNumber };
}

function buildProvenance(params: {
  documentId: string;
  documentRole: TakeoverDocumentRole;
  formType: TaxPackageLiasseFormType;
  sourceCase: string;
  pageNumber?: number;
  extractionMethod: string;
  confidenceFactors: string[];
  confidenceValue: number;
}): CandidateProvenance {
  return {
    documentId: params.documentId,
    documentRole: params.documentRole,
    fieldLabel: `${params.formType}:${params.sourceCase}`,
    sourceRef: `${params.formType}:${params.sourceCase}`,
    extractionMethod: params.extractionMethod,
    confidence: createConfidenceScore(params.confidenceValue, params.confidenceFactors),
    fieldSource: "extracted",
    evidence:
      params.pageNumber !== undefined
        ? { snippet: `${params.formType}/${params.sourceCase}`, page: params.pageNumber }
        : { snippet: `${params.formType}/${params.sourceCase}` },
  };
}

function toCandidateValue(
  read: {
    status: "present" | "missing" | "extraction_impossible" | "document_absent";
    value?: number;
    pageNumber?: number;
  },
  ctx: {
    documentId: string;
    documentRole: TakeoverDocumentRole;
    formType: TaxPackageLiasseFormType;
    sourceCase: string;
    extractionMethod: string;
    confidenceValue: number;
    confidenceFactors: string[];
  },
): CandidateValue<number> {
  const provenance = buildProvenance({
    documentId: ctx.documentId,
    documentRole: ctx.documentRole,
    formType: ctx.formType,
    sourceCase: ctx.sourceCase,
    pageNumber: read.pageNumber,
    extractionMethod: ctx.extractionMethod,
    confidenceFactors: ctx.confidenceFactors,
    confidenceValue: ctx.confidenceValue,
  });

  if (read.status === "present") {
    if (read.value === undefined || !Number.isFinite(read.value) || read.value < 0) {
      return extractionImpossibleCandidate("valeur native non finie ou négative", {
        documentId: ctx.documentId,
        documentRole: ctx.documentRole,
        fieldLabel: provenance.fieldLabel,
        sourceRef: provenance.sourceRef,
      });
    }
    return presentCandidate(read.value, "direct", provenance);
  }

  if (read.status === "missing") {
    return missingCandidate("case identifiée vide ou absente du texte", {
      documentId: ctx.documentId,
      documentRole: ctx.documentRole,
      fieldLabel: provenance.fieldLabel,
      sourceRef: provenance.sourceRef,
    });
  }

  if (read.status === "document_absent") {
    return documentAbsentCandidate("formulaire/page absent du document", {
      documentId: ctx.documentId,
      documentRole: ctx.documentRole,
      fieldLabel: provenance.fieldLabel,
      sourceRef: provenance.sourceRef,
    });
  }

  return extractionImpossibleCandidate("association case→montant non démontrée", {
    documentId: ctx.documentId,
    documentRole: ctx.documentRole,
    fieldLabel: provenance.fieldLabel,
    sourceRef: provenance.sourceRef,
  });
}

function observationFrom(
  formType: TaxPackageLiasseFormType,
  sourceCase: string,
  formYear: number,
  fiscalYear: number,
  value: CandidateValue<number>,
): TaxPackageLiasseCaseObservation {
  return { formType, formYear, fiscalYear, sourceCase, value };
}

function isExploitable(value: CandidateValue<number>): boolean {
  return value.status === "present" || value.status === "missing";
}

function findImage(
  images: readonly TaxPackageLiassePageImage[] | undefined,
  pageNumber: number | undefined,
): Omit<TaxPackageLiassePageImage, "pageNumber"> | undefined {
  if (!images || pageNumber === undefined) return undefined;
  const hit = images.find((img) => img.pageNumber === pageNumber);
  if (!hit) return undefined;
  return { mimeType: hit.mimeType, base64: hit.base64 };
}

function normalizeVisionCase(
  payload: TaxPackageLiasseVisionCasePayload,
  expectedCase: string,
): { status: "present" | "missing" | "extraction_impossible"; value?: number } {
  if (payload.sourceCase !== expectedCase) {
    return { status: "extraction_impossible" };
  }
  if (payload.status === "missing") return { status: "missing" };
  if (payload.status === "extraction_impossible") {
    return { status: "extraction_impossible" };
  }
  if (payload.status !== "present") {
    return { status: "extraction_impossible" };
  }
  if (payload.value === null || payload.value === undefined) {
    return { status: "extraction_impossible" };
  }
  if (!Number.isFinite(payload.value) || payload.value < 0) {
    return { status: "extraction_impossible" };
  }
  return { status: "present", value: payload.value };
}

/** Schéma JSON Vision 4D.3 — cases explicites, status déterministe. */
export const TAX_PACKAGE_LIASSE_VISION_JSON_SCHEMA = {
  name: "tax_package_liasse_cases_v1",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["formType", "cases"],
    properties: {
      formType: { type: "string", enum: ["2033A", "2033C", "unknown"] },
      cases: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["sourceCase", "status", "value"],
          properties: {
            sourceCase: { type: "string" },
            status: {
              type: "string",
              enum: ["present", "missing", "extraction_impossible"],
            },
            value: { type: ["number", "null"] },
          },
        },
      },
    },
  },
} as const;

export function buildTaxPackageLiasseVisionSystemPrompt(
  formType: TaxPackageLiasseFormType,
  sourceCases: readonly string[],
): string {
  return [
    `Tu lis un formulaire fiscal français ${formType} (liasse N-1).`,
    `Cases demandées EXACTEMENT : ${sourceCases.join(", ")}.`,
    "Pour chaque case, retourne status present | missing | extraction_impossible.",
    "value = number si present, sinon null.",
    "0 imprimé explicitement → present avec value 0.",
    "Case vide → missing (JAMAIS 0 inventé).",
    "Doute, montant voisin, case illisible → extraction_impossible.",
    "Ne devine pas. N'utilise pas un montant d'une autre case.",
    "N'extrais aucune autre case.",
  ].join("\n");
}

const TaxPackageLiasseVisionCaseZod = z.object({
  sourceCase: z.string(),
  status: z.enum(["present", "missing", "extraction_impossible"]),
  value: z.number().nullable(),
});

/**
 * Lot 5.5-A — déplacé depuis tax-package-liasse-vision-server.ts : pure
 * (aucun appel OpenAI, aucun `server-only`), co-localisée avec le schéma/
 * prompt Vision qu'elle valide — même séparation que
 * depreciation-register-vision-schema.ts (pur) vs
 * depreciation-register-vision-server.ts (OpenAI + server-only).
 */
export const TaxPackageLiasseVisionFormZodSchema = z.object({
  formType: z.enum(["2033A", "2033C", "unknown"]),
  cases: z.array(TaxPackageLiasseVisionCaseZod),
});

/**
 * Valide le payload Vision 4D.3. Échec → formType unknown + cases vides
 * (l'appelant 4D.3 mappe en extraction_impossible case par case).
 */
export function parseTaxPackageLiasseVisionFormPayload(
  raw: unknown,
  expectedFormType: TaxPackageLiasseFormType,
  expectedCases: readonly string[],
): TaxPackageLiasseVisionFormPayload {
  const parsed = TaxPackageLiasseVisionFormZodSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      formType: "unknown",
      cases: expectedCases.map((sourceCase) => ({
        sourceCase,
        status: "extraction_impossible" as const,
        value: null,
      })),
    };
  }

  const byCase = new Map(parsed.data.cases.map((c) => [c.sourceCase, c] as const));
  const cases: TaxPackageLiasseVisionCasePayload[] = expectedCases.map((sourceCase) => {
    const hit = byCase.get(sourceCase);
    if (!hit) {
      return { sourceCase, status: "extraction_impossible", value: null };
    }
    return { sourceCase: hit.sourceCase, status: hit.status, value: hit.value };
  });

  // formType mismatch → fail closed on all cases
  if (parsed.data.formType !== expectedFormType && parsed.data.formType !== "unknown") {
    return {
      formType: "unknown",
      cases: expectedCases.map((sourceCase) => ({
        sourceCase,
        status: "extraction_impossible" as const,
        value: null,
      })),
    };
  }

  return { formType: parsed.data.formType, cases };
}

/**
 * Extracteur minimal liasse N-1.
 * Native-first ; Vision seulement pour cases non exploitables sur une page
 * déjà identifiée comme formulaire. Formulaire absent → document_absent, pas Vision.
 */
export async function extractTaxPackageLiasseObservations(
  input: ExtractTaxPackageLiasseObservationsInput,
): Promise<ExtractTaxPackageLiasseObservationsResult> {
  const documentRole: TakeoverDocumentRole = input.documentRole ?? "prior_tax_package";
  const diagnostics: string[] = [];
  const observations: TaxPackageLiasseCaseObservation[] = [];
  let visionCalled = false;

  const pagesByForm: Record<TaxPackageLiasseFormType, TaxPackageLiassePageText[]> = {
    "2033A": [],
    "2033C": [],
  };
  /** Formulaire identifié mais millésime incompatible avec formYear. */
  const incompatibleMillesimeForms = new Set<TaxPackageLiasseFormType>();

  for (const page of input.pages) {
    const form = identifyTaxPackageLiasseForm(page.text);
    if (!form) {
      if (page.text.trim()) {
        diagnostics.push(`page ${page.pageNumber}: formulaire non identifié`);
      }
      continue;
    }
    if (!isTaxPackageLiasseFormYearCompatible(page.text, form, input.formYear)) {
      incompatibleMillesimeForms.add(form);
      diagnostics.push(
        `page ${page.pageNumber}: millésime incompatible avec formYear=${input.formYear}`,
      );
      continue;
    }
    pagesByForm[form].push(page);
  }

  const identifiedForms = (["2033A", "2033C"] as const).filter(
    (f) => pagesByForm[f].length > 0,
  );

  type Pending = {
    formType: TaxPackageLiasseFormType;
    sourceCase: string;
    native: CandidateValue<number> | null;
    pageNumber?: number;
  };

  const pending: Pending[] = [];

  for (const formType of ["2033A", "2033C"] as const) {
    const cases = v1CasesForForm(formType);
    const formPages = pagesByForm[formType];

    if (formPages.length === 0) {
      if (incompatibleMillesimeForms.has(formType)) {
        // Formulaire présent mais mauvais millésime — pas document_absent,
        // pas present(value). extraction_impossible explicite.
        for (const sourceCase of cases) {
          pending.push({
            formType,
            sourceCase,
            native: extractionImpossibleCandidate(
              `formulaire ${formType} présent mais millésime incompatible avec formYear=${input.formYear}`,
              {
                documentId: input.documentId,
                documentRole,
                fieldLabel: `${formType}:${sourceCase}`,
                sourceRef: `${formType}:${sourceCase}`,
              },
            ),
          });
        }
      } else {
        for (const sourceCase of cases) {
          pending.push({
            formType,
            sourceCase,
            native: null,
          });
        }
      }
      continue;
    }

    for (const page of formPages) {
      for (const sourceCase of cases) {
        const read = readNativeTaxPackageCase(page.text, sourceCase, page.pageNumber);
        let value = toCandidateValue(read, {
          documentId: input.documentId,
          documentRole,
          formType,
          sourceCase,
          extractionMethod: "native_pdf_text_liasse_v1",
          confidenceValue: 0.9,
          confidenceFactors: ["native_pdf_text", formType, sourceCase],
        });
        // Scan : missing + image → forcer le chemin Vision (pas d'acceptation silent missing).
        if (
          input.visionOnMissing === true &&
          read.status === "missing" &&
          findImage(input.pageImages, page.pageNumber)
        ) {
          value = extractionImpossibleCandidate(
            "texte natif absent — Vision requise (scan)",
            {
              documentId: input.documentId,
              documentRole,
              fieldLabel: `${formType}:${sourceCase}`,
              sourceRef: `${formType}:${sourceCase}`,
            },
          );
        }
        pending.push({
          formType,
          sourceCase,
          native: value,
          pageNumber: page.pageNumber,
        });
      }
    }
  }

  // Vision uniquement si page formulaire identifiée ET case non exploitable.
  // Formulaire absent (native === null) → document_absent, jamais Vision.
  const needsVision = pending.filter(
    (p) => p.native !== null && !isExploitable(p.native) && p.pageNumber !== undefined,
  );

  async function resolveViaVision(
    formType: TaxPackageLiasseFormType,
    sourceCases: string[],
    pageNumber: number,
  ): Promise<Map<string, CandidateValue<number>>> {
    const out = new Map<string, CandidateValue<number>>();
    if (!input.visionRequester || sourceCases.length === 0) {
      for (const sourceCase of sourceCases) {
        out.set(
          sourceCase,
          extractionImpossibleCandidate("Vision non disponible pour case non exploitable", {
            documentId: input.documentId,
            documentRole,
            fieldLabel: `${formType}:${sourceCase}`,
            sourceRef: `${formType}:${sourceCase}`,
          }),
        );
      }
      return out;
    }

    visionCalled = true;
    const pageTextHint = input.pages.find((p) => p.pageNumber === pageNumber)?.text;

    const payload = await input.visionRequester({
      formType,
      sourceCases,
      pageNumber,
      pageTextHint,
      pageImage: findImage(input.pageImages, pageNumber),
    });

    const byCase = new Map(
      payload.cases.map((c) => [c.sourceCase, c] as const),
    );

    for (const sourceCase of sourceCases) {
      const raw = byCase.get(sourceCase);
      if (!raw) {
        out.set(
          sourceCase,
          extractionImpossibleCandidate("Vision n'a pas retourné la case", {
            documentId: input.documentId,
            documentRole,
            fieldLabel: `${formType}:${sourceCase}`,
            sourceRef: `${formType}:${sourceCase}`,
          }),
        );
        continue;
      }
      const normalized = normalizeVisionCase(raw, sourceCase);
      out.set(
        sourceCase,
        toCandidateValue(
          { ...normalized, pageNumber },
          {
            documentId: input.documentId,
            documentRole,
            formType,
            sourceCase,
            extractionMethod: "vision_structured_liasse_v1",
            confidenceValue: 0.75,
            confidenceFactors: ["vision_structured", formType, sourceCase],
          },
        ),
      );
    }
    return out;
  }

  // Groupe Vision par (formType, pageNumber) — jamais fusionner deux pages.
  const visionGroups = new Map<
    string,
    { formType: TaxPackageLiasseFormType; pageNumber: number; sourceCases: Set<string> }
  >();

  for (const item of needsVision) {
    const pageNumber = item.pageNumber!;
    const groupKey = `${item.formType}:${pageNumber}`;
    const group = visionGroups.get(groupKey) ?? {
      formType: item.formType,
      pageNumber,
      sourceCases: new Set<string>(),
    };
    group.sourceCases.add(item.sourceCase);
    visionGroups.set(groupKey, group);
  }

  const visionResolved = new Map<string, CandidateValue<number>>();
  if (input.visionRequester && needsVision.length > 0) {
    for (const group of visionGroups.values()) {
      const resolved = await resolveViaVision(
        group.formType,
        [...group.sourceCases],
        group.pageNumber,
      );
      for (const [sourceCase, value] of resolved) {
        visionResolved.set(
          `${group.formType}:${sourceCase}:${group.pageNumber}`,
          value,
        );
      }
    }
  } else if (needsVision.length > 0) {
    diagnostics.push(
      "cases non exploitables en natif — Vision non fournie, extraction_impossible conservé",
    );
  }

  for (const item of pending) {
    if (item.native && isExploitable(item.native)) {
      observations.push(
        observationFrom(
          item.formType,
          item.sourceCase,
          input.formYear,
          input.fiscalYear,
          item.native,
        ),
      );
      continue;
    }

    if (item.pageNumber !== undefined) {
      const key = `${item.formType}:${item.sourceCase}:${item.pageNumber}`;
      const fromVision = visionResolved.get(key);
      if (fromVision) {
        observations.push(
          observationFrom(
            item.formType,
            item.sourceCase,
            input.formYear,
            input.fiscalYear,
            fromVision,
          ),
        );
        continue;
      }
    }

    // Natif non exploitable, Vision absente — ou formulaire absent
    if (item.native) {
      observations.push(
        observationFrom(
          item.formType,
          item.sourceCase,
          input.formYear,
          input.fiscalYear,
          item.native,
        ),
      );
    } else {
      observations.push(
        observationFrom(
          item.formType,
          item.sourceCase,
          input.formYear,
          input.fiscalYear,
          documentAbsentCandidate("formulaire/page absent du document", {
            documentId: input.documentId,
            documentRole,
            fieldLabel: `${item.formType}:${item.sourceCase}`,
            sourceRef: `${item.formType}:${item.sourceCase}`,
          }),
        ),
      );
    }
  }

  return {
    status: "extracted",
    observations,
    identifiedForms: [...identifiedForms],
    visionCalled,
    diagnostics,
  };
}
