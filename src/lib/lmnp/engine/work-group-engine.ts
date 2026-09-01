/**
 * LMNP Business Engine — Layer 2: Chantier Consolidation Engine
 *
 * Detects and PROPOSES groupings of related invoices that likely belong
 * to the same economic project (same kitchen renovation, bathroom refit, etc.)
 *
 * This engine NEVER silently merges invoices.
 * It always returns WorkGroup proposals for user confirmation.
 */

import type {
  AccountingCategory,
  ExtractedAccountingFact,
  WorkGroup,
  WorkGroupStatus,
} from "./business-engine.types";

// ---------------------------------------------------------------------------
// Suggested durations by dominant category (V1 model)
// ---------------------------------------------------------------------------

const CATEGORY_DEFAULT_DURATION: Record<AccountingCategory, number> = {
  immeuble: 30,
  travaux: 12,
  mobilier: 7,
  electromenager: 6,
  cuisine: 10,
  assurance: 0,
  taxe_fonciere: 0,
  autre: 10,
};

// ---------------------------------------------------------------------------
// Keyword clusters — used to detect semantic similarity
// ---------------------------------------------------------------------------

const KEYWORD_CLUSTERS: Record<string, string[]> = {
  cuisine: ["cuisine", "plan de travail", "évier", "meuble bas", "meuble haut", "électroménager", "hotte", "four", "lave-vaisselle", "réfrigérateur", "schmidt", "ikea", "but", "leroy merlin"],
  salle_de_bain: ["salle de bain", "douche", "baignoire", "sanitaire", "carrelage", "faïence", "faience", "wc", "vasque", "robinetterie", "plomberie"],
  peinture: ["peinture", "enduit", "crépi", "bardage", "ravalement", "lasure"],
  mobilier: ["canapé", "lit", "armoire", "commode", "bureau", "table", "chaise", "bibliothèque", "meuble"],
  chauffage: ["chaudière", "chauffage", "radiateur", "plancher chauffant", "pompe à chaleur", "pac", "vmc", "climatisation", "clim"],
  fenetres: ["fenêtre", "fenetre", "porte-fenêtre", "volet", "store", "menuiserie", "double vitrage"],
  toiture: ["toiture", "couverture", "zinguerie", "charpente", "isolation toiture"],
  electricite: ["électricité", "electricite", "tableau électrique", "câblage", "prises", "interrupteurs"],
  sols: ["parquet", "carrelage", "sol", "moquette", "revêtement de sol"],
};

/**
 * Normalize a supplier name for comparison.
 * Removes accents, lowercases, collapses whitespace.
 */
function normalizeSupplier(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Returns true when two normalized supplier names are similar enough
 * to be considered the same entity.
 * Handles common abbreviations (e.g. "SARL Schmidt" ≈ "Schmidt").
 */
function isSameSupplier(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  const na = normalizeSupplier(a);
  const nb = normalizeSupplier(b);
  if (na === nb) return true;
  // One contains the other (handles "SARL SCHMIDT" vs "SCHMIDT")
  return na.includes(nb) || nb.includes(na);
}

/**
 * Returns true when two invoice dates are within 12 months of each other.
 * If either date is missing, returns true (ambiguous — don't exclude).
 */
function datesWithinWindow(d1?: string, d2?: string, windowMonths = 12): boolean {
  if (!d1 || !d2) return true;
  const t1 = Date.parse(d1);
  const t2 = Date.parse(d2);
  if (isNaN(t1) || isNaN(t2)) return true;
  const monthsDiff = Math.abs(t1 - t2) / (1000 * 60 * 60 * 24 * 30.44);
  return monthsDiff <= windowMonths;
}

/**
 * Returns the number of keywords shared between two facts (semantic overlap).
 */
function countSharedKeywords(k1: string[], k2: string[]): number {
  const set2 = new Set(k2.map((k) => k.toLowerCase()));
  return k1.filter((k) => set2.has(k.toLowerCase())).length;
}

/**
 * Returns true when two facts share a non-trivial project reference
 * (devis number, order number, chantier number).
 */
function hasSharedProjectReference(a: ExtractedAccountingFact, b: ExtractedAccountingFact): boolean {
  if (!a.projectReference || !b.projectReference) return false;
  const ra = a.projectReference.trim().toUpperCase();
  const rb = b.projectReference.trim().toUpperCase();
  return ra === rb && ra.length >= 4;
}

/**
 * Detect which keyword cluster best matches a list of keywords.
 * Returns null if no clear cluster.
 */
function detectCluster(keywords: string[]): string | null {
  const text = keywords.join(" ").toLowerCase();
  let bestCluster: string | null = null;
  let bestScore = 0;
  for (const [cluster, clusterKeywords] of Object.entries(KEYWORD_CLUSTERS)) {
    const matches = clusterKeywords.filter((kw) => text.includes(kw)).length;
    if (matches > bestScore) {
      bestScore = matches;
      bestCluster = cluster;
    }
  }
  return bestScore >= 1 ? bestCluster : null;
}

/**
 * Determines whether two facts are candidates for grouping.
 * Returns a grouping score (0 = no grouping, higher = stronger signal).
 */
function groupingScore(a: ExtractedAccountingFact, b: ExtractedAccountingFact): number {
  let score = 0;

  // Strong signals
  if (hasSharedProjectReference(a, b)) score += 40;
  if (isSameSupplier(a.supplier, b.supplier)) score += 30;

  // Same dominant category is a prerequisite for most groupings
  if (a.detectedCategory === b.detectedCategory) score += 15;

  // Keyword overlap
  const sharedKw = countSharedKeywords(a.keywords, b.keywords);
  score += Math.min(sharedKw * 5, 20);

  // Same keyword cluster (semantic similarity)
  const clusterA = detectCluster(a.keywords);
  const clusterB = detectCluster(b.keywords);
  if (clusterA && clusterA === clusterB) score += 15;

  // Temporal proximity (within 12 months)
  if (datesWithinWindow(a.invoiceDate, b.invoiceDate)) score += 10;

  // Penalize if dates are far apart (> 18 months)
  if (!datesWithinWindow(a.invoiceDate, b.invoiceDate, 18)) score -= 30;

  // Penalize cross-property grouping (handled by caller via propertyId)

  return score;
}

/** Minimum score to propose a grouping to the user. */
const GROUPING_THRESHOLD = 40;

// ---------------------------------------------------------------------------
// Project label inference
// ---------------------------------------------------------------------------

function inferProjectLabel(facts: ExtractedAccountingFact[], cluster: string | null): string {
  const allKeywords = facts.flatMap((f) => f.keywords).map((k) => k.toLowerCase());
  const supplier = facts[0]?.supplier;

  const clusterLabels: Record<string, string> = {
    cuisine: "Cuisine équipée",
    salle_de_bain: "Salle de bain",
    peinture: "Travaux de peinture",
    mobilier: "Mobilier",
    chauffage: "Installation chauffage",
    fenetres: "Menuiseries / fenêtres",
    toiture: "Toiture",
    electricite: "Électricité",
    sols: "Revêtements de sol",
  };

  const base = cluster ? (clusterLabels[cluster] ?? "Travaux") : "Travaux";

  if (supplier) {
    return `${base} — ${supplier}`;
  }

  // Try to infer from keywords
  if (allKeywords.some((k) => k.includes("salle de bain"))) return "Rénovation salle de bain";
  if (allKeywords.some((k) => k.includes("cuisine"))) return "Cuisine équipée";
  if (allKeywords.some((k) => k.includes("fenêtre") || k.includes("fenetre"))) return "Remplacement fenêtres";
  if (allKeywords.some((k) => k.includes("parquet") || k.includes("carrelage"))) return "Revêtements de sol";

  return base;
}

// ---------------------------------------------------------------------------
// Dominant category resolution
// ---------------------------------------------------------------------------

function resolveDominantCategory(facts: ExtractedAccountingFact[]): AccountingCategory {
  const counts: Partial<Record<AccountingCategory, number>> = {};
  for (const f of facts) {
    counts[f.detectedCategory] = (counts[f.detectedCategory] ?? 0) + f.amountTTC;
  }
  let dominant: AccountingCategory = "autre";
  let maxAmount = 0;
  for (const [cat, amount] of Object.entries(counts)) {
    if ((amount ?? 0) > maxAmount) {
      maxAmount = amount ?? 0;
      dominant = cat as AccountingCategory;
    }
  }
  return dominant;
}

// ---------------------------------------------------------------------------
// Grouping explanation (plain French)
// ---------------------------------------------------------------------------

function buildGroupingExplanation(facts: ExtractedAccountingFact[], cluster: string | null): string {
  const supplier = facts[0]?.supplier;
  const count = facts.length;
  const total = facts.reduce((sum, f) => sum + f.amountTTC, 0);

  const clusterFr: Record<string, string> = {
    cuisine: "projet de cuisine",
    salle_de_bain: "rénovation salle de bain",
    peinture: "travaux de peinture",
    mobilier: "achat mobilier",
    chauffage: "installation chauffage",
    fenetres: "remplacement fenêtres",
    toiture: "travaux toiture",
    electricite: "travaux électricité",
    sols: "revêtements de sol",
  };

  const projectFr = cluster ? (clusterFr[cluster] ?? "projet") : "projet";

  const parts = [
    `Nous avons détecté que ${count > 1 ? `ces ${count} factures appartiennent` : "cette facture appartient"} probablement au même ${projectFr}.`,
  ];

  if (supplier) {
    parts.push(`Fournisseur commun : ${supplier}.`);
  }

  const hasSharedRef = facts.some((f) => f.projectReference);
  if (hasSharedRef) {
    parts.push("Elles partagent une même référence de chantier ou de devis.");
  }

  const formattedTotal = new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(total);

  parts.push(`Montant total du projet : ${formattedTotal}.`);

  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Confidence calculation
// ---------------------------------------------------------------------------

function computeGroupConfidence(
  facts: ExtractedAccountingFact[],
  score: number,
): number {
  // Normalize the internal score to 0–1
  const baseConfidence = Math.min(score / 100, 1);
  // Penalize if any fact has low extraction confidence
  const minFactConfidence = Math.min(...facts.map((f) => f.confidence));
  return Math.round(baseConfidence * minFactConfidence * 100) / 100;
}

// ---------------------------------------------------------------------------
// Union-Find for transitive grouping
// ---------------------------------------------------------------------------

class UnionFind {
  private parent: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(x: number): number {
    if (this.parent[x] !== x) this.parent[x] = this.find(this.parent[x]);
    return this.parent[x];
  }
  union(x: number, y: number): void {
    const px = this.find(x);
    const py = this.find(y);
    if (px !== py) this.parent[px] = py;
  }
  groups(): Map<number, number[]> {
    const map = new Map<number, number[]>();
    for (let i = 0; i < this.parent.length; i++) {
      const root = this.find(i);
      if (!map.has(root)) map.set(root, []);
      map.get(root)!.push(i);
    }
    return map;
  }
}

// ---------------------------------------------------------------------------
// Main export — proposeWorkGroups
// ---------------------------------------------------------------------------

/**
 * Analyzes a list of ExtractedAccountingFacts and returns WorkGroup proposals.
 *
 * Rules:
 * - Same supplier within same property → strong grouping signal
 * - Shared project/devis reference → very strong signal
 * - Similar keywords (semantic cluster) → moderate signal
 * - Dates within 12 months → required temporal window
 *
 * Returns only PROPOSED groups — the user must confirm or reject each one.
 * Single-invoice facts that don't match any group are returned as solo proposals.
 */
export function proposeWorkGroups(
  facts: ExtractedAccountingFact[],
  propertyId?: string,
): WorkGroup[] {
  if (facts.length === 0) return [];

  // Filter to relevant categories (skip assurance / taxe_fonciere which never group)
  const groupableFacts = facts.filter(
    (f) => f.detectedCategory !== "assurance" && f.detectedCategory !== "taxe_fonciere",
  );

  if (groupableFacts.length === 0) return [];

  // Build adjacency using pairwise scoring
  const uf = new UnionFind(groupableFacts.length);

  for (let i = 0; i < groupableFacts.length; i++) {
    for (let j = i + 1; j < groupableFacts.length; j++) {
      const score = groupingScore(groupableFacts[i], groupableFacts[j]);
      if (score >= GROUPING_THRESHOLD) {
        uf.union(i, j);
      }
    }
  }

  // Build WorkGroup proposals from connected components
  const proposals: WorkGroup[] = [];
  const groups = uf.groups();

  for (const [, indices] of groups) {
    const groupFacts = indices.map((i) => groupableFacts[i]);
    const totalAmount = groupFacts.reduce((sum, f) => sum + f.amountTTC, 0);
    const dominantCategory = resolveDominantCategory(groupFacts);
    const cluster = detectCluster(groupFacts.flatMap((f) => f.keywords));

    // Compute representative score for the whole group
    let groupScore = 0;
    if (indices.length > 1) {
      let pairCount = 0;
      for (let i = 0; i < indices.length; i++) {
        for (let j = i + 1; j < indices.length; j++) {
          groupScore += groupingScore(groupableFacts[indices[i]], groupableFacts[indices[j]]);
          pairCount++;
        }
      }
      groupScore = pairCount > 0 ? groupScore / pairCount : 0;
    } else {
      groupScore = 50; // solo — neutral confidence
    }

    const confidence = computeGroupConfidence(groupFacts, groupScore);
    const detectedProjectLabel = inferProjectLabel(groupFacts, cluster);
    const proposedDurationYears = CATEGORY_DEFAULT_DURATION[dominantCategory] ?? 10;
    const explanation = buildGroupingExplanation(groupFacts, cluster);

    const dominantSupplier = groupFacts
      .map((f) => f.supplier)
      .filter(Boolean)
      .find(Boolean);

    proposals.push({
      id: `wg-${crypto.randomUUID()}`,
      propertyId,
      supplier: dominantSupplier,
      invoices: groupFacts,
      totalAmount,
      dominantCategory,
      detectedProjectLabel,
      proposedDurationYears,
      confidence,
      explanation,
      status: "proposed" as WorkGroupStatus,
    });
  }

  // Sort: multi-invoice groups first, then by total amount descending
  return proposals.sort((a, b) => {
    const bySize = b.invoices.length - a.invoices.length;
    if (bySize !== 0) return bySize;
    return b.totalAmount - a.totalAmount;
  });
}

/**
 * Confirm a WorkGroup — transitions status from "proposed" to "confirmed".
 * Optionally override the project label or duration.
 */
export function confirmWorkGroup(
  group: WorkGroup,
  overrides?: { label?: string; durationYears?: number },
): WorkGroup {
  return {
    ...group,
    detectedProjectLabel: overrides?.label ?? group.detectedProjectLabel,
    proposedDurationYears: overrides?.durationYears ?? group.proposedDurationYears,
    status: "confirmed",
    confirmedAt: new Date().toISOString(),
  };
}

/**
 * Reject a WorkGroup — user chose to keep invoices separate.
 * Each invoice in the group should then become its own solo WorkGroup.
 */
export function rejectWorkGroup(group: WorkGroup): WorkGroup {
  return {
    ...group,
    status: "rejected",
    rejectedAt: new Date().toISOString(),
  };
}

/**
 * Explode a rejected group into individual solo WorkGroup proposals.
 * Each fact gets its own standalone group for independent processing.
 */
export function splitWorkGroupToSolos(group: WorkGroup, propertyId?: string): WorkGroup[] {
  return group.invoices.map((fact) => {
    const cluster = detectCluster(fact.keywords);
    return {
      id: `wg-${crypto.randomUUID()}`,
      propertyId: propertyId ?? group.propertyId,
      supplier: fact.supplier,
      invoices: [fact],
      totalAmount: fact.amountTTC,
      dominantCategory: fact.detectedCategory,
      detectedProjectLabel: inferProjectLabel([fact], cluster),
      proposedDurationYears: CATEGORY_DEFAULT_DURATION[fact.detectedCategory] ?? 10,
      confidence: fact.confidence,
      explanation: `Facture traitée individuellement.`,
      status: "proposed" as WorkGroupStatus,
    };
  });
}
