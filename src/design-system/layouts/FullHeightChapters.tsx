"use client";

import { type CSSProperties, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";

import { attachChapterAxisLock } from "@/design-system/layouts/chapter-axis-lock";

/** DEV_ONLY — diagnostic trackpad. Activer via :
 * `localStorage.setItem("fiscal-ai:dev:disable-chapter-mount-scroll-reset", "true")`
 * Supprimer ce bloc après le chantier diagnostic. */
const DEV_ONLY_CHAPTER_MOUNT_SCROLL_RESET_STORAGE_KEY =
  "fiscal-ai:dev:disable-chapter-mount-scroll-reset";

function isDevChapterMountScrollResetDisabled(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (typeof window === "undefined") return false;
  return (
    window.localStorage.getItem(DEV_ONLY_CHAPTER_MOUNT_SCROLL_RESET_STORAGE_KEY) === "true"
  );
}

type FullHeightChaptersProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /**
   * Surcharge optionnelle de --chapter-panel-height.
   * Par défaut : héritée du layout parent (ex. DashboardLayout).
   */
  chapterPanelHeight?: string;
};

/**
 * Conteneur générique de scroll vertical + snap par chapitres.
 * Propriétaire unique de overflow-y et scroll-snap-type.
 *
 * Attend des variables CSS posées par le layout parent :
 * - --chapter-scroll-height
 * - --chapter-scroll-offset-top
 * - --chapter-scroll-offset-inline
 * - --chapter-panel-height
 */
export function FullHeightChapters({
  children,
  className = "",
  style,
  chapterPanelHeight,
}: FullHeightChaptersProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [snapEnabled, setSnapEnabled] = useState(false);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const skipMountScrollReset = isDevChapterMountScrollResetDisabled();
    if (!skipMountScrollReset) {
      el.scrollTop = 0;
      if (process.env.NODE_ENV !== "production") {
        console.log("[chapters] scrollTop=0 (mount, sync)");
      }
    }
    const frame = requestAnimationFrame(() => {
      if (!skipMountScrollReset) {
        el.scrollTop = 0;
        if (process.env.NODE_ENV !== "production") {
          console.log("[chapters] scrollTop=0 (mount, rAF)");
        }
      }
      setSnapEnabled(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useLayoutEffect(() => {
    if (!snapEnabled) return;
    if (!isDevChapterMountScrollResetDisabled()) {
      scrollRef.current!.scrollTop = 0;
      if (process.env.NODE_ENV !== "production") {
        console.log("[chapters] scrollTop=0 (snapEnabled effect)");
      }
    }
  }, [snapEnabled]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !snapEnabled) return;
    if (process.env.NODE_ENV !== "production") {
      console.log("[chapters] attachChapterAxisLock (attach)");
    }
    const detach = attachChapterAxisLock(el);
    return () => {
      if (process.env.NODE_ENV !== "production") {
        console.log("[chapters] attachChapterAxisLock (detach)");
      }
      detach();
    };
  }, [snapEnabled]);

  return (
    <div
      ref={scrollRef}
      data-chapter-scroll=""
      className={`[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
      style={
        {
          overflowY: "auto",
          scrollSnapType: snapEnabled ? "y mandatory" : "none",
          scrollBehavior: "smooth",
          overscrollBehavior: "contain",
          overflowAnchor: "none",
          WebkitOverflowScrolling: "touch",
          height: "var(--chapter-scroll-height, 100dvh)",
          marginTop: "var(--chapter-scroll-offset-top, 0)",
          marginInline: "var(--chapter-scroll-offset-inline, 0)",
          // Compense le décalage initial du 1er chapitre (offsetTop ≈ header) pour
          // permettre au snap du chapitre 3 de s'aligner entièrement en haut.
          paddingBottom: "calc(var(--dashboard-header-height, 0px) + 2px)",
          ...(chapterPanelHeight
            ? { ["--chapter-panel-height" as string]: chapterPanelHeight }
            : {}),
          ...style,
        } as CSSProperties
      }
    >
      {children}
    </div>
  );
}

type ChapterProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  id?: string;
  "aria-label"?: string;
  /**
   * panel — écran plein viewport disponible (snap + height fixe).
   * flow  — contenu long ou dernier maillon, flux naturel sans snap forcé.
   */
  variant?: "panel" | "flow";
};

/** Une unité de chapitre : en-tête + contenu dimensionnés ensemble. */
export function Chapter({
  children,
  className = "",
  style,
  id,
  "aria-label": ariaLabel,
  variant = "panel",
}: ChapterProps) {
  const isPanel = variant === "panel";

  return (
    <section
      id={id}
      aria-label={ariaLabel}
      className={className}
      style={{
        height: isPanel ? "var(--chapter-panel-height, var(--chapter-scroll-height, 100dvh))" : undefined,
        flexShrink: isPanel ? 0 : undefined,
        scrollSnapAlign: isPanel ? "start" : undefined,
        scrollSnapStop: isPanel ? "always" : undefined,
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-start",
        alignItems: "stretch",
        boxSizing: "border-box",
        // Panel : overflow hidden — sur petit viewport le contenu du Ch. 2 peut être
        // partiellement masqué ; scroll interne par chapitre = chantier distinct (DEC-030).
        overflow: isPanel ? "hidden" : undefined,
        ...style,
      }}
    >
      {children}
    </section>
  );
}
