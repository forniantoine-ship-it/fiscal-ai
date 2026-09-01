"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";

import { humanizeConseillerText } from "@/components/lmnp/dashboard/conseiller-suggestions";
import { StepIcon } from "@/components/lmnp/dashboard/dashboard-step-icons";
import type { WorkflowStepView } from "@/components/lmnp/dashboard/dashboard-workflow-model";
import {
  resolveActiveWorkflowStepFromRoute,
  resolveWorkflowStepNavigationHref,
} from "@/components/lmnp/dashboard/dashboard-workflow-model";
import {
  buildExtendedSteps,
  centerPhysicalIndex,
  DRAG_THRESHOLD_PX,
  isCardCentered,
  resolveBlock,
  resolveCardActivateDecision,
  resolveCarouselPointerAxisLock,
  resolveCenteredStepAtClick,
  resolveNearestPhysicalIndex,
  SCROLL_END_DEBOUNCE_MS,
  shouldEngageCarouselPointerCapture,
  toLogicalIndex,
  type CarouselBufferMode,
} from "@/components/lmnp/dashboard/workflow-carousel-engine";
import { isWorkflowCarouselCard } from "@/design-system/layouts/chapter-axis-lock";
import {
  engageChapterVerticalScrollLock,
  releaseChapterVerticalScrollLock,
} from "@/components/lmnp/dashboard/dashboard-chapter-scroll";
import { colors } from "@/design-system/theme/colors";
import { motions } from "@/design-system/theme/motions";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";

const CARD_WIDTH_PX = 240;
const CARD_MIN_WIDTH = `${CARD_WIDTH_PX}px`;
const CARD_GAP_PX = 16;
const ACTION_SLOT_HEIGHT = "40px";

// Carrousel centré — hiérarchie visuelle à 3 paliers (carte active / voisine / éloignée),
// pilotée en continu par la distance réelle au centre pendant le scroll (pas d'étape figée).
const ACTIVE_CARD_SCALE = 1.11;
const NEAR_CARD_SCALE = 0.95;
const FAR_CARD_SCALE = 0.82;
const NEAR_CARD_OPACITY = 0.92;
const FAR_CARD_OPACITY = 0.53;
const NEAR_DISTANCE_PX = CARD_WIDTH_PX + CARD_GAP_PX;
const FAR_DISTANCE_PX = NEAR_DISTANCE_PX * 2;
const CENTER_CLICK_TOLERANCE_PX = 32;

type GestureState = {
  /** True seulement si pointerdown a démarré sur une carte (`<li>`). */
  pointerActive: boolean;
  /** Bloque un seul click parasite après un drag horizontal (consommé dans handleCardActivate). */
  suppressNextClick: boolean;
  startX: number;
  startY: number;
  axisLock: "none" | "x" | "y";
};

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

function resolveCardVisual(distancePx: number): { scale: number; opacity: number } {
  const distance = Math.abs(distancePx);
  if (distance <= NEAR_DISTANCE_PX) {
    const t = distance / NEAR_DISTANCE_PX;
    return { scale: lerp(ACTIVE_CARD_SCALE, NEAR_CARD_SCALE, t), opacity: lerp(1, NEAR_CARD_OPACITY, t) };
  }
  const t = Math.min(1, (distance - NEAR_DISTANCE_PX) / (FAR_DISTANCE_PX - NEAR_DISTANCE_PX));
  return { scale: lerp(NEAR_CARD_SCALE, FAR_CARD_SCALE, t), opacity: lerp(NEAR_CARD_OPACITY, FAR_CARD_OPACITY, t) };
}

function shortenPrompt(prompt: string, max = 72): string {
  const text = humanizeConseillerText(prompt);
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

function resolveStepProgress(step: WorkflowStepView): {
  fillPercent: number;
  label: string | null;
} {
  if (step.status === "completed") {
    return { fillPercent: 100, label: "100%" };
  }
  if (step.status === "upcoming") {
    return { fillPercent: 0, label: null };
  }

  let fill = 0;
  if (step.documentDetected) fill = Math.max(fill, 25);
  if (step.extractionState === "Extraction en cours") fill = Math.max(fill, 50);
  if (step.extractionState === "Extraction terminée") fill = Math.max(fill, 70);
  if (step.validationBadge === "pending") fill = Math.max(fill, 60);
  if (step.validationBadge === "validated") fill = Math.max(fill, 85);

  return { fillPercent: fill > 0 ? fill : 15, label: null };
}

function statusChip(step: WorkflowStepView) {
  if (step.status === "completed") {
    return { label: "Terminé", color: colors.success.DEFAULT, bg: colors.success.surface };
  }
  if (step.status === "current") {
    return { label: "En cours", color: colors.orange[600], bg: colors.orange[50] };
  }
  return { label: "À venir", color: colors.text.muted, bg: colors.surface.secondary };
}

function scrollToPhysicalIndex(
  container: HTMLElement,
  physicalIndex: number,
  behavior: ScrollBehavior = "smooth",
) {
  const item = container.children.item(physicalIndex) as HTMLElement | null;
  if (!item) return;

  const containerRect = container.getBoundingClientRect();
  const itemRect = item.getBoundingClientRect();
  const containerCenter = containerRect.left + containerRect.width / 2;
  const itemCenter = itemRect.left + itemRect.width / 2;
  const delta = itemCenter - containerCenter;

  container.scrollTo({ left: container.scrollLeft + delta, behavior });
}

function WorkflowStepCard({
  step,
  index,
  isRouteActive,
  isHighlighted,
  isCentered,
  onActivate,
}: {
  step: WorkflowStepView;
  index: number;
  isRouteActive: boolean;
  isHighlighted: boolean;
  isCentered: boolean;
  onActivate: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const [ctaPressed, setCtaPressed] = useState(false);
  const href = resolveWorkflowStepNavigationHref(step);

  const { status } = step;
  const isCurrent = status === "current";
  const isCompleted = status === "completed";
  const isUpcoming = status === "upcoming";
  const chip = statusChip(step);
  const progress = resolveStepProgress(step);

  const cardStyle = {
    display: "flex" as const,
    flexDirection: "column" as const,
    height: "100%",
    borderRadius: radius.lg,
    border: `1px solid ${isHighlighted ? colors.orange[500] : "transparent"}`,
    backgroundColor: isHighlighted
      ? colors.orange[50]
      : isCurrent
        ? colors.surface.primary
        : isCompleted
          ? colors.surface.primary
          : colors.surface.secondary,
    boxShadow: isHighlighted ? shadows.card.hover : isCurrent ? shadows.card.hover : shadows.card.default,
    padding: spacing.card.md,
    transition: `${motions.hover.card}, background-color ${motions.duration.extended} ${motions.easing.out}, border-color ${motions.duration.extended} ${motions.easing.out}, box-shadow ${motions.duration.slow} ${motions.easing.out}`,
    textDecoration: "none" as const,
    color: "inherit",
  };

  const content = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span
          style={{
            ...typography.caption.desktop,
            color: isUpcoming ? colors.text.muted : colors.text.tertiary,
            letterSpacing: typography.letterSpacing.label,
          }}
        >
          {String(index + 1).padStart(2, "0")}
        </span>
        <span
          style={{
            ...typography.caption.desktop,
            color: chip.color,
            backgroundColor: chip.bg,
            borderRadius: radius.full,
            padding: `${spacing.scale[1]} ${spacing.scale[3]}`,
          }}
        >
          {chip.label}
        </span>
      </div>

      <div className="mt-5 flex flex-1 flex-col items-center text-center">
        <span
          className="inline-flex items-center justify-center"
          style={{
            width: "48px",
            height: "48px",
            borderRadius: radius.full,
            backgroundColor: isCurrent ? colors.orange[50] : colors.surface.primary,
            border: `1px solid ${isCurrent ? colors.border.selected : colors.border.subtle}`,
          }}
        >
          <StepIcon id={step.id} muted={isUpcoming} />
        </span>

        <h3
          className="mt-4"
          style={{
            fontFamily: typography.fontFamily.display,
            fontSize: typography.fontSize.lg,
            lineHeight: typography.lineHeight.title,
            color: isUpcoming ? colors.text.muted : colors.text.primary,
          }}
        >
          {step.label}
        </h3>

        <p
          className="mt-2 line-clamp-2"
          style={{
            ...typography.caption.desktop,
            color: colors.text.secondary,
            lineHeight: typography.lineHeight.ui,
            minHeight: "2.5em",
          }}
        >
          {shortenPrompt(step.documentPrompt)}
        </p>
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between gap-2">
          <div
            className="flex-1 overflow-hidden"
            style={{
              height: "4px",
              borderRadius: radius.full,
              backgroundColor: colors.surface.tertiary,
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${progress.fillPercent}%`,
                borderRadius: radius.full,
                backgroundColor: isCompleted
                  ? colors.success.DEFAULT
                  : isCurrent
                    ? colors.orange[500]
                    : colors.border.default,
                transition: motions.workflow.progress,
              }}
            />
          </div>
          {progress.label ? (
            <span style={{ ...typography.caption.desktop, color: colors.text.muted }}>
              {progress.label}
            </span>
          ) : null}
        </div>

        {isCurrent ? (
          <div className="mt-4 flex justify-center" style={{ height: ACTION_SLOT_HEIGHT }}>
            <span
              aria-hidden
              className="inline-flex items-center justify-center"
              style={{
                width: ACTION_SLOT_HEIGHT,
                height: ACTION_SLOT_HEIGHT,
                borderRadius: radius.full,
                backgroundColor: colors.orange[500],
                color: colors.text.inverse,
                boxShadow: shadows.button.primary,
                fontSize: typography.fontSize.lg,
                transform: ctaPressed && isCentered ? "scale(0.94)" : "scale(1)",
                transition: motions.hover.card,
              }}
            >
              →
            </span>
          </div>
        ) : (
          <div aria-hidden className="mt-4" style={{ height: ACTION_SLOT_HEIGHT }} />
        )}
      </div>
    </>
  );

  return (
    <li
      data-step-id={step.id}
      className="flex shrink-0"
      style={{ minWidth: CARD_MIN_WIDTH, width: CARD_MIN_WIDTH }}
    >
      <Link
        href={href}
        aria-current={isRouteActive ? "page" : undefined}
        className="flex flex-1 flex-col"
        style={cardStyle}
        onClick={(event) => {
          onActivate(event);
        }}
        onPointerDown={() => {
          if (isCurrent && isCentered) setCtaPressed(true);
        }}
        onPointerUp={(event) => {
          setCtaPressed(false);
        }}
        onPointerCancel={() => setCtaPressed(false)}
        onPointerLeave={() => setCtaPressed(false)}
      >
        {content}
      </Link>
    </li>
  );
}

function ScrollFade({
  side,
}: {
  side: "left" | "right";
}) {
  const isLeft = side === "left";
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute top-0 z-10 h-full"
      style={{
        width: "48px",
        [isLeft ? "left" : "right"]: 0,
        background: isLeft
          ? `linear-gradient(to right, ${colors.background.creamWarm}, transparent)`
          : `linear-gradient(to left, ${colors.background.creamWarm}, transparent)`,
      }}
    />
  );
}

export function DashboardWorkflow({
  steps,
  highlightStepId = null,
  highlightActive = false,
}: {
  steps: WorkflowStepView[];
  highlightStepId?: string | null;
  highlightActive?: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const scrollRef = useRef<HTMLOListElement>(null);
  const rafRef = useRef<number | null>(null);
  const scrollEndTimerRef = useRef<number | null>(null);
  const isRepositioningRef = useRef(false);
  const pendingInfiniteLogicalRef = useRef<number | null>(null);
  const hasInitializedRef = useRef(false);
  const userCarouselInteractedRef = useRef(false);
  const gestureRef = useRef<GestureState>({
    pointerActive: false,
    suppressNextClick: false,
    startX: 0,
    startY: 0,
    axisLock: "none",
  });
  const carouselVerticalLockEngagedRef = useRef(false);
  const [isReady, setIsReady] = useState(false);
  const [bufferMode, setBufferMode] = useState<CarouselBufferMode>("progressive");
  const centeredPhysicalIndexRef = useRef<number | null>(null);
  const [centeredPhysicalIndex, setCenteredPhysicalIndex] = useState<number | null>(null);

  const extendedSteps = useMemo(
    () => buildExtendedSteps(steps, bufferMode),
    [bufferMode, steps],
  );
  const stepCount = steps.length;

  const activeStepId = useMemo(
    () => resolveActiveWorkflowStepFromRoute(pathname, searchParams.get("step")),
    [pathname, searchParams],
  );

  const currentStepId = useMemo(
    () => steps.find((step) => step.status === "current")?.id ?? null,
    [steps],
  );

  const scrollToLogicalIndex = useCallback(
    (logicalIndex: number, behavior: ScrollBehavior = "smooth") => {
      const el = scrollRef.current;
      if (!el || stepCount === 0) return;
      scrollToPhysicalIndex(el, centerPhysicalIndex(logicalIndex, stepCount, bufferMode), behavior);
    },
    [bufferMode, stepCount],
  );

  const enableInfiniteLoop = useCallback(() => {
    if (bufferMode === "infinite") return;
    const el = scrollRef.current;
    if (!el || stepCount === 0) return;
    const logicalIndex = toLogicalIndex(
      resolveNearestPhysicalIndex(el, stepCount, "progressive"),
      stepCount,
    );
    pendingInfiniteLogicalRef.current = logicalIndex;
    setBufferMode("infinite");
  }, [bufferMode, stepCount]);

  const updateCardVisuals = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    const containerRect = el.getBoundingClientRect();
    const containerCenter = containerRect.left + containerRect.width / 2;
    const liEls = Array.from(el.children) as HTMLLIElement[];

    let nearestIndex = -1;
    let nearestDistance = Number.POSITIVE_INFINITY;
    liEls.forEach((li, index) => {
      const rect = li.getBoundingClientRect();
      const distance = Math.abs(rect.left + rect.width / 2 - containerCenter);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });

    liEls.forEach((li, physicalIndex) => {
      const entry = extendedSteps[physicalIndex];
      if (!entry) return;

      const rect = li.getBoundingClientRect();
      const distance = rect.left + rect.width / 2 - containerCenter;
      const { scale, opacity } = resolveCardVisual(distance);
      const isNearest = physicalIndex === nearestIndex;

      li.style.transform = `scale(${scale.toFixed(3)})`;
      li.style.opacity = opacity.toFixed(3);
      li.style.zIndex = isNearest ? "1" : "0";
      if (isNearest && centeredPhysicalIndexRef.current !== physicalIndex) {
        centeredPhysicalIndexRef.current = physicalIndex;
        setCenteredPhysicalIndex(physicalIndex);
      }

      const anchor = li.firstElementChild as HTMLElement | null;
      if (anchor) {
        const absDistance = Math.abs(distance);
        if (isNearest) {
          anchor.style.backgroundColor = colors.workflow.activeBackground;
          anchor.style.boxShadow = shadows.card.hover;
          anchor.style.borderColor = colors.border.selected;
        } else if (absDistance <= NEAR_DISTANCE_PX) {
          anchor.style.borderColor = "transparent";
          anchor.style.backgroundColor = colors.surface.interactive;
          anchor.style.boxShadow = shadows.card.default;
        } else if (entry.step.status === "current" || entry.step.status === "completed") {
          anchor.style.borderColor = "transparent";
          anchor.style.backgroundColor = colors.surface.primary;
          anchor.style.boxShadow = shadows.card.default;
        } else if (highlightActive && highlightStepId === entry.step.id) {
          anchor.style.borderColor = "transparent";
          anchor.style.backgroundColor = colors.orange[50];
          anchor.style.boxShadow = shadows.card.default;
        } else {
          anchor.style.borderColor = "transparent";
          anchor.style.backgroundColor = colors.surface.secondary;
          anchor.style.boxShadow = shadows.card.default;
        }
      }
    });
  }, [extendedSteps, highlightActive, highlightStepId]);

  const scheduleVisualUpdate = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      updateCardVisuals();
    });
  }, [updateCardVisuals]);

  const finalizeScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || stepCount === 0 || isRepositioningRef.current) return;

    const physicalIndex = resolveNearestPhysicalIndex(el, stepCount, bufferMode);
    const block = resolveBlock(physicalIndex, stepCount, bufferMode);

    if (block !== "center") {
      isRepositioningRef.current = true;
      const logicalIndex = toLogicalIndex(physicalIndex, stepCount);
      scrollToPhysicalIndex(el, centerPhysicalIndex(logicalIndex, stepCount, bufferMode), "instant");
      isRepositioningRef.current = false;
      scheduleVisualUpdate();
    }

    const nearestAfterReposition = resolveNearestPhysicalIndex(el, stepCount, bufferMode);
    if (!isCardCentered(el, nearestAfterReposition, CENTER_CLICK_TOLERANCE_PX)) {
      scrollToPhysicalIndex(el, nearestAfterReposition, "smooth");
      return;
    }

    if (bufferMode === "progressive" && userCarouselInteractedRef.current) {
      const logicalIndex = toLogicalIndex(nearestAfterReposition, stepCount);
      pendingInfiniteLogicalRef.current = logicalIndex;
      setBufferMode("infinite");
    }
  }, [bufferMode, scheduleVisualUpdate, stepCount]);

  const scheduleScrollEnd = useCallback(() => {
    if (scrollEndTimerRef.current !== null) {
      window.clearTimeout(scrollEndTimerRef.current);
    }
    scrollEndTimerRef.current = window.setTimeout(() => {
      scrollEndTimerRef.current = null;
      finalizeScroll();
    }, SCROLL_END_DEBOUNCE_MS);
  }, [finalizeScroll]);

  const handleCardActivate = useCallback(
    (event: MouseEvent<HTMLAnchorElement>, stepId: WorkflowStepView["id"]) => {
      const container = scrollRef.current;
      if (!container || stepCount === 0) return;

      const centered = resolveCenteredStepAtClick(
        container,
        steps,
        stepCount,
        bufferMode,
        CENTER_CLICK_TOLERANCE_PX,
      );
      const decision = resolveCardActivateDecision({
        suppressNextClick: gestureRef.current.suppressNextClick,
        clickedStepId: stepId,
        centeredStepId: centered.stepId,
        isGeometricallyCentered: centered.isCentered,
      });

      if (decision.kind === "suppress") {
        event.preventDefault();
        gestureRef.current.suppressNextClick = false;
        return;
      }

      if (decision.kind === "navigate") {
        return;
      }

      event.preventDefault();
      userCarouselInteractedRef.current = true;

      const clickedLi = (event.currentTarget as HTMLElement).closest("li[data-step-id]");
      const clickedPhysicalIndex =
        clickedLi !== null
          ? Array.from(container.children).indexOf(clickedLi)
          : centered.physicalIndex;

      if (clickedPhysicalIndex >= 0) {
        scrollToPhysicalIndex(container, clickedPhysicalIndex, "smooth");
      }
    },
    [bufferMode, stepCount, steps],
  );

  const handlePointerDown = useCallback((event: PointerEvent<HTMLOListElement>) => {
    if (!isWorkflowCarouselCard(event.target)) return;

    gestureRef.current = {
      pointerActive: true,
      suppressNextClick: false,
      startX: event.clientX,
      startY: event.clientY,
      axisLock: "none",
    };
  }, []);

  const handlePointerMove = useCallback((event: PointerEvent<HTMLOListElement>) => {
    if (!gestureRef.current.pointerActive) return;

    const dx = Math.abs(event.clientX - gestureRef.current.startX);
    const dy = Math.abs(event.clientY - gestureRef.current.startY);
    const axisLockBefore = gestureRef.current.axisLock;

    gestureRef.current.axisLock = resolveCarouselPointerAxisLock(
      gestureRef.current.axisLock,
      dx,
      dy,
    );

    if (
      shouldEngageCarouselPointerCapture(axisLockBefore, gestureRef.current.axisLock) &&
      !event.currentTarget.hasPointerCapture(event.pointerId)
    ) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    if (gestureRef.current.axisLock === "x") {
      userCarouselInteractedRef.current = true;
      if (!carouselVerticalLockEngagedRef.current) {
        carouselVerticalLockEngagedRef.current = engageChapterVerticalScrollLock("carousel");
      }
      event.preventDefault();
    }
  }, []);

  const releaseCarouselVerticalLockIfOwned = useCallback(() => {
    if (!carouselVerticalLockEngagedRef.current) return;
    releaseChapterVerticalScrollLock("carousel");
    carouselVerticalLockEngagedRef.current = false;
  }, []);

  const handlePointerUp = useCallback((event: PointerEvent<HTMLOListElement>) => {
    if (!gestureRef.current.pointerActive) {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      return;
    }

    if (gestureRef.current.axisLock === "x") {
      gestureRef.current.suppressNextClick = true;
    }

    gestureRef.current.pointerActive = false;
    gestureRef.current.axisLock = "none";
    releaseCarouselVerticalLockIfOwned();

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, [releaseCarouselVerticalLockIfOwned]);

  const handleScroll = useCallback(() => {
    scheduleVisualUpdate();
    scheduleScrollEnd();
  }, [scheduleScrollEnd, scheduleVisualUpdate]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleTouchMove = (event: TouchEvent) => {
      if (!gestureRef.current.pointerActive) return;
      const touch = event.touches[0];
      if (!touch) return;

      const dx = Math.abs(touch.clientX - gestureRef.current.startX);
      const dy = Math.abs(touch.clientY - gestureRef.current.startY);

      if (gestureRef.current.axisLock === "none" && (dx > DRAG_THRESHOLD_PX || dy > DRAG_THRESHOLD_PX)) {
        gestureRef.current.axisLock = dx > dy ? "x" : "y";
      }

      if (gestureRef.current.axisLock === "x") {
        userCarouselInteractedRef.current = true;
        if (!carouselVerticalLockEngagedRef.current) {
          carouselVerticalLockEngagedRef.current = engageChapterVerticalScrollLock("carousel");
        }
        event.preventDefault();
      }
    };

    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    return () => el.removeEventListener("touchmove", handleTouchMove);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || stepCount === 0 || hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    const logicalIndex = currentStepId
      ? Math.max(0, steps.findIndex((step) => step.id === currentStepId))
      : 0;

    scrollToPhysicalIndex(el, centerPhysicalIndex(logicalIndex, stepCount, "progressive"), "instant");
    scheduleVisualUpdate();
    setIsReady(true);
  }, [currentStepId, scheduleVisualUpdate, stepCount, steps]);

  useEffect(() => {
    if (bufferMode !== "infinite" || pendingInfiniteLogicalRef.current === null) return;
    const el = scrollRef.current;
    if (!el || stepCount === 0) return;

    const logicalIndex = pendingInfiniteLogicalRef.current;
    pendingInfiniteLogicalRef.current = null;
    scrollToPhysicalIndex(el, centerPhysicalIndex(logicalIndex, stepCount, "infinite"), "instant");
    scheduleVisualUpdate();
  }, [bufferMode, scheduleVisualUpdate, stepCount]);

  useEffect(() => {
    if (!highlightActive || !highlightStepId || stepCount === 0) return;

    const logicalIndex = steps.findIndex((step) => step.id === highlightStepId);
    if (logicalIndex < 0) return;

    scrollToLogicalIndex(logicalIndex, "smooth");
    scheduleVisualUpdate();
  }, [highlightActive, highlightStepId, scheduleVisualUpdate, scrollToLogicalIndex, stepCount, steps]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    scheduleVisualUpdate();

    const observer = new ResizeObserver(() => scheduleVisualUpdate());
    observer.observe(el);
    window.addEventListener("resize", scheduleVisualUpdate);

    const onScrollEnd = () => finalizeScroll();
    el.addEventListener("scrollend", onScrollEnd);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", scheduleVisualUpdate);
      el.removeEventListener("scrollend", onScrollEnd);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (scrollEndTimerRef.current !== null) {
        window.clearTimeout(scrollEndTimerRef.current);
        scrollEndTimerRef.current = null;
      }
    };
  }, [finalizeScroll, scheduleVisualUpdate]);

  const handleKeyDown = (event: KeyboardEvent<HTMLOListElement>) => {
    const el = scrollRef.current;
    if (!el || stepCount === 0) return;

    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      userCarouselInteractedRef.current = true;
      enableInfiniteLoop();
      const physicalIndex = resolveNearestPhysicalIndex(el, stepCount, bufferMode);
      const delta = event.key === "ArrowRight" ? 1 : -1;
      scrollToPhysicalIndex(el, physicalIndex + delta, "smooth");
    }
  };

  return (
    <div
      className="relative"
      style={{
        alignSelf: "flex-start",
        width: "100%",
        marginLeft: spacing.scale[9],
        paddingLeft: spacing.scale[6],
        touchAction: "pan-y",
      }}
    >
      <ScrollFade side="left" />
      <ScrollFade side="right" />

      <ol
        ref={scrollRef}
        data-workflow-carousel=""
        tabIndex={0}
        aria-label="Étapes de déclaration"
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onScroll={handleScroll}
        className="flex flex-nowrap items-stretch overflow-x-auto outline-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{
          listStyle: "none",
          margin: 0,
          paddingBlock: 0,
          paddingInline: `calc(50% - ${CARD_MIN_WIDTH} / 2)`,
          gap: spacing.scale[4],
          WebkitOverflowScrolling: "touch",
          overscrollBehaviorX: "contain",
          touchAction: "pan-x",
          visibility: isReady ? "visible" : "hidden",
        }}
      >
        {extendedSteps.map((entry) => (
          <WorkflowStepCard
            key={`${entry.step.id}-${entry.physicalIndex}`}
            step={entry.step}
            index={entry.logicalIndex}
            isRouteActive={activeStepId === entry.step.id}
            isHighlighted={highlightActive && highlightStepId === entry.step.id}
            isCentered={centeredPhysicalIndex === entry.physicalIndex}
            onActivate={(event) => handleCardActivate(event, entry.step.id)}
          />
        ))}
      </ol>
    </div>
  );
}
