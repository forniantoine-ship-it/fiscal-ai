/**
 * Fiscal AI — Official Spacing System
 *
 * Enormous breathing room. Apple-like whitespace, calm reading rhythm,
 * luxury minimalism — never dense, never ERP-like.
 *
 * All layout values are CSS-ready pixel strings.
 * Pair with typography presets for full vertical rhythm.
 */
export const spacing = {
  // ─── Base scale ────────────────────────────────────────────────────────────

  scale: {
    0: "0px",
    px: "1px",
    1: "4px",
    2: "8px",
    3: "12px",
    4: "16px",
    5: "20px",
    6: "24px",
    7: "28px",
    8: "32px",
    9: "36px",
    10: "40px",
    12: "48px",
    14: "56px",
    16: "64px",
    20: "80px",
    24: "96px",
    28: "112px",
    32: "128px",
    40: "160px",
    48: "192px",
  },

  // ─── Section spacing ───────────────────────────────────────────────────────

  section: {
    /** Gap between major page sections — dashboard */
    gap: "80px",
    /** Gap between major page sections — marketing / landing */
    gapLanding: "128px",
    /** Space below a section title before content */
    titleToContent: "32px",
    /** Space between content blocks within a section */
    blockGap: "48px",
    /** Space above the first section on a page */
    pageTop: "64px",
    /** Space below the last section before footer */
    pageBottom: "96px",
  },

  // ─── Workflow spacing ──────────────────────────────────────────────────────

  workflow: {
    /** Outer padding of the workflow layout shell */
    shellPadding: "48px",
    /** Gap between sidebar rail and main content */
    railToContent: "64px",
    /** Vertical gap between step items in navigation */
    stepGap: "8px",
    /** Padding inside each step nav item */
    stepPadding: "12px",
    /** Space between workflow header and step content */
    headerToContent: "40px",
    /** Gap between sequential workflow panels */
    panelGap: "32px",
    /** Bottom breathing room before actions/footer */
    footerGap: "48px",
  },

  // ─── Card padding ──────────────────────────────────────────────────────────

  card: {
    /** Compact stat or summary card */
    sm: "20px",
    /** Default content card */
    md: "28px",
    /** Primary dashboard card */
    lg: "32px",
    /** Feature card, upload zone, hero card */
    xl: "40px",
    /** Space between card title and body */
    titleGap: "16px",
    /** Space between stacked elements inside a card */
    contentGap: "24px",
    /** Gap between adjacent cards in a grid */
    gridGap: "24px",
  },

  // ─── Hero spacing ──────────────────────────────────────────────────────────

  hero: {
    /** Top padding — landing hero */
    paddingTop: "160px",
    /** Bottom padding — landing hero */
    paddingBottom: "120px",
    /** Space between headline and subheadline */
    titleToSubtitle: "24px",
    /** Space between subheadline and CTA group */
    subtitleToAction: "40px",
    /** Gap between CTA buttons */
    actionGap: "12px",
    /** Space between hero text column and visual */
    columnGap: "80px",
  },

  // ─── Layout gutters ────────────────────────────────────────────────────────

  gutter: {
    /** Mobile edge inset */
    mobile: "24px",
    /** Tablet edge inset */
    tablet: "40px",
    /** Desktop edge inset */
    desktop: "48px",
    /** Wide desktop edge inset */
    wide: "64px",
  },

  // ─── Container widths ──────────────────────────────────────────────────────

  container: {
    /** Narrow forms, auth, focused flows */
    narrow: "560px",
    /** Optimal reading width — prose, legal, help */
    content: "720px",
    /** Default app / dashboard content area */
    default: "1120px",
    /** Wide dashboard with side panels */
    wide: "1280px",
    /** Maximum marketing page width */
    max: "1440px",
  },

  // ─── Table spacing — airy, never ERP-dense ─────────────────────────────────

  table: {
    /** Vertical cell padding */
    cellY: "18px",
    /** Horizontal cell padding */
    cellX: "20px",
    /** Header row vertical padding */
    headerY: "14px",
    /** Space between table section title and table */
    sectionGap: "32px",
    /** Gap between table and pagination / actions */
    footerGap: "24px",
    /** Minimum row height for calm scanning */
    rowMinHeight: "56px",
  },

  // ─── Responsive spacing rules ──────────────────────────────────────────────
  //
  // Apply via media queries. Mobile values stay generous —
  // never compress to dense dashboard patterns.

  responsive: {
    /** Page vertical padding */
    page: {
      desktop: "80px",
      tablet: "64px",
      mobile: "48px",
    },

    /** Section-to-section gap */
    section: {
      desktop: "80px",
      tablet: "64px",
      mobile: "56px",
    },

    /** Landing section-to-section gap */
    sectionLanding: {
      desktop: "128px",
      tablet: "96px",
      mobile: "72px",
    },

    /** Layout edge gutters */
    gutter: {
      desktop: "48px",
      tablet: "40px",
      mobile: "24px",
    },

    /** Card internal padding */
    card: {
      desktop: "32px",
      tablet: "28px",
      mobile: "24px",
    },

    /** Workflow shell padding */
    workflow: {
      desktop: "48px",
      tablet: "32px",
      mobile: "24px",
    },

    /** Hero vertical padding */
    hero: {
      desktop: "160px",
      tablet: "120px",
      mobile: "80px",
    },

    /** Stack gap between page header and main content */
    headerToMain: {
      desktop: "48px",
      tablet: "40px",
      mobile: "32px",
    },
  },

  // ─── Breakpoint reference ──────────────────────────────────────────────────
  //
  // Use with responsive tokens above.

  breakpoint: {
    mobile: "640px",
    tablet: "768px",
    desktop: "1024px",
    wide: "1280px",
  },
} as const;

export type Spacing = typeof spacing;
