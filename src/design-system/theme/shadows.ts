/**
 * Warm shadow pigments — derived from the palette, never pure black.
 * Extremely low opacity for a light, breathable, premium feel.
 */
const pigment = {
  /** colors.text.secondary — primary shadow tone */
  warm: "92, 86, 80",
  /** colors.text.tertiary — ambient diffusion */
  ambient: "138, 131, 122",
  /** colors.orange[500] — warm accent glow */
  accent: "232, 125, 58",
  /** colors.orange[300] — soft accent halo */
  accentSoft: "255, 196, 154",
  /** colors.border.default — hairline depth */
  edge: "232, 226, 217",
  /** colors.success.DEFAULT — muted completion glow */
  success: "94, 138, 102",
} as const;

/**
 * Fiscal AI — Official Shadow System
 *
 * Apple × Linear × premium silent UI.
 * All values are CSS-ready `box-shadow` strings.
 * Layered shadows list the topmost layer first.
 */
export const shadows = {
  // ─── Soft card shadows ─────────────────────────────────────────────────────

  card: {
    /** Default resting card — almost invisible */
    default: [
      `0 1px 2px rgba(${pigment.warm}, 0.03)`,
      `0 4px 16px rgba(${pigment.ambient}, 0.035)`,
    ].join(", "),

    /** Card hover — gentle lift */
    hover: [
      `0 2px 4px rgba(${pigment.warm}, 0.04)`,
      `0 8px 28px rgba(${pigment.ambient}, 0.05)`,
    ].join(", "),

    /** Nested / inset card surface */
    inset: `inset 0 1px 2px rgba(${pigment.ambient}, 0.03)`,
  },

  // ─── Elevated modal shadows ────────────────────────────────────────────────

  modal: {
    /** Dialog, drawer, popover — soft elevation */
    elevated: [
      `0 1px 3px rgba(${pigment.warm}, 0.03)`,
      `0 8px 32px rgba(${pigment.warm}, 0.05)`,
      `0 24px 64px rgba(${pigment.ambient}, 0.045)`,
    ].join(", "),

    /** Large modal / full-screen sheet */
    deep: [
      `0 2px 6px rgba(${pigment.warm}, 0.035)`,
      `0 16px 48px rgba(${pigment.warm}, 0.06)`,
      `0 40px 96px rgba(${pigment.ambient}, 0.05)`,
    ].join(", "),

    /** Dropdown menu — lighter than modal */
    dropdown: [
      `0 1px 2px rgba(${pigment.warm}, 0.03)`,
      `0 6px 24px rgba(${pigment.ambient}, 0.05)`,
      `0 16px 40px rgba(${pigment.warm}, 0.04)`,
    ].join(", "),
  },

  // ─── Floating hero shadows ─────────────────────────────────────────────────

  hero: {
    /** Hero card or feature block on landing */
    floating: [
      `0 2px 6px rgba(${pigment.warm}, 0.025)`,
      `0 12px 40px rgba(${pigment.ambient}, 0.045)`,
      `0 32px 80px rgba(${pigment.accent}, 0.035)`,
    ].join(", "),

    /** Hero element hover — warm ambient bloom */
    floatingHover: [
      `0 4px 12px rgba(${pigment.warm}, 0.035)`,
      `0 16px 48px rgba(${pigment.ambient}, 0.055)`,
      `0 40px 96px rgba(${pigment.accent}, 0.05)`,
    ].join(", "),

    /** Decorative glow beneath hero imagery */
    glow: `0 24px 64px rgba(${pigment.accent}, 0.06)`,
  },

  // ─── Button hover shadows ──────────────────────────────────────────────────

  button: {
    /** Primary CTA resting — flat, confident */
    primary: `0 1px 2px rgba(${pigment.accent}, 0.08)`,

    /** Primary CTA hover — warm lift */
    primaryHover: [
      `0 2px 8px rgba(${pigment.accent}, 0.14)`,
      `0 6px 20px rgba(${pigment.accent}, 0.08)`,
    ].join(", "),

    /** Primary CTA pressed — settles back */
    primaryPressed: `0 1px 2px rgba(${pigment.accent}, 0.06)`,

    /** Secondary button hover */
    secondaryHover: [
      `0 1px 3px rgba(${pigment.warm}, 0.04)`,
      `0 4px 12px rgba(${pigment.ambient}, 0.045)`,
    ].join(", "),

    /** Ghost button hover — barely there */
    ghostHover: `0 2px 8px rgba(${pigment.accent}, 0.06)`,
  },

  // ─── Upload zone shadows ───────────────────────────────────────────────────

  upload: {
    /** Idle drop zone — flat and calm */
    idle: [
      `0 1px 2px rgba(${pigment.ambient}, 0.025)`,
      `inset 0 1px 2px rgba(${pigment.edge}, 0.4)`,
    ].join(", "),

    /** Drag-over — warm receptive glow */
    dragOver: [
      `0 0 0 3px rgba(${pigment.accentSoft}, 0.18)`,
      `0 4px 20px rgba(${pigment.accent}, 0.08)`,
    ].join(", "),

    /** Upload in progress */
    uploading: [
      `0 2px 8px rgba(${pigment.accent}, 0.07)`,
      `0 8px 24px rgba(${pigment.accentSoft}, 0.1)`,
    ].join(", "),

    /** Upload success */
    success: [
      `0 2px 8px rgba(${pigment.success}, 0.08)`,
      `0 6px 20px rgba(${pigment.success}, 0.05)`,
    ].join(", "),

    /** Upload error — muted, not alarming */
    error: `0 2px 8px rgba(182, 107, 99, 0.08)`,
  },

  // ─── Workflow card shadows ─────────────────────────────────────────────────

  workflow: {
    /** Default step card */
    default: [
      `0 1px 2px rgba(${pigment.warm}, 0.025)`,
      `0 3px 12px rgba(${pigment.ambient}, 0.03)`,
    ].join(", "),

    /** Active / current step — subtle warm emphasis */
    active: [
      `0 1px 3px rgba(${pigment.accent}, 0.06)`,
      `0 6px 20px rgba(${pigment.accent}, 0.07)`,
      `0 0 0 1px rgba(${pigment.accentSoft}, 0.25)`,
    ].join(", "),

    /** Completed step — quiet sage depth */
    completed: [
      `0 1px 2px rgba(${pigment.success}, 0.05)`,
      `0 4px 16px rgba(${pigment.success}, 0.04)`,
    ].join(", "),

    /** Step hover in navigation rail */
    hover: [
      `0 2px 4px rgba(${pigment.warm}, 0.035)`,
      `0 6px 20px rgba(${pigment.ambient}, 0.04)`,
    ].join(", "),
  },

  // ─── Utility ───────────────────────────────────────────────────────────────

  /** No shadow — explicit reset */
  none: "none",

  /** Hairline warm edge — use instead of harsh borders */
  ring: `0 0 0 1px rgba(${pigment.edge}, 0.65)`,

  /** Focus ring — pairs with colors.focus.ring */
  focus: `0 0 0 3px rgba(240, 196, 160, 0.35)`,
} as const;

export type Shadows = typeof shadows;
