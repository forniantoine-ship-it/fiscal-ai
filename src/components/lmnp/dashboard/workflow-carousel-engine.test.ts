/**
 * Run: npx tsx src/components/lmnp/dashboard/workflow-carousel-engine.test.ts
 */
import type { WorkflowStepView } from "./dashboard-workflow-model";
import {
  buildExtendedSteps,
  centerPhysicalIndex,
  nextLogicalIndex,
  resolveBlock,
  resolveRepositionDelta,
  toLogicalIndex,
} from "./workflow-carousel-engine";

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function mockStep(id: string, index: number): WorkflowStepView {
  return {
    id: id as WorkflowStepView["id"],
    label: `Step ${index + 1}`,
    href: `/${id}`,
    uploadHref: `/${id}/upload`,
    status: "upcoming",
    requestedDocument: "",
    documentPrompt: "",
    aiExtracts: [],
    documentDetected: null,
    extractionState: "",
    correctionState: "",
    validationState: "",
    correctionsRemaining: 0,
    validationBadge: "none",
    dossierSummary: null,
  };
}

function runTests(): void {
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

  const steps = [
    mockStep("activite", 0),
    mockStep("logement", 1),
    mockStep("credit", 2),
    mockStep("revenus", 3),
    mockStep("charges", 4),
    mockStep("amortissement", 5),
    mockStep("validation", 6),
  ];

  console.log("workflow-carousel-engine.ts");

  test("buildExtendedSteps mode progressif : 14 entrées (7 × 2 blocs)", () => {
    assertEqual(buildExtendedSteps(steps, "progressive").length, 14, "length");
  });

  test("buildExtendedSteps progressif : 01 centrale à l'index physique 0", () => {
    const extended = buildExtendedSteps(steps, "progressive");
    assertEqual(extended[0]?.block, "center", "block");
    assertEqual(extended[0]?.logicalIndex, 0, "logicalIndex");
    assertEqual(extended[0]?.step.id, "activite", "step id");
    assertEqual(extended[0]?.physicalIndex, 0, "physicalIndex");
  });

  test("buildExtendedSteps progressif : pas de clone leading (07 à gauche de 01)", () => {
    const extended = buildExtendedSteps(steps, "progressive");
    assertEqual(extended[0]?.step.id, "activite", "first card");
    assertEqual(extended[6]?.step.id, "validation", "last center card");
    assertEqual(extended[7]?.step.id, "activite", "first trailing card");
  });

  test("centerPhysicalIndex progressif : 01 = 0, 07 = 6", () => {
    assertEqual(centerPhysicalIndex(0, 7, "progressive"), 0, "01");
    assertEqual(centerPhysicalIndex(6, 7, "progressive"), 6, "07");
  });

  test("resolveBlock progressif : center puis trailing", () => {
    assertEqual(resolveBlock(0, 7, "progressive"), "center", "center first");
    assertEqual(resolveBlock(6, 7, "progressive"), "center", "center last");
    assertEqual(resolveBlock(7, 7, "progressive"), "trailing", "trailing first");
    assertEqual(resolveBlock(13, 7, "progressive"), "trailing", "trailing last");
  });

  test("resolveRepositionDelta progressif : trailing → -7 strides", () => {
    assertEqual(resolveRepositionDelta(7, 7, 260, "progressive"), -7 * 260, "trailing");
    assertEqual(resolveRepositionDelta(0, 7, 260, "progressive"), 0, "center");
  });

  test("buildExtendedSteps produit 21 entrées (7 × 3 blocs)", () => {
    assertEqual(buildExtendedSteps(steps).length, 21, "length");
  });

  test("buildExtendedSteps : bloc central commence à l'index physique 7", () => {
    const extended = buildExtendedSteps(steps);
    assertEqual(extended[7]?.block, "center", "block");
    assertEqual(extended[7]?.logicalIndex, 0, "logicalIndex");
    assertEqual(extended[7]?.step.id, "activite", "step id");
  });

  test("toLogicalIndex : wrap 07 → 01", () => {
    assertEqual(toLogicalIndex(6, 7), 6, "physical 6");
    assertEqual(toLogicalIndex(7, 7), 0, "physical 7 wraps to 0");
    assertEqual(toLogicalIndex(13, 7), 6, "physical 13 wraps to 6");
    assertEqual(toLogicalIndex(14, 7), 0, "physical 14 wraps to 0");
  });

  test("centerPhysicalIndex : 01 = 7, 07 = 13", () => {
    assertEqual(centerPhysicalIndex(0, 7), 7, "01");
    assertEqual(centerPhysicalIndex(6, 7), 13, "07");
  });

  test("nextLogicalIndex : cyclique avant/arrière", () => {
    assertEqual(nextLogicalIndex(0, 7, -1), 6, "01 → 07");
    assertEqual(nextLogicalIndex(6, 7, 1), 0, "07 → 01");
    assertEqual(nextLogicalIndex(2, 7, 1), 3, "03 → 04");
    assertEqual(nextLogicalIndex(2, 7, -1), 1, "03 → 02");
  });

  test("resolveRepositionDelta : leading → +7 strides", () => {
    assertEqual(resolveRepositionDelta(0, 7, 260), 7 * 260, "leading block");
    assertEqual(resolveRepositionDelta(6, 7, 260), 7 * 260, "leading last");
  });

  test("resolveRepositionDelta : center → 0", () => {
    assertEqual(resolveRepositionDelta(7, 7, 260), 0, "center first");
    assertEqual(resolveRepositionDelta(13, 7, 260), 0, "center last");
  });

  test("resolveRepositionDelta : trailing → -7 strides", () => {
    assertEqual(resolveRepositionDelta(14, 7, 260), -7 * 260, "trailing first");
    assertEqual(resolveRepositionDelta(20, 7, 260), -7 * 260, "trailing last");
  });

  test("resolveBlock : blocs leading / center / trailing", () => {
    assertEqual(resolveBlock(0, 7), "leading", "leading");
    assertEqual(resolveBlock(7, 7), "center", "center");
    assertEqual(resolveBlock(14, 7), "trailing", "trailing");
  });

  console.log(`\n${passed}/${total} tests passés`);
  if (passed !== total) process.exit(1);
}

runTests();
