import { colors } from "./colors";

/**
 * Fiscal AI — Official Gradient System
 *
 * All values are CSS-ready `background-image` strings.
 * Layered gradients list the topmost layer first.
 */
export const gradients = {
  // ─── 1. Public landing hero ────────────────────────────────────────────────

  landing: {
    /** Full public canvas — cream left → warm orange right, never flat white */
    hero: [
      `radial-gradient(ellipse 92% 62% at 50% -4%, ${colors.background.landingGlowSoft} 0%, ${colors.orange[50]} 36%, transparent 72%)`,
      `radial-gradient(ellipse 84% 74% at 96% 38%, ${colors.orange[200]} 0%, ${colors.orange[100]} 34%, transparent 66%)`,
      `radial-gradient(ellipse 76% 58% at 86% 30%, ${colors.background.landingGlow} 0%, ${colors.orange[50]} 42%, transparent 70%)`,
      `radial-gradient(ellipse 62% 54% at 4% 64%, ${colors.background.landingGlowSoft} 0%, ${colors.background.creamWarm} 44%, transparent 78%)`,
      `radial-gradient(ellipse 42% 34% at 80% 86%, ${colors.orange[100]} 0%, transparent 72%)`,
      `linear-gradient(96deg, ${colors.background.landingLeft} 0%, ${colors.background.creamWarm} 18%, ${colors.background.landingGradientStart} 36%, ${colors.background.landingGradientMid} 58%, ${colors.background.landingGradientEnd} 82%, ${colors.orange[200]} 100%)`,
    ].join(", "),

    /** Soft atmospheric haze — overlays the full public page */
    atmosphere: [
      `radial-gradient(ellipse 135% 78% at 50% 108%, ${colors.orange[100]} 0%, ${colors.orange[50]} 32%, transparent 56%)`,
      `radial-gradient(ellipse 98% 68% at 100% 6%, ${colors.orange[200]} 0%, ${colors.background.landingGlow} 38%, transparent 54%)`,
      `radial-gradient(ellipse 78% 58% at 0% 34%, ${colors.background.landingGlowSoft} 0%, transparent 60%)`,
    ].join(", "),

    /** Right-side orange glow accent — premium sunset light */
    glowRight: [
      `radial-gradient(ellipse 72% 62% at 100% 36%, ${colors.orange[200]} 0%, ${colors.orange[100]} 36%, transparent 70%)`,
      `radial-gradient(ellipse 58% 48% at 90% 58%, ${colors.background.landingGlow} 0%, transparent 66%)`,
    ].join(", "),

    /** Left-side cream warmth — soft counterbalance */
    glowLeft: `radial-gradient(ellipse 64% 56% at 0% 54%, ${colors.background.landingGlowSoft} 0%, ${colors.background.creamWarm} 46%, transparent 76%)`,

    /** Stronger right sunset wash for public pages */
    sunsetRight: `radial-gradient(ellipse 92% 82% at 106% 48%, ${colors.orange[200]} 0%, ${colors.orange[100]} 28%, ${colors.background.landingGradientMid} 52%, transparent 74%)`,
  },

  // ─── 2. Private app background ─────────────────────────────────────────────
  //
  // Mirrors the LMNP Easy landing atmosphere: full-viewport linear edge washes,
  // strong orange right field, softer left, cream-readable center band.
  // Avoid small radial hotspots — layers cover the entire viewport.

  app: {
    /** Full-viewport cinematic base — linear only, strong right sunset like landing */
    background: [
      `linear-gradient(180deg, ${colors.orange[100]} 0%, ${colors.orange[50]} 8%, transparent 22%, transparent 78%, ${colors.orange[100]} 92%, ${colors.orange[200]} 100%)`,
      `linear-gradient(96deg, ${colors.background.landingLeft} 0%, ${colors.background.creamWarm} 10%, ${colors.background.landingGradientStart} 22%, ${colors.background.landingGradientMid} 42%, ${colors.background.landingGradientEnd} 62%, ${colors.orange[300]} 78%, ${colors.orange[200]} 88%, ${colors.orange[300]} 100%)`,
    ].join(", "),

    /** Full-width vertical + horizontal warmth — continuous edge immersion */
    atmosphere: [
      `linear-gradient(180deg, ${colors.orange[200]} 0%, ${colors.orange[100]} 10%, ${colors.orange[50]} 18%, transparent 36%, transparent 64%, ${colors.orange[100]} 82%, ${colors.orange[200]} 94%, ${colors.orange[300]} 100%)`,
      `linear-gradient(270deg, ${colors.orange[300]} 0%, ${colors.orange[200]} 8%, ${colors.background.landingGradientEnd} 16%, ${colors.background.landingGradientMid} 28%, transparent 58%)`,
      `linear-gradient(90deg, ${colors.orange[100]} 0%, ${colors.orange[50]} 6%, ${colors.background.landingGlowSoft} 14%, transparent 38%)`,
    ].join(", "),

    /** Full-height left edge — softer but clearly warm orange wash */
    glowLeft: [
      `linear-gradient(90deg, ${colors.orange[200]} 0%, ${colors.orange[100]} 8%, ${colors.orange[50]} 16%, ${colors.background.landingGlowSoft} 28%, transparent 46%)`,
      `linear-gradient(180deg, ${colors.orange[100]} 0%, ${colors.orange[50]} 6%, transparent 26%, transparent 74%, ${colors.orange[50]} 94%, ${colors.orange[100]} 100%)`,
    ].join(", "),

    /** Full-height right edge — dominant LMNP Easy sunset field */
    glowRight: [
      `linear-gradient(270deg, ${colors.orange[400]} 0%, ${colors.orange[300]} 10%, ${colors.orange[200]} 18%, ${colors.background.landingGradientEnd} 28%, ${colors.background.landingGradientMid} 38%, ${colors.orange[100]} 50%, ${colors.orange[50]} 62%, transparent 78%)`,
      `linear-gradient(180deg, ${colors.orange[300]} 0%, ${colors.orange[200]} 10%, transparent 32%, transparent 68%, ${colors.orange[200]} 90%, ${colors.orange[400]} 100%)`,
    ].join(", "),

    /** Extra right-side immersion — full viewport sunset sweep */
    sunsetRight: [
      `linear-gradient(270deg, ${colors.orange[400]} 0%, ${colors.orange[300]} 14%, ${colors.orange[200]} 26%, ${colors.background.landingGlow} 40%, ${colors.orange[50]} 54%, transparent 72%)`,
      `linear-gradient(115deg, transparent 32%, ${colors.orange[100]} 52%, ${colors.orange[200]} 70%, ${colors.orange[300]} 88%, ${colors.orange[400]} 100%)`,
    ].join(", "),

    /** Narrow cream readability band — linear only, edges stay fully orange */
    centerVault: `linear-gradient(90deg, transparent 0%, transparent 28%, ${colors.background.creamWarm}66 38%, ${colors.background.creamWarm}b8 46%, ${colors.background.creamWarm} 50%, ${colors.background.creamWarm}b8 54%, ${colors.background.creamWarm}66 62%, transparent 72%, transparent 100%)`,

    /** @deprecated aliases */
    centerLight: `linear-gradient(90deg, transparent 0%, transparent 28%, ${colors.background.creamWarm}66 38%, ${colors.background.creamWarm}b8 46%, ${colors.background.creamWarm} 50%, ${colors.background.creamWarm}b8 54%, ${colors.background.creamWarm}66 62%, transparent 72%, transparent 100%)`,

    diffusionLeft: [
      `linear-gradient(90deg, ${colors.orange[200]} 0%, ${colors.orange[100]} 8%, ${colors.orange[50]} 16%, ${colors.background.landingGlowSoft} 28%, transparent 46%)`,
      `linear-gradient(180deg, ${colors.orange[100]} 0%, ${colors.orange[50]} 6%, transparent 26%, transparent 74%, ${colors.orange[50]} 94%, ${colors.orange[100]} 100%)`,
    ].join(", "),

    diffusionRight: [
      `linear-gradient(270deg, ${colors.orange[400]} 0%, ${colors.orange[300]} 10%, ${colors.orange[200]} 18%, ${colors.background.landingGradientEnd} 28%, ${colors.background.landingGradientMid} 38%, ${colors.orange[100]} 50%, ${colors.orange[50]} 62%, transparent 78%)`,
      `linear-gradient(180deg, ${colors.orange[300]} 0%, ${colors.orange[200]} 10%, transparent 32%, transparent 68%, ${colors.orange[200]} 90%, ${colors.orange[400]} 100%)`,
    ].join(", "),
  },

  // ─── 3. Button gradients ───────────────────────────────────────────────────

  button: {
    /** Primary CTA — warm orange, top-lit */
    primary: `linear-gradient(180deg, ${colors.orange[400]} 0%, ${colors.orange[500]} 46%, ${colors.orange[600]} 100%)`,

    /** Primary hover — deeper, richer */
    primaryHover: `linear-gradient(180deg, ${colors.orange[500]} 0%, ${colors.orange[600]} 46%, ${colors.orange[700]} 100%)`,

    /** Primary pressed / active */
    primaryPressed: `linear-gradient(180deg, ${colors.orange[600]} 0%, ${colors.orange[700]} 46%, ${colors.orange[800]} 100%)`,

    /** Secondary — soft beige surface */
    secondary: `linear-gradient(180deg, ${colors.surface.primary} 0%, ${colors.surface.secondary} 100%)`,

    /** Secondary hover */
    secondaryHover: `linear-gradient(180deg, ${colors.surface.interactive} 0%, ${colors.surface.tertiary} 100%)`,

    /** Ghost — barely-there warm wash */
    ghost: `linear-gradient(180deg, transparent 0%, ${colors.orange[50]} 100%)`,

    /** Ghost hover */
    ghostHover: `linear-gradient(180deg, ${colors.orange[50]} 0%, ${colors.orange[100]} 100%)`,
  },

  // ─── 4. Card highlight gradients ───────────────────────────────────────────

  card: {
    /** Default elevated surface — ultra-soft beige depth */
    elevated: `linear-gradient(180deg, ${colors.surface.primary} 0%, ${colors.surface.interactive} 55%, ${colors.surface.secondary} 100%)`,

    /** Top-edge highlight — premium light catch */
    highlight: `linear-gradient(180deg, ${colors.surface.primary} 0%, ${colors.surface.primary} 12%, ${colors.surface.secondary} 100%)`,

    /** Interactive card at rest */
    interactive: `linear-gradient(165deg, ${colors.surface.primary} 0%, ${colors.surface.interactive} 100%)`,

    /** Interactive card hover — subtle lift */
    interactiveHover: `linear-gradient(165deg, ${colors.surface.primary} 0%, ${colors.surface.selected} 100%)`,

    /** Inset / recessed panel */
    inset: `linear-gradient(180deg, ${colors.surface.inset} 0%, ${colors.surface.tertiary} 100%)`,
  },

  // ─── 5. Workflow state gradients ───────────────────────────────────────────

  workflow: {
    /** AI analyzing / in-progress — warm orange shimmer */
    analyzing: `linear-gradient(90deg, ${colors.workflow.inProgressBackground} 0%, ${colors.orange[100]} 35%, ${colors.orange[200]} 50%, ${colors.orange[100]} 65%, ${colors.workflow.inProgressBackground} 100%)`,

    /** Completed / validated — muted sage wash */
    success: `linear-gradient(90deg, ${colors.success.light} 0%, ${colors.success.surface} 50%, ${colors.success.light} 100%)`,

    /** Attention required — muted amber wash */
    warning: `linear-gradient(90deg, ${colors.warning.light} 0%, ${colors.warning.surface} 50%, ${colors.warning.light} 100%)`,
  },
} as const;

export type Gradients = typeof gradients;
