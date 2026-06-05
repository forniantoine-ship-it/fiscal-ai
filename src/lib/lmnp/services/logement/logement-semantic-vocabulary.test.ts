import { normalizeLogementSemanticExtraction } from "./logement-semantic-normalization";
import {
  resolveCanonicalFieldFromKey,
  resolveCanonicalFieldFromTerm,
} from "./logement-semantic-vocabulary";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

assert(
  resolveCanonicalFieldFromTerm("prix de vente", "acquisition") === "acquisitionPrice",
  "prix de vente → acquisitionPrice",
);
assert(
  resolveCanonicalFieldFromTerm("ladite vente conclue moyennant", "acquisition") ===
    "acquisitionPrice",
  "ladite vente → acquisitionPrice",
);
assert(
  resolveCanonicalFieldFromTerm("acquéreur", "acquisition") === "buyerNames",
  "acquéreur → buyerNames",
);
assert(
  resolveCanonicalFieldFromTerm("désignation du bien", "acquisition") === "propertyAddress",
  "désignation → propertyAddress",
);
assert(
  resolveCanonicalFieldFromKey("propertyPurchasePrice", "acquisition") === "acquisitionPrice",
  "legacy propertyPurchasePrice → acquisitionPrice",
);
assert(
  resolveCanonicalFieldFromKey("surfaceM2", "acquisition") === "livingArea",
  "legacy surfaceM2 → livingArea",
);

const canonicalResult = normalizeLogementSemanticExtraction(
  {
    documentIntent: "acquisition",
    canonicalFields: {
      acquisitionPrice: 72500,
      acquisitionDate: "14/03/2025",
      propertyAddress: "12 rue de la Paix, Paris",
    },
    rawDocumentTerms: [
      { term: "prix de vente", value: "72 500 €", mappedField: "acquisitionPrice" },
      { term: "acquéreur", value: "Jean Dupont", mappedField: "buyerNames" },
    ],
  },
  { intent: "acquisition", confidence: "high", signals: [] },
);

const canonicalFields = canonicalResult.normalizedCanonicalFields as Record<string, unknown>;

assert(canonicalResult.detectedIntent === "acquisition", "detected intent");
assert(canonicalFields.acquisitionPrice === 72500, "acquisitionPrice");
assert(canonicalFields.acquisitionDate === "2025-03-14", "acquisitionDate ISO");
assert(
  Array.isArray(canonicalFields.buyerNames) &&
    canonicalFields.buyerNames[0] === "Jean Dupont",
  "buyerNames from raw terms",
);
assert(
  canonicalResult.hydrationMappings.some(
    (m) => m.canonicalField === "acquisitionPrice" && m.formField === "propertyPurchasePrice",
  ),
  "hydration mapping acquisitionPrice → propertyPurchasePrice",
);

const legacyResult = normalizeLogementSemanticExtraction(
  {
    propertyPurchasePrice: 150000,
    surfaceM2: 45,
    propertyAddress: "5 avenue Victor Hugo",
  },
  { intent: "acquisition", confidence: "medium", signals: [] },
);

const legacyFields = legacyResult.normalizedCanonicalFields as Record<string, unknown>;

assert(legacyFields.acquisitionPrice === 150000, "legacy price alias");
assert(legacyFields.livingArea === 45, "legacy surface alias");
assert(legacyFields.propertyAddress === "5 avenue Victor Hugo", "legacy address");

console.log("logement-semantic-vocabulary.test.ts: all assertions passed");
