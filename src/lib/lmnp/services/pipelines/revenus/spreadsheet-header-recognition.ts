/**
 * Deterministic spreadsheet column header recognition for rent trackers.
 * No GPT — inspectable alias matching only.
 */

export type SpreadsheetBusinessField =
  | "month"
  | "rent"
  | "complement"
  | "paymentDate"
  | "platform"
  | "indemnity";

/**
 * Champs pour lesquels plusieurs colonnes peuvent légitimement coexister (ex.
 * Airbnb + Booking + Abritel). "complement" y a été ajouté au Cycle 18 : un
 * classeur avec à la fois une colonne "CAF" et une colonne "Remboursement
 * charges" ne faisait gagner QU'UNE seule des deux (la mieux notée) le champ
 * "complement" — l'autre était rejetée ("lower_score_same_field") et son
 * montant disparaissait entièrement de l'extraction, sans aucune trace.
 */
const MULTI_COLUMN_FIELDS: SpreadsheetBusinessField[] = ["platform", "indemnity", "complement"];
const SINGLE_COLUMN_FIELDS: SpreadsheetBusinessField[] = ["month", "rent", "paymentDate"];

export type SpreadsheetMatchStrategy = "exact" | "startsWith" | "includes" | "tokenSimilarity";

export type SpreadsheetHeaderMatchResult = {
  rawHeader: string;
  normalizedHeader: string;
  matchedField: SpreadsheetBusinessField;
  matchedAlias: string;
  confidenceScore: number;
  columnIndex: number;
  matchStrategy: SpreadsheetMatchStrategy;
};

export type SpreadsheetColumnMapping = Partial<
  Record<SpreadsheetBusinessField, SpreadsheetHeaderMatchResult>
> & {
  /**
   * Toutes les colonnes plateforme/indemnité au-dessus du seuil de confiance — pas
   * seulement la meilleure. Un export bancaire peut avoir Airbnb + Booking + Abritel
   * simultanément ; contrairement à `rent`/`complement`, ces montants doivent être
   * sommés, jamais réduits à une seule colonne gagnante.
   */
  platformColumns?: SpreadsheetHeaderMatchResult[];
  indemnityColumns?: SpreadsheetHeaderMatchResult[];
  /** Cycle 18 — même logique que platformColumns/indemnityColumns : ex. CAF + Remboursement charges simultanés. */
  complementColumns?: SpreadsheetHeaderMatchResult[];
};

export type SpreadsheetHeaderRecognitionAudit = {
  headerRowIndex: number;
  rawHeaders: string[];
  normalizedHeaders: string[];
  candidateMatches: SpreadsheetHeaderMatchResult[];
  selectedMapping: SpreadsheetColumnMapping;
  rejectedMatches: Array<{
    rawHeader: string;
    normalizedHeader: string;
    matchedField: SpreadsheetBusinessField;
    matchedAlias: string;
    confidenceScore: number;
    reason: string;
  }>;
};

const MIN_ACCEPT_SCORE = 70;

const FIELD_ALIASES: Record<SpreadsheetBusinessField, readonly string[]> = {
  month: ["mois", "periode", "period", "month", "mensualite", "exercice"],
  rent: [
    "loyer",
    "loyers",
    "loyer mensuel",
    "montant loyer",
    "revenu locatif",
    "rent",
    "encaissement",
    "loyer hc",
    "loyer hors charges",
  ],
  complement: [
    "complement",
    "complements",
    "complement de loyer",
    "compl",
    "annexe",
    "revenu complementaire",
    "autres revenus",
    "charges",
    "charges locatives",
    "allocation",
    "caf",
    // Cycle 17 — absente de cette liste alors que `revenus-header-classification.ts`
    // (OTHER_INCOME_HEADER_PATTERNS, chemin PDF/OCR) la reconnaît déjà comme un
    // revenu "autres" : une colonne Excel/CSV nommée "Remboursement" ne matchait
    // aucun champ ici et disparaissait donc entièrement de l'extraction, sans
    // trace ni anomalie — bug reproduit et corrigé au Cycle 17.
    "remboursement",
  ],
  paymentDate: [
    "date",
    "date paiement",
    "date encaissement",
    "date de paiement",
    "date perception",
    "date versement",
    "date virement",
  ],
  platform: [
    "airbnb",
    "booking",
    "abritel",
    "vrbo",
    "plateforme",
    "virement plateforme",
    "location touristique",
    "location saisonniere",
  ],
  indemnity: [
    "gli",
    "visale",
    "indemnite",
    "indemnite assurance",
    "assurance loyers impayes",
    // Cycle 18 — synonyme courant de GLI, absent jusqu'ici : sans cet alias,
    // "Garantie loyers impayés" ne matchait AUCUN champ indemnity (score <70)
    // et se faisait accidentellement absorber par le champ "rent" via
    // includes("loyer") à 85 — un versement d'assurance classé comme loyer.
    "garantie loyers impayes",
    "sinistre",
  ],
};

/** Spreadsheet-specific normalization (stricter punctuation strip than PDF headers). */
export function normalizeSpreadsheetHeader(header: string): string {
  return header
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(normalized: string): string[] {
  return normalized.split(" ").filter((token) => token.length > 0);
}

function tokenSimilarityScore(normalized: string, alias: string): number {
  const headerTokens = tokenize(normalized);
  const aliasTokens = tokenize(alias);
  if (headerTokens.length === 0 || aliasTokens.length === 0) return 0;

  const aliasSet = new Set(aliasTokens);
  let intersection = 0;
  for (const token of headerTokens) {
    if (aliasSet.has(token)) intersection += 1;
  }

  const union = new Set([...headerTokens, ...aliasTokens]).size;
  if (union === 0) return 0;

  const jaccard = intersection / union;
  return Math.round(jaccard * 80);
}

function scoreAliasMatch(
  normalizedHeader: string,
  alias: string,
): { confidenceScore: number; matchStrategy: SpreadsheetMatchStrategy; matchedAlias: string } | null {
  const normalizedAlias = normalizeSpreadsheetHeader(alias);
  if (!normalizedAlias) return null;

  if (normalizedHeader === normalizedAlias) {
    return { confidenceScore: 100, matchStrategy: "exact", matchedAlias: alias };
  }

  if (normalizedHeader.startsWith(normalizedAlias)) {
    return { confidenceScore: 92, matchStrategy: "startsWith", matchedAlias: alias };
  }

  if (normalizedAlias.length >= 3 && normalizedHeader.includes(normalizedAlias)) {
    return { confidenceScore: 85, matchStrategy: "includes", matchedAlias: alias };
  }

  const tokenScore = tokenSimilarityScore(normalizedHeader, normalizedAlias);
  if (tokenScore >= MIN_ACCEPT_SCORE) {
    return {
      confidenceScore: tokenScore,
      matchStrategy: "tokenSimilarity",
      matchedAlias: alias,
    };
  }

  return null;
}

function matchHeaderToField(
  rawHeader: string,
  columnIndex: number,
  field: SpreadsheetBusinessField,
): SpreadsheetHeaderMatchResult | null {
  const normalizedHeader = normalizeSpreadsheetHeader(rawHeader);
  if (!normalizedHeader) return null;

  let best: SpreadsheetHeaderMatchResult | null = null;

  for (const alias of FIELD_ALIASES[field]) {
    const scored = scoreAliasMatch(normalizedHeader, alias);
    if (!scored) continue;

    if (!best || scored.confidenceScore > best.confidenceScore) {
      best = {
        rawHeader,
        normalizedHeader,
        matchedField: field,
        matchedAlias: scored.matchedAlias,
        confidenceScore: scored.confidenceScore,
        columnIndex,
        matchStrategy: scored.matchStrategy,
      };
    }
  }

  if (!best || best.confidenceScore < MIN_ACCEPT_SCORE) return null;
  return best;
}

function allCandidatesForHeader(
  rawHeader: string,
  columnIndex: number,
): SpreadsheetHeaderMatchResult[] {
  const candidates: SpreadsheetHeaderMatchResult[] = [];
  const fields: SpreadsheetBusinessField[] = [...SINGLE_COLUMN_FIELDS, ...MULTI_COLUMN_FIELDS];

  for (const field of fields) {
    const match = matchHeaderToField(rawHeader, columnIndex, field);
    if (match) candidates.push(match);
  }

  return candidates.sort((a, b) => b.confidenceScore - a.confidenceScore);
}

function pickBestPerField(
  candidates: SpreadsheetHeaderMatchResult[],
): {
  selected: SpreadsheetColumnMapping;
  rejected: SpreadsheetHeaderRecognitionAudit["rejectedMatches"];
} {
  const selected: SpreadsheetColumnMapping = {};
  const rejected: SpreadsheetHeaderRecognitionAudit["rejectedMatches"] = [];

  // Cycle 18 — un même en-tête peut être un candidat simultané pour un champ
  // mono-colonne (ex. "rent") ET un champ multi-colonnes (ex. "indemnity") :
  // les deux boucles étaient jusqu'ici totalement indépendantes, chacune
  // pouvant "gagner" sur la MÊME colonne. Conséquence démontrée : un en-tête
  // "Garantie loyers impayés" (candidat "rent" à 85 via includes("loyer"),
  // Cycle 18) pouvait être sélectionné comme colonne de loyer ; en ajoutant
  // séparément un alias "indemnity" pour cette même expression, la colonne
  // aurait alors été extraite DEUX FOIS (une fois comme loyer, une fois comme
  // indemnité) — un même euro compté deux fois. Les champs multi-colonnes
  // (plateforme, indemnité) sont donc résolus EN PREMIER et priment toujours
  // sur les champs mono-colonnes pour une même colonne : ce sont les
  // classifications les plus spécifiques, jamais un simple repli générique.
  const multiColumnClaimedIndices = new Set(
    candidates
      .filter((candidate) => MULTI_COLUMN_FIELDS.includes(candidate.matchedField))
      .map((candidate) => candidate.columnIndex),
  );

  for (const field of SINGLE_COLUMN_FIELDS) {
    const fieldCandidates = candidates
      .filter(
        (candidate) =>
          candidate.matchedField === field && !multiColumnClaimedIndices.has(candidate.columnIndex),
      )
      .sort((a, b) => b.confidenceScore - a.confidenceScore);

    if (fieldCandidates.length === 0) continue;

    const winner = fieldCandidates[0]!;
    const existing = selected[field];
    if (!existing || winner.confidenceScore > existing.confidenceScore) {
      if (existing) {
        rejected.push({
          rawHeader: existing.rawHeader,
          normalizedHeader: existing.normalizedHeader,
          matchedField: field,
          matchedAlias: existing.matchedAlias,
          confidenceScore: existing.confidenceScore,
          reason: "superseded_by_higher_score_column",
        });
      }
      selected[field] = winner;
    }

    for (const loser of fieldCandidates.slice(1)) {
      rejected.push({
        rawHeader: loser.rawHeader,
        normalizedHeader: loser.normalizedHeader,
        matchedField: field,
        matchedAlias: loser.matchedAlias,
        confidenceScore: loser.confidenceScore,
        reason: "lower_score_same_field",
      });
    }
  }

  // Champs multi-colonnes : toutes les colonnes candidates sont conservées et
  // seront sommées à l'extraction — aucune n'est "rejetée" (voir doc du type).
  const platformColumns = candidates
    .filter((candidate) => candidate.matchedField === "platform")
    .sort((a, b) => b.confidenceScore - a.confidenceScore);
  if (platformColumns.length > 0) {
    selected.platform = platformColumns[0];
    selected.platformColumns = platformColumns;
  }

  const indemnityColumns = candidates
    .filter((candidate) => candidate.matchedField === "indemnity")
    .sort((a, b) => b.confidenceScore - a.confidenceScore);
  if (indemnityColumns.length > 0) {
    selected.indemnity = indemnityColumns[0];
    selected.indemnityColumns = indemnityColumns;
  }

  const complementColumns = candidates
    .filter((candidate) => candidate.matchedField === "complement")
    .sort((a, b) => b.confidenceScore - a.confidenceScore);
  if (complementColumns.length > 0) {
    selected.complement = complementColumns[0];
    selected.complementColumns = complementColumns;
  }

  return { selected, rejected };
}

function rowMappingScore(mapping: SpreadsheetColumnMapping): number {
  let score = 0;
  if (mapping.month) score += mapping.month.confidenceScore;
  if (mapping.rent) score += mapping.rent.confidenceScore;
  if (mapping.paymentDate) score += mapping.paymentDate.confidenceScore * 0.5;
  for (const column of mapping.platformColumns ?? []) score += column.confidenceScore;
  for (const column of mapping.indemnityColumns ?? []) score += column.confidenceScore;
  for (const column of mapping.complementColumns ?? []) score += column.confidenceScore;
  return score;
}

function mappingIsViable(mapping: SpreadsheetColumnMapping): boolean {
  const hasMonth = Boolean(mapping.month);
  const hasMoney = Boolean(
    mapping.rent || mapping.complement || mapping.platform || mapping.indemnity,
  );
  return hasMoney && (hasMonth || Boolean(mapping.paymentDate));
}

export function recognizeSpreadsheetHeaders(
  grid: string[][],
  options?: { maxHeaderScanRows?: number },
): SpreadsheetHeaderRecognitionAudit | null {
  const maxRows = options?.maxHeaderScanRows ?? 20;
  const scanRows = grid.slice(0, maxRows);

  let bestRowIndex = -1;
  let bestMapping: SpreadsheetColumnMapping = {};
  let bestCandidates: SpreadsheetHeaderMatchResult[] = [];
  let bestRejected: SpreadsheetHeaderRecognitionAudit["rejectedMatches"] = [];

  for (let rowIndex = 0; rowIndex < scanRows.length; rowIndex += 1) {
    const row = scanRows[rowIndex] ?? [];
    const nonEmpty = row.filter((cell) => cell.trim().length > 0);
    if (nonEmpty.length < 2) continue;

    const rowCandidates: SpreadsheetHeaderMatchResult[] = [];
    for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
      const rawHeader = row[columnIndex] ?? "";
      if (!rawHeader.trim()) continue;
      rowCandidates.push(...allCandidatesForHeader(rawHeader, columnIndex));
    }

    const { selected, rejected } = pickBestPerField(rowCandidates);
    if (!mappingIsViable(selected)) continue;

    const score = rowMappingScore(selected);
    const bestScore = rowMappingScore(bestMapping);
    if (score > bestScore) {
      bestRowIndex = rowIndex;
      bestMapping = selected;
      bestCandidates = rowCandidates;
      bestRejected = rejected;
    }
  }

  if (bestRowIndex < 0) return null;

  const headerRow = grid[bestRowIndex] ?? [];
  const rawHeaders = headerRow.map((cell) => cell.trim());
  const normalizedHeaders = rawHeaders.map((header) => normalizeSpreadsheetHeader(header));

  return {
    headerRowIndex: bestRowIndex,
    rawHeaders,
    normalizedHeaders,
    candidateMatches: bestCandidates,
    selectedMapping: bestMapping,
    rejectedMatches: bestRejected,
  };
}

export function formatSpreadsheetMappingDebugBlock(mapping: SpreadsheetColumnMapping): string {
  const lines: string[] = ["Detected spreadsheet mapping:"];

  for (const field of [...SINGLE_COLUMN_FIELDS, "platform", "indemnity", "complement"] as SpreadsheetBusinessField[]) {
    const match = mapping[field];
    if (!match) continue;
    lines.push(
      `${field} -> "${match.rawHeader}" (alias: ${match.matchedAlias}, score: ${match.confidenceScore}, ${match.matchStrategy})`,
    );
  }

  for (const column of mapping.platformColumns ?? []) {
    if (column === mapping.platform) continue;
    lines.push(`platform (+) -> "${column.rawHeader}" (alias: ${column.matchedAlias}, score: ${column.confidenceScore})`);
  }
  for (const column of mapping.indemnityColumns ?? []) {
    if (column === mapping.indemnity) continue;
    lines.push(`indemnity (+) -> "${column.rawHeader}" (alias: ${column.matchedAlias}, score: ${column.confidenceScore})`);
  }
  for (const column of mapping.complementColumns ?? []) {
    if (column === mapping.complement) continue;
    lines.push(`complement (+) -> "${column.rawHeader}" (alias: ${column.matchedAlias}, score: ${column.confidenceScore})`);
  }

  if (lines.length === 1) {
    lines.push("(no columns matched)");
  }

  return lines.join("\n");
}

export function logSpreadsheetHeaderRecognition(
  audit: SpreadsheetHeaderRecognitionAudit | null,
): void {
  if (!audit) {
    console.log("[spreadsheet-revenue-debug]", {
      stage: "header_recognition",
      status: "no_viable_header_row",
    });
    return;
  }

  console.log("[spreadsheet-revenue-debug]", {
    stage: "header_recognition",
    headerRowIndex: audit.headerRowIndex,
    rawHeaders: audit.rawHeaders,
    normalizedHeaders: audit.normalizedHeaders,
    candidateMatches: audit.candidateMatches.map((match) => ({
      columnIndex: match.columnIndex,
      rawHeader: match.rawHeader,
      normalizedHeader: match.normalizedHeader,
      matchedField: match.matchedField,
      matchedAlias: match.matchedAlias,
      confidenceScore: match.confidenceScore,
      matchStrategy: match.matchStrategy,
    })),
    selectedMapping: audit.selectedMapping,
    rejectedMappings: audit.rejectedMatches,
  });

  console.log(
    "[spreadsheet-revenue-debug]\n" + formatSpreadsheetMappingDebugBlock(audit.selectedMapping),
  );
}
