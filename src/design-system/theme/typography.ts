/**
 * Fiscal AI — Official Typography System
 *
 * Apple × Linear × premium French fintech.
 * Elegant serif headlines, ultra-readable sans body, calm premium rhythm.
 *
 * Desktop/mobile presets are designed for generous whitespace —
 * pair with the spacing scale for full layout rhythm.
 */
export const typography = {
  // ─── Font families ─────────────────────────────────────────────────────────

  fontFamily: {
    /** Hero titles, major sections — editorial serif (Canela / Domaine feel) */
    display:
      '"Fraunces", "Instrument Serif", Georgia, "Times New Roman", serif',
    /** Body copy, UI, navigation — soft modern sans */
    sans: '"DM Sans", "Helvetica Neue", Helvetica, Arial, sans-serif',
    /** Tables, numeric data, code snippets */
    mono: '"Geist Mono", "SF Mono", "Menlo", "Courier New", monospace',
  },

  // ─── Font sizes (px) ───────────────────────────────────────────────────────

  fontSize: {
    "2xs": 11,
    xs: 12,
    sm: 13,
    base: 15,
    md: 16,
    lg: 18,
    xl: 20,
    "2xl": 24,
    "3xl": 28,
    "4xl": 36,
    "5xl": 44,
    "6xl": 56,
    "7xl": 64,
  },

  // ─── Line heights ──────────────────────────────────────────────────────────

  lineHeight: {
    /** Display headlines — tight but breathable */
    display: 1.08,
    /** Section titles */
    heading: 1.15,
    /** Card titles, subheadings */
    title: 1.3,
    /** Body paragraphs */
    body: 1.65,
    /** UI labels, navigation */
    ui: 1.45,
    /** Compact table rows */
    compact: 1.35,
    /** Loose editorial blocks */
    relaxed: 1.75,
  },

  // ─── Letter spacing ────────────────────────────────────────────────────────

  letterSpacing: {
    /** Large serif headlines */
    display: "-0.025em",
    /** Section headings */
    heading: "-0.02em",
    /** Card titles */
    title: "-0.015em",
    /** Default body */
    body: "0.005em",
    /** UI labels — subtle openness */
    label: "0.02em",
    /** Navigation, tabs */
    navigation: "0.01em",
    /** Uppercase micro-labels */
    caps: "0.06em",
    /** Table headers */
    table: "0.03em",
  },

  // ─── Font weights — calm, never aggressive ─────────────────────────────────

  fontWeight: {
    regular: 400,
    medium: 500,
    /** Reserved for rare emphasis only */
    semibold: 600,
  },

  // ─── Semantic styles ───────────────────────────────────────────────────────

  hero: {
    desktop: {
      fontFamily:
        '"Fraunces", "Instrument Serif", Georgia, "Times New Roman", serif',
      fontSize: 64,
      lineHeight: 1.08,
      letterSpacing: "-0.025em",
      fontWeight: 400,
    },
    mobile: {
      fontFamily:
        '"Fraunces", "Instrument Serif", Georgia, "Times New Roman", serif',
      fontSize: 40,
      lineHeight: 1.1,
      letterSpacing: "-0.02em",
      fontWeight: 400,
    },
  },

  sectionTitle: {
    desktop: {
      fontFamily:
        '"Fraunces", "Instrument Serif", Georgia, "Times New Roman", serif',
      fontSize: 44,
      lineHeight: 1.12,
      letterSpacing: "-0.022em",
      fontWeight: 400,
    },
    mobile: {
      fontFamily:
        '"Fraunces", "Instrument Serif", Georgia, "Times New Roman", serif',
      fontSize: 30,
      lineHeight: 1.15,
      letterSpacing: "-0.018em",
      fontWeight: 400,
    },
  },

  cardTitle: {
    desktop: {
      fontFamily: '"DM Sans", "Helvetica Neue", Helvetica, Arial, sans-serif',
      fontSize: 20,
      lineHeight: 1.3,
      letterSpacing: "-0.015em",
      fontWeight: 500,
    },
    mobile: {
      fontFamily: '"DM Sans", "Helvetica Neue", Helvetica, Arial, sans-serif',
      fontSize: 18,
      lineHeight: 1.35,
      letterSpacing: "-0.012em",
      fontWeight: 500,
    },
  },

  body: {
    desktop: {
      fontFamily: '"DM Sans", "Helvetica Neue", Helvetica, Arial, sans-serif',
      fontSize: 16,
      lineHeight: 1.65,
      letterSpacing: "0.005em",
      fontWeight: 400,
    },
    mobile: {
      fontFamily: '"DM Sans", "Helvetica Neue", Helvetica, Arial, sans-serif',
      fontSize: 15,
      lineHeight: 1.65,
      letterSpacing: "0.005em",
      fontWeight: 400,
    },
  },

  caption: {
    desktop: {
      fontFamily: '"DM Sans", "Helvetica Neue", Helvetica, Arial, sans-serif',
      fontSize: 13,
      lineHeight: 1.5,
      letterSpacing: "0.02em",
      fontWeight: 400,
    },
    mobile: {
      fontFamily: '"DM Sans", "Helvetica Neue", Helvetica, Arial, sans-serif',
      fontSize: 12,
      lineHeight: 1.5,
      letterSpacing: "0.02em",
      fontWeight: 400,
    },
  },

  navigation: {
    desktop: {
      fontFamily: '"DM Sans", "Helvetica Neue", Helvetica, Arial, sans-serif',
      fontSize: 14,
      lineHeight: 1.45,
      letterSpacing: "0.01em",
      fontWeight: 400,
    },
    mobile: {
      fontFamily: '"DM Sans", "Helvetica Neue", Helvetica, Arial, sans-serif',
      fontSize: 15,
      lineHeight: 1.45,
      letterSpacing: "0.01em",
      fontWeight: 400,
    },
  },

  workflow: {
    desktop: {
      fontFamily: '"DM Sans", "Helvetica Neue", Helvetica, Arial, sans-serif',
      fontSize: 14,
      lineHeight: 1.45,
      letterSpacing: "0.01em",
      fontWeight: 400,
    },
    mobile: {
      fontFamily: '"DM Sans", "Helvetica Neue", Helvetica, Arial, sans-serif',
      fontSize: 14,
      lineHeight: 1.45,
      letterSpacing: "0.01em",
      fontWeight: 400,
    },
    /** Active step — same size, gentle medium weight (not bold tabs) */
    active: {
      fontFamily: '"DM Sans", "Helvetica Neue", Helvetica, Arial, sans-serif',
      fontSize: 14,
      lineHeight: 1.45,
      letterSpacing: "0.01em",
      fontWeight: 500,
    },
  },

  button: {
    desktop: {
      fontFamily: '"DM Sans", "Helvetica Neue", Helvetica, Arial, sans-serif',
      fontSize: 15,
      lineHeight: 1,
      letterSpacing: "0.01em",
      fontWeight: 500,
    },
    mobile: {
      fontFamily: '"DM Sans", "Helvetica Neue", Helvetica, Arial, sans-serif',
      fontSize: 15,
      lineHeight: 1,
      letterSpacing: "0.01em",
      fontWeight: 500,
    },
  },

  table: {
    /** Column headers */
    header: {
      desktop: {
        fontFamily: '"DM Sans", "Helvetica Neue", Helvetica, Arial, sans-serif',
        fontSize: 12,
        lineHeight: 1.35,
        letterSpacing: "0.03em",
        fontWeight: 500,
        textTransform: "uppercase" as const,
      },
      mobile: {
        fontFamily: '"DM Sans", "Helvetica Neue", Helvetica, Arial, sans-serif',
        fontSize: 11,
        lineHeight: 1.35,
        letterSpacing: "0.03em",
        fontWeight: 500,
        textTransform: "uppercase" as const,
      },
    },
    /** Row cell content */
    cell: {
      desktop: {
        fontFamily: '"DM Sans", "Helvetica Neue", Helvetica, Arial, sans-serif',
        fontSize: 14,
        lineHeight: 1.45,
        letterSpacing: "0.005em",
        fontWeight: 400,
      },
      mobile: {
        fontFamily: '"DM Sans", "Helvetica Neue", Helvetica, Arial, sans-serif',
        fontSize: 13,
        lineHeight: 1.45,
        letterSpacing: "0.005em",
        fontWeight: 400,
      },
    },
    /** Numeric values — tabular alignment */
    numeric: {
      desktop: {
        fontFamily:
          '"Geist Mono", "SF Mono", "Menlo", "Courier New", monospace',
        fontSize: 14,
        lineHeight: 1.45,
        letterSpacing: "0",
        fontWeight: 400,
        fontVariantNumeric: "tabular-nums" as const,
      },
      mobile: {
        fontFamily:
          '"Geist Mono", "SF Mono", "Menlo", "Courier New", monospace',
        fontSize: 13,
        lineHeight: 1.45,
        letterSpacing: "0",
        fontWeight: 400,
        fontVariantNumeric: "tabular-nums" as const,
      },
    },
  },
} as const;

export type Typography = typeof typography;
