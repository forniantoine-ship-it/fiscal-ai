/**
 * Run: npx tsx src/components/lmnp/dashboard/workflow-carousel-pointer-capture.test.ts
 */
import type { WorkflowStepView } from "./dashboard-workflow-model";
import {
  DRAG_THRESHOLD_PX,
  resolveCardActivateDecision,
  resolveCarouselPointerAxisLock,
  shouldEngageCarouselPointerCapture,
} from "./workflow-carousel-engine";

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

type SimulatedPointerCapture = {
  captured: boolean;
  anchorReceivedPointerUp: boolean;
  anchorReceivedClick: boolean;
};

function simulatePointerGesture(
  moves: Array<{ dx: number; dy: number }>,
): SimulatedPointerCapture & {
  axisLock: "none" | "x" | "y";
  suppressNextClickAfterUp: boolean;
} {
  let axisLock: "none" | "x" | "y" = "none";
  let captured = false;
  let anchorReceivedPointerUp = true;
  let anchorReceivedClick = true;

  for (const { dx, dy } of moves) {
    const axisLockBefore = axisLock;
    axisLock = resolveCarouselPointerAxisLock(axisLock, dx, dy);
    if (shouldEngageCarouselPointerCapture(axisLockBefore, axisLock)) {
      captured = true;
      anchorReceivedPointerUp = false;
      anchorReceivedClick = false;
    }
  }

  const suppressNextClickAfterUp = axisLock === "x";

  return {
    axisLock,
    captured,
    anchorReceivedPointerUp,
    anchorReceivedClick,
    suppressNextClickAfterUp,
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

  console.log("workflow-carousel-pointer-capture");

  test("1 — clic simple carte centrale : aucune capture, anchor reçoit up+click, navigation", () => {
    const gesture = simulatePointerGesture([]);
    assert(!gesture.captured, "aucune capture sur clic simple");
    assert(gesture.anchorReceivedPointerUp, "<a> reçoit pointerup");
    assert(gesture.anchorReceivedClick, "<a> reçoit click");
    assertEqual(gesture.axisLock, "none", "axisLock reste none");
    assert(!gesture.suppressNextClickAfterUp, "pas de suppressNextClick");

    const decision = resolveCardActivateDecision({
      suppressNextClick: gesture.suppressNextClickAfterUp,
      clickedStepId: "activite" as WorkflowStepView["id"],
      centeredStepId: "activite",
      isGeometricallyCentered: true,
    });
    assertEqual(decision.kind, "navigate", "navigation autorisée");
  });

  test("1b — micro-mouvement sous seuil : toujours aucune capture", () => {
    const gesture = simulatePointerGesture([
      { dx: DRAG_THRESHOLD_PX, dy: 0 },
      { dx: 0, dy: DRAG_THRESHOLD_PX },
    ]);
    assert(!gesture.captured, "mouvement ≤ seuil : pas de capture");
    assertEqual(gesture.axisLock, "none", "axisLock none");
  });

  test("2 — drag horizontal : capture au passage axisLock → x", () => {
    const gesture = simulatePointerGesture([{ dx: DRAG_THRESHOLD_PX + 4, dy: 0 }]);
    assert(gesture.captured, "capture engagée une fois axisLock === x");
    assertEqual(gesture.axisLock, "x", "axisLock horizontal");
    assert(gesture.suppressNextClickAfterUp, "suppressNextClick après drag horizontal");

    const secondMove = simulatePointerGesture([
      { dx: DRAG_THRESHOLD_PX + 4, dy: 0 },
      { dx: 40, dy: 2 },
    ]);
    assert(secondMove.captured, "capture au premier passage x");
    assertEqual(secondMove.axisLock, "x", "drag horizontal maintenu");
  });

  test("3 — drag vertical : aucune capture horizontale", () => {
    const gesture = simulatePointerGesture([{ dx: 0, dy: DRAG_THRESHOLD_PX + 6 }]);
    assert(!gesture.captured, "pas de capture sur drag vertical");
    assertEqual(gesture.axisLock, "y", "axisLock vertical");
    assert(!gesture.suppressNextClickAfterUp, "pas de suppressNextClick");
  });

  test("4 — carte voisine : recentrage inchangé (pas navigate)", () => {
    const decision = resolveCardActivateDecision({
      suppressNextClick: false,
      clickedStepId: "logement" as WorkflowStepView["id"],
      centeredStepId: "activite",
      isGeometricallyCentered: true,
    });
    assertEqual(decision.kind, "recenter", "carte voisine → recenter");
  });

  console.log(`\n${passed}/${total} tests passés`);
  if (passed !== total) process.exit(1);
}

runTests();
