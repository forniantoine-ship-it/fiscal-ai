import type { CSSProperties, ReactNode } from "react";

/**
 * Logement tunnel visual isolation switch.
 * When true: strips all CSS animation/transition in the Logement tree and
 * forces fully-visible static sections (no delayed reveals, no spinner motion).
 * Flip to false to restore normal Logement visuals.
 */
export const LOGEMENT_STATIC_UI = true;

export const LOGEMENT_FADE_IN =
  LOGEMENT_STATIC_UI ? "" : "animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both]";

export function logementMotionStyle(
  withTransition?: string,
): CSSProperties | undefined {
  if (!LOGEMENT_STATIC_UI) {
    return withTransition ? { transition: withTransition } : undefined;
  }
  return { animation: "none", transition: "none", animationDelay: "0ms" };
}

export function logementDelayStyle(delayMs: number): CSSProperties {
  if (LOGEMENT_STATIC_UI) return { animationDelay: "0ms" };
  return { animationDelay: `${delayMs}ms` };
}

/** Forces extraction form sections fully open in static isolation mode. */
export function logementEffectiveVisibleSections(visibleSections: number): number {
  return LOGEMENT_STATIC_UI ? 2 : visibleSections;
}

export function LogementStaticRoot({ children }: { children: ReactNode }) {
  if (!LOGEMENT_STATIC_UI) return children;

  return (
    <div data-logement-static-ui="true" className="logement-static-ui-root">
      <style>{`
        .logement-static-ui-root,
        .logement-static-ui-root * {
          animation: none !important;
          transition: none !important;
          animation-delay: 0ms !important;
        }
      `}</style>
      {children}
    </div>
  );
}
