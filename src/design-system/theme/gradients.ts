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

  app: {
    /** Centered cream canvas with premium warm edge lighting */
    background: [
      `radial-gradient(ellipse 94% 64% at 50% -1%, ${colors.background.landingGlowSoft} 0%, ${colors.orange[50]} 40%, transparent 74%)`,
      `radial-gradient(ellipse 80% 92% at 50% 50%, ${colors.background.creamWarm} 0%, ${colors.background.app} 52%, transparent 84%)`,
      `radial-gradient(ellipse 50% 145% at 0% 50%, ${colors.orange[100]} 0%, ${colors.orange[50]} 30%, transparent 68%)`,
      `radial-gradient(ellipse 50% 145% at 100% 50%, ${colors.orange[100]} 0%, ${colors.orange[50]} 30%, transparent 68%)`,
      `radial-gradient(ellipse 44% 128% at 0% 50%, ${colors.background.appDiffusionLeft} 0%, transparent 76%)`,
      `radial-gradient(ellipse 44% 128% at 100% 50%, ${colors.background.appDiffusionRight} 0%, transparent 76%)`,
      `linear-gradient(180deg, ${colors.background.appDiffusionCenter} 0%, ${colors.background.app} 38%, ${colors.background.creamSoft} 100%)`,
    ].join(", "),

    /** Top-center warm key light for dashboard atmosphere */
    centerLight: `radial-gradient(ellipse 70% 54% at 50% 10%, ${colors.background.landingGlowSoft} 0%, ${colors.orange[50]} 36%, transparent 76%)`,

    /** Side diffusion only — clearly visible orange ambient on both edges */
    diffusionLeft: [
      `radial-gradient(ellipse 62% 118% at -4% 50%, ${colors.orange[200]} 0%, ${colors.orange[100]} 26%, transparent 66%)`,
      `radial-gradient(ellipse 58% 108% at 0% 50%, ${colors.background.appDiffusionLeft} 0%, ${colors.orange[50]} 42%, transparent 80%)`,
    ].join(", "),

    diffusionRight: [
      `radial-gradient(ellipse 62% 118% at 104% 50%, ${colors.orange[200]} 0%, ${colors.orange[100]} 26%, transparent 66%)`,
      `radial-gradient(ellipse 58% 108% at 100% 50%, ${colors.background.appDiffusionRight} 0%, ${colors.orange[50]} 42%, transparent 80%)`,
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
