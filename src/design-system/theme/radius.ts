/**
 * Fiscal AI — Official Radius System
 *
 * Soft premium modern fintech. Apple-like smoothness —
 * generous curves on cards and buttons, calm throughout.
 *
 * All values are CSS-ready pixel strings.
 */
export const radius = {
  /** Micro elements — badges, chips, compact inputs */
  xs: "6px",

  /** Tags, tooltips, small controls */
  sm: "8px",

  /** Buttons, inputs, default interactive surfaces */
  md: "12px",

  /** Cards, panels, dropdowns */
  lg: "16px",

  /** Large cards, modals, upload zones */
  xl: "20px",

  /** Hero blocks, feature sections, prominent surfaces */
  "2xl": "24px",

  /** Pills, avatars, circular controls */
  full: "9999px",
} as const;

export type Radius = typeof radius;
