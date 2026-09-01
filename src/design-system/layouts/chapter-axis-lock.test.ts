import {
  CHAPTER_AXIS_LOCK_THRESHOLD_PX,
  WHEEL_AMBIGUOUS_DRIFT_CAP_PX,
  WHEEL_CHAPTER_EXIT_PX,
  WHEEL_DECISION_DISTANCE_PX,
  WHEEL_DECISION_TIME_MS,
  WHEEL_HORIZONTAL_RATIO,
  WHEEL_MIN_RATIO_SUM_PX,
  WHEEL_VERTICAL_RATIO,
  advanceWheelAxisLock,
  hasWheelGestureLeftOriginChapter,
  isWheelDecisionReady,
  resolveChapterGestureAxis,
  resolveWheelGestureAxis,
  shouldPreventWheelTick,
  type WheelGestureAccumulators,
} from "@/design-system/layouts/chapter-axis-lock";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function testResolveChapterGestureAxis(): void {
  assert(resolveChapterGestureAxis(0, 0) === "none", "mouvement nul → none");
  assert(
    resolveChapterGestureAxis(3, 4, CHAPTER_AXIS_LOCK_THRESHOLD_PX) === "none",
    "sous le seuil → none",
  );
  assert(resolveChapterGestureAxis(20, 5) === "x", "horizontal dominant → x");
  assert(resolveChapterGestureAxis(5, 20) === "y", "vertical dominant → y");
}

function testIsWheelDecisionReady(): void {
  assert(!isWheelDecisionReady(5, 5, 10), "sous temps et distance → pas prêt");
  assert(isWheelDecisionReady(5, 5, WHEEL_DECISION_TIME_MS), "temps atteint → prêt");
  assert(isWheelDecisionReady(12, 10, 10), "distance cumulée atteinte → prêt");
}

function testResolveWheelGestureAxis(): void {
  assert(resolveWheelGestureAxis(30, 10) === "x", "sumX > sumY * 1.5 → horizontal");
  assert(resolveWheelGestureAxis(20, 20) === "y", "sumX == sumY → vertical/ambigu");
  assert(resolveWheelGestureAxis(16, 10, WHEEL_HORIZONTAL_RATIO) === "x", "16 > 15 → horizontal");
}

function makeGesture(overrides: Partial<WheelGestureAccumulators> = {}): WheelGestureAccumulators {
  return {
    sumX: 0,
    sumY: 0,
    axisLock: "none",
    startTime: 0,
    startScrollTop: 719,
    decisionDelayMs: null,
    ...overrides,
  };
}

function testAdvanceWheelAxisLockEarlyHorizontal(): void {
  const g = makeGesture({ sumX: 20, sumY: 4 });
  const axis = advanceWheelAxisLock(g, 30);
  assert(axis === "x", "verrou X anticipé quand sumX > sumY * 1.5");
  assert(g.decisionDelayMs === 30, "délai de décision enregistré");
}

function testAdvanceWheelAxisLockEarlyVertical(): void {
  const g = makeGesture({ sumX: 4, sumY: 20 });
  const axis = advanceWheelAxisLock(g, 40);
  assert(axis === "y", "verrou Y anticipé quand sumY > sumX * 1.5");
}

function testShouldPreventDuringClassification(): void {
  const horizontalTrend = makeGesture({ sumX: 30, sumY: 8, axisLock: "none" });
  assert(
    shouldPreventWheelTick(horizontalTrend, 719, 2, 8),
    "tick y-dominant pendant tendance horizontale → prevent",
  );
  assert(
    !shouldPreventWheelTick(horizontalTrend, 719, 10, 2),
    "tick x-dominant pendant tendance horizontale → pas de prevent nécessaire",
  );

  const verticalTrend = makeGesture({ sumX: 8, sumY: 30, axisLock: "none" });
  assert(
    !shouldPreventWheelTick(verticalTrend, 719, 2, 10),
    "tick y-dominant pendant tendance verticale → autorisé",
  );

  const ambiguous = makeGesture({ sumX: 5, sumY: 5, axisLock: "none" });
  assert(
    shouldPreventWheelTick(ambiguous, 719, 1, 6),
    "tick y-dominant en phase ambiguë neutre → prevent",
  );
}

function testAmbiguousDriftCap(): void {
  const g = makeGesture({ sumX: 5, sumY: 5, axisLock: "none" });
  assert(
    shouldPreventWheelTick(g, 719 + WHEEL_AMBIGUOUS_DRIFT_CAP_PX, 0, 1),
    "dérive >= cap en classification → prevent",
  );
}

function testLockedAxes(): void {
  assert(
    shouldPreventWheelTick(makeGesture({ axisLock: "x" }), 719, 0, 20),
    "lock X → toujours prevent",
  );
  assert(
    !shouldPreventWheelTick(makeGesture({ axisLock: "y" }), 719, 0, 20),
    "lock Y → jamais prevent",
  );
}

function testChapterExitInvalidation(): void {
  assert(
    !hasWheelGestureLeftOriginChapter(719, 700, WHEEL_CHAPTER_EXIT_PX),
    "petit mouvement → pas d'invalidation",
  );
  assert(
    hasWheelGestureLeftOriginChapter(719, 0, WHEEL_CHAPTER_EXIT_PX),
    "719 → 0 → invalidation",
  );
  assert(
    hasWheelGestureLeftOriginChapter(0, 719, WHEEL_CHAPTER_EXIT_PX),
    "0 → 719 → invalidation",
  );
}

function testMacHorizontalTailScenario(): void {
  let g = makeGesture();
  const ticks: Array<[number, number]> = [
    [12, 2],
    [10, 3],
    [8, 4],
    [6, 5],
    [4, 6],
    [2, 8],
    [0, 10],
    [0, 16],
  ];

  for (const [dx, dy] of ticks) {
    g.sumX += Math.abs(dx);
    g.sumY += Math.abs(dy);
    advanceWheelAxisLock(g, 80);
    assert(
      shouldPreventWheelTick(g, 719, dx, dy),
      `tick (${dx},${dy}) après classification horizontale → prevent`,
    );
  }

  assert(g.axisLock === "x", "geste Mac horizontal avec queue Y → lock X");
}

function testVerticalGestureNotBlocked(): void {
  let g = makeGesture({ startScrollTop: 0 });
  const ticks: Array<[number, number]> = [
    [0, 4],
    [0, 8],
    [0, 12],
    [1, 16],
  ];

  for (const [dx, dy] of ticks) {
    g.sumX += Math.abs(dx);
    g.sumY += Math.abs(dy);
    advanceWheelAxisLock(g, 50);
    assert(
      !shouldPreventWheelTick(g, 0, dx, dy),
      `tick vertical (${dx},${dy}) → pas de prevent`,
    );
  }

  assert(g.axisLock === "y", "geste vertical → lock Y");
}

testResolveChapterGestureAxis();
testIsWheelDecisionReady();
testResolveWheelGestureAxis();
testAdvanceWheelAxisLockEarlyHorizontal();
testAdvanceWheelAxisLockEarlyVertical();
testShouldPreventDuringClassification();
testAmbiguousDriftCap();
testLockedAxes();
testChapterExitInvalidation();
testMacHorizontalTailScenario();
testVerticalGestureNotBlocked();
console.log("chapter-axis-lock.test.ts — tous les tests passés");
