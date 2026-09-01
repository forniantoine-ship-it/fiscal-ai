import {
  engageChapterVerticalScrollLock,
  releaseChapterVerticalScrollLock,
} from "@/components/lmnp/dashboard/dashboard-chapter-scroll";

/** Sélecteur partagé — zone carrousel workflow (ol + descendants). */
export const WORKFLOW_CAROUSEL_SELECTOR = "[data-workflow-carousel]";

/** Sélecteur partagé — carte carrousel (début de geste carousel). */
export const WORKFLOW_CAROUSEL_CARD_SELECTOR = "li[data-step-id]";

export const CHAPTER_AXIS_LOCK_THRESHOLD_PX = 8;

/** Fenêtre de décision wheel : temps (ms). */
export const WHEEL_DECISION_TIME_MS = 65;

/** Fenêtre de décision wheel : distance cumulée (px). */
export const WHEEL_DECISION_DISTANCE_PX = 22;

/** Ratio horizontal : sumX > sumY * ratio → axe x. */
export const WHEEL_HORIZONTAL_RATIO = 1.5;

/** Ratio vertical : sumY > sumX * ratio → axe y. */
export const WHEEL_VERTICAL_RATIO = 1.5;

/** Distance minimale avant verrouillage anticipé par ratio. */
export const WHEEL_MIN_RATIO_SUM_PX = 8;

/** Dérive scrollTop max tolérée pendant la classification ambiguë. */
export const WHEEL_AMBIGUOUS_DRIFT_CAP_PX = 12;

/** Écart scrollTop déclenchant l'invalidation du geste wheel (changement de chapitre). */
export const WHEEL_CHAPTER_EXIT_PX = 180;

/** Silence entre deux wheel avant fin de geste (ms). */
export const WHEEL_GESTURE_END_MS = 175;

export type ChapterGestureAxis = "none" | "x" | "y";

export type ChapterWheelGestureDiagnostic = {
  startScrollTop: number;
  decidedAxis: ChapterGestureAxis;
  decisionDelayMs: number | null;
  maxDrift: number;
  finalScrollTop: number;
  snapTriggered: boolean;
  abortedByChapterExit?: boolean;
};

export function isWorkflowCarouselZone(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) return false;
  return Boolean(target.closest(WORKFLOW_CAROUSEL_SELECTOR));
}

export function isWorkflowCarouselCard(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) return false;
  return Boolean(target.closest(WORKFLOW_CAROUSEL_CARD_SELECTOR));
}

export function resolveChapterGestureAxis(
  dx: number,
  dy: number,
  threshold = CHAPTER_AXIS_LOCK_THRESHOLD_PX,
): ChapterGestureAxis {
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  if (absX <= threshold && absY <= threshold) return "none";
  return absX > absY ? "x" : "y";
}

export function isWheelDecisionReady(
  sumX: number,
  sumY: number,
  elapsedMs: number,
  timeThresholdMs = WHEEL_DECISION_TIME_MS,
  distanceThresholdPx = WHEEL_DECISION_DISTANCE_PX,
): boolean {
  return elapsedMs >= timeThresholdMs || sumX + sumY >= distanceThresholdPx;
}

export function resolveWheelGestureAxis(
  sumX: number,
  sumY: number,
  horizontalRatio = WHEEL_HORIZONTAL_RATIO,
): "x" | "y" {
  return sumX > sumY * horizontalRatio ? "x" : "y";
}

export function hasWheelGestureLeftOriginChapter(
  startScrollTop: number,
  currentScrollTop: number,
  threshold = WHEEL_CHAPTER_EXIT_PX,
): boolean {
  return Math.abs(currentScrollTop - startScrollTop) > threshold;
}

export type WheelGestureAccumulators = {
  sumX: number;
  sumY: number;
  axisLock: ChapterGestureAxis;
  startTime: number;
  startScrollTop: number;
  decisionDelayMs: number | null;
};

/**
 * Avance le verrou d'axe wheel (verrouillage anticipé + fenêtre de décision).
 * Retourne le axisLock mis à jour.
 */
export function advanceWheelAxisLock(
  gesture: WheelGestureAccumulators,
  now: number,
): ChapterGestureAxis {
  if (gesture.axisLock !== "none") return gesture.axisLock;

  const total = gesture.sumX + gesture.sumY;

  if (total >= WHEEL_MIN_RATIO_SUM_PX) {
    if (gesture.sumX > gesture.sumY * WHEEL_HORIZONTAL_RATIO) {
      gesture.axisLock = "x";
      gesture.decisionDelayMs ??= now - gesture.startTime;
      return "x";
    }
    if (gesture.sumY > gesture.sumX * WHEEL_VERTICAL_RATIO) {
      gesture.axisLock = "y";
      gesture.decisionDelayMs ??= now - gesture.startTime;
      return "y";
    }
  }

  const elapsedMs = now - gesture.startTime;
  if (isWheelDecisionReady(gesture.sumX, gesture.sumY, elapsedMs)) {
    gesture.axisLock = resolveWheelGestureAxis(gesture.sumX, gesture.sumY);
    gesture.decisionDelayMs ??= elapsedMs;
  }

  return gesture.axisLock;
}

/**
 * Faut-il preventDefault sur ce tick wheel ?
 * - lock X → toujours
 * - lock Y → jamais
 * - classification → garde-fous anti-fuite verticale sans bloquer un vrai scroll Y
 */
export function shouldPreventWheelTick(
  gesture: Pick<WheelGestureAccumulators, "sumX" | "sumY" | "axisLock" | "startScrollTop">,
  scrollTop: number,
  deltaX: number,
  deltaY: number,
): boolean {
  if (gesture.axisLock === "x") return true;
  if (gesture.axisLock === "y") return false;

  const drift = Math.abs(scrollTop - gesture.startScrollTop);
  if (drift >= WHEEL_AMBIGUOUS_DRIFT_CAP_PX) return true;

  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);

  if (gesture.sumY > gesture.sumX) return false;

  if (gesture.sumX > gesture.sumY && absY >= absX) return true;

  if (gesture.sumY <= gesture.sumX && absY > absX) return true;

  return false;
}

type PointerTrack = {
  startX: number;
  startY: number;
  axisLock: ChapterGestureAxis;
};

type WheelGestureState = WheelGestureAccumulators & {
  minScrollTop: number;
  maxScrollTop: number;
  maxDriftWhileLockedX: number;
};

let lastWheelDiagnostic: ChapterWheelGestureDiagnostic | null = null;
const wheelDiagnosticHistory: ChapterWheelGestureDiagnostic[] = [];
const WHEEL_DIAGNOSTIC_HISTORY_MAX = 20;

export function getLastChapterWheelDiagnostic(): ChapterWheelGestureDiagnostic | null {
  return lastWheelDiagnostic;
}

export function getChapterWheelDiagnosticHistory(): readonly ChapterWheelGestureDiagnostic[] {
  return wheelDiagnosticHistory;
}

function recordWheelDiagnostic(diagnostic: ChapterWheelGestureDiagnostic): void {
  if (process.env.NODE_ENV !== "production") {
    console.log("[axis-lock] geste terminé", diagnostic);
  }
  lastWheelDiagnostic = diagnostic;
  wheelDiagnosticHistory.push(diagnostic);
  if (wheelDiagnosticHistory.length > WHEEL_DIAGNOSTIC_HISTORY_MAX) {
    wheelDiagnosticHistory.shift();
  }

  if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
    const w = window as Window & {
      __chapterWheelDiag?: {
        last: ChapterWheelGestureDiagnostic | null;
        history: readonly ChapterWheelGestureDiagnostic[];
      };
    };
    w.__chapterWheelDiag = {
      last: lastWheelDiagnostic,
      history: wheelDiagnosticHistory,
    };
  }
}

function detectSnapTriggered(
  startScrollTop: number,
  finalScrollTop: number,
  decidedAxis: ChapterGestureAxis,
): boolean {
  if (decidedAxis !== "x") return false;
  const drift = Math.abs(finalScrollTop - startScrollTop);
  if (drift < 20) return false;
  if (startScrollTop > 300 && finalScrollTop < 100) return true;
  return drift > 80;
}

function createWheelGesture(startScrollTop: number, now: number): WheelGestureState {
  return {
    sumX: 0,
    sumY: 0,
    startTime: now,
    axisLock: "none",
    startScrollTop,
    minScrollTop: startScrollTop,
    maxScrollTop: startScrollTop,
    decisionDelayMs: null,
    maxDriftWhileLockedX: 0,
  };
}

/**
 * Verrou d'axe chapitre (couches 2 + 3) — listeners limités au conteneur scroll.
 */
export function attachChapterAxisLock(scrollContainer: HTMLElement): () => void {
  const carouselPointerIds = new Set<number>();
  const tracks = new Map<number, PointerTrack>();

  let wheelGesture: WheelGestureState | null = null;
  let wheelEndTimer: number | null = null;
  let wheelVerticalLockActive = false;
  let wheelVerticalLockOwned = false;
  let wheelVerticalLockScrollTop = 0;

  const engageWheelVerticalLock = (scrollTop: number) => {
    if (wheelVerticalLockActive) return;
    wheelVerticalLockActive = true;
    wheelVerticalLockScrollTop = scrollTop;
    wheelVerticalLockOwned = engageChapterVerticalScrollLock("chapter-wheel");
    if (process.env.NODE_ENV !== "production") {
      console.log("[axis-lock] wheel vertical lock ON", {
        scrollTop,
        owned: wheelVerticalLockOwned,
      });
    }
  };

  const releaseWheelVerticalLock = (restore: boolean) => {
    if (!wheelVerticalLockActive) return;
    const top = wheelVerticalLockScrollTop;
    wheelVerticalLockActive = false;
    if (wheelVerticalLockOwned) {
      releaseChapterVerticalScrollLock("chapter-wheel");
    }
    wheelVerticalLockOwned = false;
    if (restore && scrollContainer.scrollTop !== top) {
      scrollContainer.scrollTo({ top });
    }
    if (process.env.NODE_ENV !== "production") {
      console.log("[axis-lock] wheel vertical lock OFF", { restore, top });
    }
  };

  const clearTrack = (pointerId: number) => {
    tracks.delete(pointerId);
  };

  const invalidateWheelGesture = (abortedByChapterExit = false) => {
    if (wheelEndTimer !== null) {
      window.clearTimeout(wheelEndTimer);
      wheelEndTimer = null;
    }

    releaseWheelVerticalLock(true);

    if (wheelGesture && abortedByChapterExit) {
      recordWheelDiagnostic({
        startScrollTop: wheelGesture.startScrollTop,
        decidedAxis: wheelGesture.axisLock,
        decisionDelayMs: wheelGesture.decisionDelayMs,
        maxDrift: wheelGesture.maxDriftWhileLockedX,
        finalScrollTop: scrollContainer.scrollTop,
        snapTriggered: detectSnapTriggered(
          wheelGesture.startScrollTop,
          scrollContainer.scrollTop,
          wheelGesture.axisLock,
        ),
        abortedByChapterExit: true,
      });
    }

    wheelGesture = null;
  };

  const finalizeWheelGesture = () => {
    wheelEndTimer = null;
    if (!wheelGesture) return;

    const {
      startScrollTop,
      axisLock,
      decisionDelayMs,
      maxDriftWhileLockedX,
    } = wheelGesture;
    const finalScrollTop = scrollContainer.scrollTop;

    releaseWheelVerticalLock(axisLock !== "y");

    recordWheelDiagnostic({
      startScrollTop,
      decidedAxis: axisLock,
      decisionDelayMs,
      maxDrift: maxDriftWhileLockedX,
      finalScrollTop,
      snapTriggered: detectSnapTriggered(startScrollTop, finalScrollTop, axisLock),
    });

    wheelGesture = null;
  };

  const scheduleWheelGestureEnd = () => {
    if (wheelEndTimer !== null) {
      window.clearTimeout(wheelEndTimer);
    }
    wheelEndTimer = window.setTimeout(finalizeWheelGesture, WHEEL_GESTURE_END_MS);
  };

  const trackScrollDrift = (gesture: WheelGestureState) => {
    const current = scrollContainer.scrollTop;
    gesture.minScrollTop = Math.min(gesture.minScrollTop, current);
    gesture.maxScrollTop = Math.max(gesture.maxScrollTop, current);

    if (gesture.axisLock === "x") {
      const drift = Math.abs(current - gesture.startScrollTop);
      gesture.maxDriftWhileLockedX = Math.max(gesture.maxDriftWhileLockedX, drift);
    }
  };

  const checkChapterExitInvalidation = (): boolean => {
    if (!wheelGesture) return false;
    if (
      hasWheelGestureLeftOriginChapter(
        wheelGesture.startScrollTop,
        scrollContainer.scrollTop,
      )
    ) {
      invalidateWheelGesture(true);
      return true;
    }
    return false;
  };

  const onScroll = () => {
    if (process.env.NODE_ENV !== "production") {
      console.log("[axis-lock] scroll event", {
        scrollTop: scrollContainer.scrollTop,
        gestureActive: wheelGesture !== null,
        axisLock: wheelGesture?.axisLock ?? null,
      });
    }
    checkChapterExitInvalidation();
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;

    if (isWorkflowCarouselZone(event.target)) {
      carouselPointerIds.add(event.pointerId);
      return;
    }

    tracks.set(event.pointerId, {
      startX: event.clientX,
      startY: event.clientY,
      axisLock: "none",
    });
  };

  const onPointerMove = (event: PointerEvent) => {
    if (carouselPointerIds.has(event.pointerId)) return;

    const track = tracks.get(event.pointerId);
    if (!track) return;

    const axisLock = resolveChapterGestureAxis(
      event.clientX - track.startX,
      event.clientY - track.startY,
      CHAPTER_AXIS_LOCK_THRESHOLD_PX,
    );

    if (track.axisLock === "none" && axisLock !== "none") {
      track.axisLock = axisLock;
    }

    if (track.axisLock === "x") {
      event.preventDefault();
    }
  };

  const onPointerEnd = (event: PointerEvent) => {
    carouselPointerIds.delete(event.pointerId);
    clearTrack(event.pointerId);
  };

  const onWheel = (event: WheelEvent) => {
    if (process.env.NODE_ENV !== "production") {
      console.log("[axis-lock] wheel reçu", {
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        deltaMode: event.deltaMode,
        target: (event.target as Element | null)?.tagName,
        inCarousel: isWorkflowCarouselZone(event.target),
        scrollTop: scrollContainer.scrollTop,
      });
    }

    if (isWorkflowCarouselZone(event.target)) return;

    const now = performance.now();

    if (checkChapterExitInvalidation()) {
      // Geste précédent invalidé — le tick courant démarre un nouveau geste.
    }

    if (!wheelGesture) {
      wheelGesture = createWheelGesture(scrollContainer.scrollTop, now);
      if (process.env.NODE_ENV !== "production") {
        console.log("[axis-lock] wheelGesture créé", {
          startScrollTop: wheelGesture.startScrollTop,
        });
      }
    }

    const gesture = wheelGesture;
    gesture.sumX += Math.abs(event.deltaX);
    gesture.sumY += Math.abs(event.deltaY);

    advanceWheelAxisLock(gesture, now);

    if (
      gesture.axisLock === "none" &&
      Math.abs(scrollContainer.scrollTop - gesture.startScrollTop) >= WHEEL_AMBIGUOUS_DRIFT_CAP_PX
    ) {
      gesture.axisLock = "x";
      gesture.decisionDelayMs ??= now - gesture.startTime;
      if (process.env.NODE_ENV !== "production") {
        console.log("[axis-lock] axisLock forcé x (dérive ambiguë)", {
          scrollTop: scrollContainer.scrollTop,
          startScrollTop: gesture.startScrollTop,
        });
      }
    }

    const willPrevent = shouldPreventWheelTick(gesture, scrollContainer.scrollTop, event.deltaX, event.deltaY);

    if (gesture.axisLock === "y") {
      releaseWheelVerticalLock(false);
    } else if (gesture.axisLock === "x" || (gesture.axisLock === "none" && willPrevent)) {
      engageWheelVerticalLock(gesture.startScrollTop);
    }

    if (willPrevent) {
      event.preventDefault();
    }

    if (process.env.NODE_ENV !== "production") {
      console.log("[axis-lock] wheel traité", {
        sumX: gesture.sumX,
        sumY: gesture.sumY,
        axisLock: gesture.axisLock,
        preventDefault: willPrevent,
        scrollTop: scrollContainer.scrollTop,
      });
    }

    trackScrollDrift(gesture);
    checkChapterExitInvalidation();
    scheduleWheelGestureEnd();
  };

  scrollContainer.addEventListener("pointerdown", onPointerDown);
  scrollContainer.addEventListener("pointermove", onPointerMove, { passive: false });
  scrollContainer.addEventListener("pointerup", onPointerEnd);
  scrollContainer.addEventListener("pointercancel", onPointerEnd);
  scrollContainer.addEventListener("scroll", onScroll, { passive: true });
  scrollContainer.addEventListener("wheel", onWheel, { passive: false });

  return () => {
    scrollContainer.removeEventListener("pointerdown", onPointerDown);
    scrollContainer.removeEventListener("pointermove", onPointerMove);
    scrollContainer.removeEventListener("pointerup", onPointerEnd);
    scrollContainer.removeEventListener("pointercancel", onPointerEnd);
    scrollContainer.removeEventListener("scroll", onScroll);
    scrollContainer.removeEventListener("wheel", onWheel);
    if (wheelEndTimer !== null) {
      window.clearTimeout(wheelEndTimer);
      wheelEndTimer = null;
    }
    releaseWheelVerticalLock(true);
    wheelGesture = null;
    carouselPointerIds.clear();
    tracks.clear();
  };
}
