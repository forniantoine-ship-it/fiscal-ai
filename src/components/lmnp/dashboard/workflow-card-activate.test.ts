/**
 * Run: npx tsx src/components/lmnp/dashboard/workflow-card-activate.test.ts
 */
import type { WorkflowStepView } from "./dashboard-workflow-model";
import {
  buildExtendedSteps,
  centerPhysicalIndex,
  isCardCentered,
  resolveCardActivateDecision,
  resolveCenteredStepAtClick,
  resolveNearestPhysicalIndex,
  type CarouselBufferMode,
} from "./workflow-carousel-engine";

const CARD_WIDTH = 240;
const GAP = 16;
const STRIDE = CARD_WIDTH + GAP;
const TOLERANCE = 32;

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function mockStep(id: string, index: number): WorkflowStepView {
  return {
    id: id as WorkflowStepView["id"],
    label: `Step ${index + 1}`,
    href: `/${id}`,
    uploadHref: `/${id}/upload`,
    status: index === 0 ? "current" : "upcoming",
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

type MockLayout = {
  containerWidth: number;
  scrollLeft: number;
  cardCount: number;
  paddingInline: number;
};

function createMockCarouselContainer(layout: MockLayout): HTMLElement {
  const { containerWidth, scrollLeft, cardCount, paddingInline } = layout;
  const containerCenterInContent =
    scrollLeft + containerWidth / 2 - paddingInline;

  const children: HTMLElement[] = [];
  for (let i = 0; i < cardCount; i++) {
    const li = {
      getBoundingClientRect: () => {
        const cardCenterInContent = i * STRIDE + CARD_WIDTH / 2;
        const cardCenterOnScreen =
          paddingInline + cardCenterInContent - scrollLeft;
        return {
          left: cardCenterOnScreen - CARD_WIDTH / 2,
          width: CARD_WIDTH,
          height: 400,
          top: 0,
          right: cardCenterOnScreen + CARD_WIDTH / 2,
          bottom: 400,
        } as DOMRect;
      },
    } as HTMLElement;
    children.push(li);
  }

  const collection = {
    length: cardCount,
    item: (index: number) => children[index] ?? null,
    [Symbol.iterator]: function* () {
      for (const child of children) yield child;
    },
  };

  return {
    scrollLeft,
    get children() {
      return collection as unknown as HTMLCollection;
    },
    getBoundingClientRect: () =>
      ({
        left: 0,
        width: containerWidth,
        height: 400,
        top: 0,
        right: containerWidth,
        bottom: 400,
      }) as DOMRect,
  } as unknown as HTMLElement;
}

function scrollLeftForCenteredCard(
  physicalIndex: number,
  containerWidth: number,
  paddingInline: number,
): number {
  const cardCenterInContent = physicalIndex * STRIDE + CARD_WIDTH / 2;
  return paddingInline + cardCenterInContent - containerWidth / 2;
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
  const stepCount = steps.length;
  const containerWidth = 800;
  const paddingInline = containerWidth / 2 - CARD_WIDTH / 2;

  console.log("workflow-card-activate");

  test("A — carte centrale + clic simple → navigation autorisée", () => {
    const mode: CarouselBufferMode = "progressive";
    const physicalIndex = centerPhysicalIndex(0, stepCount, mode);
    const container = createMockCarouselContainer({
      containerWidth,
      scrollLeft: scrollLeftForCenteredCard(physicalIndex, containerWidth, paddingInline),
      cardCount: buildExtendedSteps(steps, mode).length,
      paddingInline,
    });

    const centered = resolveCenteredStepAtClick(container, steps, stepCount, mode, TOLERANCE);
    assert(centered.isCentered, "activité géométriquement centrée");
    assertEqual(centered.stepId, "activite", "stepId centré");

    const decision = resolveCardActivateDecision({
      suppressNextClick: false,
      clickedStepId: "activite",
      centeredStepId: centered.stepId,
      isGeometricallyCentered: centered.isCentered,
    });
    assertEqual(decision.kind, "navigate", "decision navigate");
  });

  test("B — carte voisine + clic → recentrage sans navigation", () => {
    const mode: CarouselBufferMode = "progressive";
    const centeredPhysical = centerPhysicalIndex(0, stepCount, mode);
    const neighborPhysical = centeredPhysical + 1;
    const container = createMockCarouselContainer({
      containerWidth,
      scrollLeft: scrollLeftForCenteredCard(centeredPhysical, containerWidth, paddingInline),
      cardCount: buildExtendedSteps(steps, mode).length,
      paddingInline,
    });

    const centered = resolveCenteredStepAtClick(container, steps, stepCount, mode, TOLERANCE);
    const decision = resolveCardActivateDecision({
      suppressNextClick: false,
      clickedStepId: steps[toLogicalIndexFromPhysical(neighborPhysical, stepCount)]!.id,
      centeredStepId: centered.stepId,
      isGeometricallyCentered: centered.isCentered,
    });
    assertEqual(decision.kind, "recenter", "decision recenter");
  });

  test("C — progressive → infinite, Activité centrale → navigation", () => {
    const progressivePhysical = centerPhysicalIndex(0, stepCount, "progressive");
    const infinitePhysical = centerPhysicalIndex(0, stepCount, "infinite");

    for (const [label, mode, physicalIndex] of [
      ["progressive", "progressive", progressivePhysical],
      ["infinite", "infinite", infinitePhysical],
    ] as const) {
      const container = createMockCarouselContainer({
        containerWidth,
        scrollLeft: scrollLeftForCenteredCard(physicalIndex, containerWidth, paddingInline),
        cardCount: buildExtendedSteps(steps, mode).length,
        paddingInline,
      });

      const centered = resolveCenteredStepAtClick(container, steps, stepCount, mode, TOLERANCE);
      assert(centered.isCentered, `${label}: activité centrée`);
      assertEqual(centered.stepId, "activite", `${label}: stepId activite`);

      const decision = resolveCardActivateDecision({
        suppressNextClick: false,
        clickedStepId: "activite",
        centeredStepId: centered.stepId,
        isGeometricallyCentered: centered.isCentered,
      });
      assertEqual(decision.kind, "navigate", `${label}: navigate`);
    }

    assertEqual(infinitePhysical, stepCount, "infinite reindexe Activité au bloc central");
  });

  test("D — suppressNextClick après drag → clic parasite bloqué", () => {
    const decision = resolveCardActivateDecision({
      suppressNextClick: true,
      clickedStepId: "activite",
      centeredStepId: "activite",
      isGeometricallyCentered: true,
    });
    assertEqual(decision.kind, "suppress", "decision suppress");
  });

  test("E — resolveCenteredStepAtClick ne dépend pas d'un physicalIndex de rendu obsolète", () => {
    const infinitePhysical = centerPhysicalIndex(0, stepCount, "infinite");
    const container = createMockCarouselContainer({
      containerWidth,
      scrollLeft: scrollLeftForCenteredCard(infinitePhysical, containerWidth, paddingInline),
      cardCount: buildExtendedSteps(steps, "infinite").length,
      paddingInline,
    });

    const nearest = resolveNearestPhysicalIndex(container, stepCount, "infinite");
    assertEqual(nearest, infinitePhysical, "nearest = index infinite courant");
    assert(
      isCardCentered(container, nearest, TOLERANCE),
      "isCardCentered cohérent avec resolveNearestPhysicalIndex",
    );
  });

  console.log(`\n${passed}/${total} tests passés`);
  if (passed !== total) process.exit(1);
}

function toLogicalIndexFromPhysical(physicalIndex: number, stepCount: number): number {
  return ((physicalIndex % stepCount) + stepCount) % stepCount;
}

runTests();
