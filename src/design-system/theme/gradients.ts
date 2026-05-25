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
      `radial-gradient(ellipse 85% 55% at 50% -8%, ${colors.background.landingGlowSoft} 0%, transparent 58%)`,
      `radial-gradient(ellipse 78% 62% at 94% 36%, ${colors.orange[200]} 0%, transparent 56%)`,
      `radial-gradient(ellipse 70% 55% at 88% 35%, ${colors.background.landingGlow} 0%, transparent 68%)`,
      `radial-gradient(ellipse 52% 48% at 6% 72%, ${colors.background.landingGlowSoft} 0%, transparent 66%)`,
      `radial-gradient(ellipse 34% 28% at 74% 84%, ${colors.orange[100]} 0%, transparent 72%)`,
      `linear-gradient(102deg, ${colors.background.landingLeft} 0%, ${colors.background.creamWarm} 24%, ${colors.background.landingGradientStart} 46%, ${colors.background.landingGradientMid} 74%, ${colors.background.landingGradientEnd} 100%)`,
    ].join(", "),

    /** Soft atmospheric haze — overlays the full public page */
    atmosphere: [
      `radial-gradient(ellipse 120% 70% at 50% 105%, ${colors.orange[100]} 0%, transparent 52%)`,
      `radial-gradient(ellipse 90% 60% at 100% 0%, ${colors.background.landingGlow} 0%, transparent 48%)`,
      `radial-gradient(ellipse 70% 50% at 0% 40%, ${colors.background.landingGlowSoft} 0%, transparent 55%)`,
    ].join(", "),

    /** Right-side orange glow accent — overlays, decorative blobs */
    glowRight: `radial-gradient(ellipse 65% 55% at 100% 42%, ${colors.orange[200]} 0%, transparent 70%)`,

    /** Left-side cream warmth — soft counterbalance */
    glowLeft: `radial-gradient(ellipse 58% 50% at 0% 58%, ${colors.background.landingGlowSoft} 0%, transparent 66%)`,
  },

  // ─── 2. Private app background ─────────────────────────────────────────────

  app: {
    /** Centered cream canvas with premium warm edge lighting */
    background: [
      `radial-gradient(ellipse 88% 58% at 50% 0%, ${colors.background.landingGlowSoft} 0%, transparent 62%)`,
      `radial-gradient(ellipse 72% 85% at 50% 48%, ${colors.background.creamWarm} 0%, transparent 70%)`,
      `radial-gradient(ellipse 44% 135% at 0% 50%, ${colors.orange[100]} 0%, transparent 66%)`,
      `radial-gradient(ellipse 44% 135% at 100% 50%, ${colors.orange[100]} 0%, transparent 66%)`,
      `radial-gradient(ellipse 38% 120% at 0% 50%, ${colors.background.appDiffusionLeft} 0%, transparent 72%)`,
      `radial-gradient(ellipse 38% 120% at 100% 50%, ${colors.background.appDiffusionRight} 0%, transparent 72%)`,
      `linear-gradient(180deg, ${colors.background.appDiffusionCenter} 0%, ${colors.background.app} 46%, ${colors.background.creamSoft} 100%)`,
    ].join(", "),

    /** Top-center warm key light for dashboard atmosphere */
    centerLight: `radial-gradient(ellipse 62% 48% at 50% 16%, ${colors.background.landingGlowSoft} 0%, transparent 72%)`,

    /** Side diffusion only — for partial panels or sidebars */
    diffusionLeft: [
      `radial-gradient(ellipse 55% 110% at 0% 50%, ${colors.orange[100]} 0%, transparent 62%)`,
      `radial-gradient(ellipse 50% 100% at 0% 50%, ${colors.background.appDiffusionLeft} 0%, transparent 75%)`,
    ].join(", "),

    diffusionRight: [
      `radial-gradient(ellipse 55% 110% at 100% 50%, ${colors.orange[100]} 0%, transparent 62%)`,
      `radial-gradient(ellipse 50% 100% at 100% 50%, ${colors.background.appDiffusionRight} 0%, transparent 75%)`,
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
