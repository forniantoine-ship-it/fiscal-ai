import type { WorkflowStepView } from "@/components/lmnp/dashboard/dashboard-workflow-model";

export const DRAG_THRESHOLD_PX = 8;
export const SCROLL_END_DEBOUNCE_MS = 120;

export type CarouselPointerAxisLock = "none" | "x" | "y";

/** Résout l'axe du geste pointer après un mouvement (seuil = DRAG_THRESHOLD_PX). */
export function resolveCarouselPointerAxisLock(
  currentAxisLock: CarouselPointerAxisLock,
  dx: number,
  dy: number,
  thresholdPx: number = DRAG_THRESHOLD_PX,
): CarouselPointerAxisLock {
  if (currentAxisLock !== "none") return currentAxisLock;
  if (dx <= thresholdPx && dy <= thresholdPx) return "none";
  return dx > dy ? "x" : "y";
}

/** Capture pointer uniquement à la bascule none → x (drag horizontal confirmé). */
export function shouldEngageCarouselPointerCapture(
  axisLockBefore: CarouselPointerAxisLock,
  axisLockAfter: CarouselPointerAxisLock,
): boolean {
  return axisLockBefore === "none" && axisLockAfter === "x";
}

export type CarouselBufferMode = "progressive" | "infinite";

export type ExtendedStep = {
  step: WorkflowStepView;
  logicalIndex: number;
  physicalIndex: number;
  block: "leading" | "center" | "trailing";
};

/** Triple buffer cyclique, ou mode progressif (centre + trailing) au premier affichage. */
export function buildExtendedSteps(
  steps: WorkflowStepView[],
  mode: CarouselBufferMode = "infinite",
): ExtendedStep[] {
  const count = steps.length;
  if (count === 0) return [];

  const blocks: Array<ExtendedStep["block"]> =
    mode === "progressive" ? ["center", "trailing"] : ["leading", "center", "trailing"];

  return blocks.flatMap((block, blockIndex) =>
    steps.map((step, logicalIndex) => ({
      step,
      logicalIndex,
      physicalIndex:
        mode === "progressive"
          ? (block === "center" ? 0 : 1) * count + logicalIndex
          : blockIndex * count + logicalIndex,
      block,
    })),
  );
}

export function toLogicalIndex(physicalIndex: number, stepCount: number): number {
  if (stepCount <= 0) return 0;
  return ((physicalIndex % stepCount) + stepCount) % stepCount;
}

export function centerPhysicalIndex(
  logicalIndex: number,
  stepCount: number,
  mode: CarouselBufferMode = "infinite",
): number {
  if (stepCount <= 0) return 0;
  const normalized = ((logicalIndex % stepCount) + stepCount) % stepCount;
  if (mode === "progressive") return normalized;
  return stepCount + normalized;
}

export function nextLogicalIndex(logicalIndex: number, stepCount: number, delta: 1 | -1): number {
  if (stepCount <= 0) return 0;
  return (logicalIndex + delta + stepCount) % stepCount;
}

export function resolveNearestPhysicalIndex(
  container: HTMLElement,
  stepCount: number,
  mode: CarouselBufferMode = "infinite",
): number {
  const items = Array.from(container.children) as HTMLElement[];
  if (items.length === 0 || stepCount === 0) {
    return centerPhysicalIndex(0, stepCount, mode);
  }

  const containerRect = container.getBoundingClientRect();
  const containerCenter = containerRect.left + containerRect.width / 2;

  let nearestPhysicalIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;

  items.forEach((item, physicalIndex) => {
    const rect = item.getBoundingClientRect();
    const distance = Math.abs(rect.left + rect.width / 2 - containerCenter);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestPhysicalIndex = physicalIndex;
    }
  });

  return nearestPhysicalIndex;
}

export function resolveCardCenterOffset(
  container: HTMLElement,
  physicalIndex: number,
): number {
  const item = container.children.item(physicalIndex) as HTMLElement | null;
  if (!item) return 0;

  const containerRect = container.getBoundingClientRect();
  const itemRect = item.getBoundingClientRect();
  const containerCenter = containerRect.left + containerRect.width / 2;
  const itemCenter = itemRect.left + itemRect.width / 2;
  return itemCenter - containerCenter;
}

export function isCardCentered(
  container: HTMLElement,
  physicalIndex: number,
  tolerancePx: number,
): boolean {
  return Math.abs(resolveCardCenterOffset(container, physicalIndex)) <= tolerancePx;
}

export type CenteredStepAtClick = {
  stepId: WorkflowStepView["id"] | null;
  physicalIndex: number;
  isCentered: boolean;
};

/** Résout la carte géométriquement la plus proche du centre au moment du clic. */
export function resolveCenteredStepAtClick(
  container: HTMLElement,
  steps: WorkflowStepView[],
  stepCount: number,
  mode: CarouselBufferMode,
  tolerancePx: number,
): CenteredStepAtClick {
  const physicalIndex = resolveNearestPhysicalIndex(container, stepCount, mode);
  const logicalIndex = toLogicalIndex(physicalIndex, stepCount);
  const stepId = steps[logicalIndex]?.id ?? null;
  return {
    stepId,
    physicalIndex,
    isCentered: isCardCentered(container, physicalIndex, tolerancePx),
  };
}

export type CardActivateDecision =
  | { kind: "navigate" }
  | { kind: "suppress" }
  | { kind: "recenter" };

/** Décision pure de navigation vs recentrage — indépendante du physicalIndex de rendu. */
export function resolveCardActivateDecision(input: {
  suppressNextClick: boolean;
  clickedStepId: WorkflowStepView["id"];
  centeredStepId: WorkflowStepView["id"] | null;
  isGeometricallyCentered: boolean;
}): CardActivateDecision {
  if (input.suppressNextClick) {
    return { kind: "suppress" };
  }

  if (input.isGeometricallyCentered && input.centeredStepId === input.clickedStepId) {
    return { kind: "navigate" };
  }

  return { kind: "recenter" };
}

/**
 * Si le centre tombe dans le bloc leading ou trailing, retourne le décalage
 * de scroll à appliquer silencieusement pour revenir au bloc central équivalent.
 */
export function resolveRepositionDelta(
  physicalIndex: number,
  stepCount: number,
  cardStridePx: number,
  mode: CarouselBufferMode = "infinite",
): number {
  if (stepCount <= 0) return 0;

  if (mode === "progressive") {
    if (physicalIndex >= stepCount) return -stepCount * cardStridePx;
    return 0;
  }

  if (physicalIndex < stepCount) {
    return stepCount * cardStridePx;
  }
  if (physicalIndex >= stepCount * 2) {
    return -stepCount * cardStridePx;
  }
  return 0;
}

export function resolveBlock(
  physicalIndex: number,
  stepCount: number,
  mode: CarouselBufferMode = "infinite",
): ExtendedStep["block"] {
  if (stepCount <= 0) return "center";
  if (mode === "progressive") {
    return physicalIndex < stepCount ? "center" : "trailing";
  }
  if (physicalIndex < stepCount) return "leading";
  if (physicalIndex >= stepCount * 2) return "trailing";
  return "center";
}
