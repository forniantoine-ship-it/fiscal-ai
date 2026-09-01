/**
 * Deterministic charge document classifier tests.
 * Run: npm run test:charge-classifier
 */
import {
  CHARGE_CLASSIFIER_MIN_CONFIDENCE,
  CHARGE_CLASSIFIER_MIN_MARGIN,
  INSURANCE_PRIORITY_THRESHOLD,
  classifyChargeDocument,
  normalizeChargeDocumentText,
  scoreChargeDocumentType,
  scoreChargeRoutingSignals,
  type ChargeDocumentType,
} from "./classify-charge-document";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const SAMPLES: Record<Exclude<ChargeDocumentType, "inconnu">, string> = {
  insurance_habitation: `
    AXA ASSURANCE HABITATION
    Contrat multirisque habitation — Prime annuelle
    Responsabilité civile locative
    Garantie PNO
  `,
  charges_copropriete: `
    SYNDIC COPROPRIETE LES OLIVIERS
    Appel de fonds — Charges courantes
    Budget prévisionnel — Assemblée générale
    Répartition charges de copropriété lot 12
  `,
  fonds_travaux: `
    Appel de fonds — Fonds de travaux (ALUR)
    Contribution au fonds travaux
    Provision travaux votée en AG
  `,
  avance_tresorerie: `
    Syndic — Avance de trésorerie
    Remboursement avance trésorerie copropriété
    AT syndic — solde au 31/12
  `,
  taxe_fonciere: `
    Direction Générale des Finances Publiques
    Taxe foncière — Avis d'imposition
    Impôts locaux — Commune de Lyon
    DGFiP
  `,
  facture_artisan: `
    FACTURE N° FA-2025-042
    Entreprise Dupuis Plombier — SIRET 123 456 789 00012
    Travaux rénovation salle de bain
    TVA intracommunautaire
  `,
  facture_energie: `
    EDF — Relevé de consommation
    Consommation d'électricité : 1 240 kWh
    Point de livraison PDL : 12345678901234
    Abonnement énergie
  `,
};

function runTests(): { passed: number; total: number } {
  let passed = 0;
  let total = 0;

  function test(name: string, fn: () => void): void {
    total++;
    try {
      fn();
      passed++;
      console.log(`  ✓ ${name}`);
    } catch (err) {
      console.error(`  ✗ ${name}`);
      console.error(`    ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log("\n[classify-charge-document] unit tests\n");

  test("normalizeChargeDocumentText strips accents and collapses whitespace", () => {
    const normalized = normalizeChargeDocumentText("  Taxe   Foncière  \n  Électricité  ");
    assert(normalized.includes("taxe fonciere"), "accent stripped on taxe fonciere");
    assert(normalized.includes("electricite"), "accent stripped on electricite");
    assert(!normalized.includes("  "), "no double spaces");
  });

  test("scoreChargeDocumentType returns positive score for matching insurance corpus", () => {
    const text = normalizeChargeDocumentText(SAMPLES.insurance_habitation);
    const breakdown = scoreChargeDocumentType("insurance_habitation", text);
    assert(breakdown.score >= CHARGE_CLASSIFIER_MIN_CONFIDENCE, "insurance score high enough");
    assert(
      breakdown.traces.some((trace) => trace.action === "keyword" || trace.action === "pattern"),
      "insurance has match traces",
    );
  });

  for (const expectedType of Object.keys(SAMPLES) as Exclude<ChargeDocumentType, "inconnu">[]) {
    test(`classifyChargeDocument detects ${expectedType}`, () => {
      const result = classifyChargeDocument({
        rawText: SAMPLES[expectedType],
        fileName: `${expectedType}.pdf`,
        logTraces: false,
      });
      assertEqual(result.type, expectedType, `type for ${expectedType}`);
      assert(result.confidence >= CHARGE_CLASSIFIER_MIN_CONFIDENCE, "confidence above threshold");
      assert(
        result.scores[expectedType] >= result.scores.facture_artisan,
        `${expectedType} beats generic artisan noise`,
      );
    });
  }

  test("classifyChargeDocument returns inconnu for empty text", () => {
    const result = classifyChargeDocument({ rawText: "   ", logTraces: false });
    assertEqual(result.type, "inconnu", "empty text");
    assertEqual(result.rejectedReason, "empty_text", "empty reason");
  });

  test("classifyChargeDocument returns inconnu when confidence is below threshold", () => {
    const result = classifyChargeDocument({
      rawText: "document sans indicateur fiscal",
      minConfidence: 99,
      logTraces: false,
    });
    assertEqual(result.type, "inconnu", "low signal");
    assert(Boolean(result.rejectedReason?.startsWith("below_min_confidence")), "rejection reason");
  });

  test("classifyChargeDocument returns inconnu when winner margin is too small", () => {
    const probe = classifyChargeDocument({
      rawText: "syndic copropriete appel de fonds budget previsionnel assemblee generale",
      logTraces: false,
    });
    const ranked = (Object.keys(SAMPLES) as Exclude<ChargeDocumentType, "inconnu">[])
      .map((type) => ({ type, score: probe.scores[type] }))
      .sort((a, b) => b.score - a.score);
    const margin = ranked[0].score - ranked[1].score;
    assert(margin > 0, "probe has a ranked winner");

    const gated = classifyChargeDocument({
      rawText: "syndic copropriete appel de fonds budget previsionnel assemblee generale",
      minMargin: margin + 1,
      logTraces: false,
    });
    assertEqual(gated.type, "inconnu", "ambiguous");
    assert(Boolean(gated.rejectedReason?.startsWith("ambiguous_margin")), "margin rejection");
  });

  test("taxe fonciere wins over facture_artisan on fiscal avis", () => {
    const result = classifyChargeDocument({
      rawText: SAMPLES.taxe_fonciere,
      fileName: "avis_taxe.pdf",
      logTraces: false,
    });
    assertEqual(result.type, "taxe_fonciere", "fiscal doc");
    assert(
      result.scores.taxe_fonciere > result.scores.facture_artisan,
      "taxe score above artisan",
    );
  });

  test("fonds_travaux distinct from charges_copropriete", () => {
    const result = classifyChargeDocument({
      rawText: SAMPLES.fonds_travaux,
      logTraces: false,
    });
    assertEqual(result.type, "fonds_travaux", "fonds travaux");
    assert(
      result.scores.fonds_travaux > result.scores.charges_copropriete,
      "fonds travaux score higher than generic copro",
    );
  });

  test("classification is deterministic across repeated runs", () => {
    const input = { rawText: SAMPLES.facture_energie, fileName: "edf.pdf", logTraces: false };
    const first = classifyChargeDocument(input);
    const second = classifyChargeDocument(input);
    assertEqual(first.type, second.type, "same type");
    assertEqual(first.confidence, second.confidence, "same confidence");
    assertEqual(
      JSON.stringify(first.scores),
      JSON.stringify(second.scores),
      "same scores",
    );
  });

  test("filename hints reinforce weak OCR (taxe fonciere)", () => {
    const result = classifyChargeDocument({
      rawText: "montant a payer reference",
      fileName: "taxe_fonciere_2025.pdf",
      logTraces: false,
    });
    assertEqual(result.type, "taxe_fonciere", "filename hint");
  });

  test("Case 1 — home insurance corpus routes to insurance_habitation", () => {
    const result = classifyChargeDocument({
      rawText: "ASSURANCE HABITATION\ncotisation annuelle\nprime TTC",
      fileName: "Assurance habitation.pdf",
      logTraces: false,
    });
    assertEqual(result.type, "insurance_habitation", "home insurance type");
    const routing = scoreChargeRoutingSignals(
      normalizeChargeDocumentText("ASSURANCE HABITATION\ncotisation annuelle\nprime TTC\nAssurance habitation.pdf"),
      "Assurance habitation.pdf",
    );
    assert(routing.insuranceScore >= INSURANCE_PRIORITY_THRESHOLD, "insurance routing score");
  });

  test("Case 2 — real property tax corpus routes to taxe_fonciere", () => {
    const result = classifyChargeDocument({
      rawText: "AVIS DE TAXE FONCIÈRE\npropriétés bâties\nvaleur locative",
      fileName: "avis_taxe_fonciere.pdf",
      logTraces: false,
    });
    assertEqual(result.type, "taxe_fonciere", "property tax type");
  });

  test("Case 3 — weak OCR insurance signals still route to insurance_habitation", () => {
    const result = classifyChargeDocument({
      rawText: "assurance\ncotisation",
      logTraces: false,
    });
    assertEqual(result.type, "insurance_habitation", "weak OCR insurance");
  });

  test("insurance filename beats injected property-tax hint in corpus", () => {
    const result = classifyChargeDocument({
      rawText: "taxe fonciere avis imposition\nprime TTC contribution",
      fileName: "Assurance habitation.pdf",
      logTraces: false,
    });
    assertEqual(result.type, "insurance_habitation", "insurance priority over tax hint");
  });

  return { passed, total };
}

const { passed, total } = runTests();
console.log(`\n${passed}/${total} tests passed\n`);
if (passed !== total) process.exit(1);
