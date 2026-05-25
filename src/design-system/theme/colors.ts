/**
 * Fiscal AI — Official Color System
 *
 * Warm premium minimalism. Apple × Linear × modern French fintech.
 * Ultra-soft contrasts, no aggressive SaaS blue, light mode only.
 */
export const colors = {
  // ─── Backgrounds ───────────────────────────────────────────────────────────

  background: {
    /** Shared warm cream base */
    cream: "#FAF8F5",
    creamWarm: "#FBF8F3",
    creamSoft: "#F7F4EF",

    /** Public landing — left cream panel */
    landingLeft: "#FBF8F3",

    /** Public landing — right orange gradient stops */
    landingGradientStart: "#FFF3E8",
    landingGradientMid: "#FFD9B8",
    landingGradientEnd: "#F0A66B",

    /** Public landing — warm glow accents */
    landingGlow: "#FFE8D0",
    landingGlowSoft: "#FFF5EB",

    /** Private app — centered cream canvas */
    app: "#FAF8F5",

    /** Private app — subtle orange diffusion on side edges */
    appDiffusionLeft: "#F5DCC4",
    appDiffusionRight: "#FFD4B0",
    appDiffusionCenter: "#FBF8F3",
  },

  // ─── Surfaces ──────────────────────────────────────────────────────────────

  surface: {
    /** Pure white cards on cream */
    primary: "#FFFFFF",
    /** Ultra-soft beige — default UI panels */
    secondary: "#F5F2EC",
    /** Slightly deeper beige — nested sections */
    tertiary: "#EFEBE4",
    /** Elevated cards, modals, dropdowns */
    elevated: "#FFFFFF",
    /** Inset wells, input backgrounds */
    inset: "#F3F0EA",
    /** Hover-ready surface base */
    interactive: "#F8F5F0",
    /** Selected / active row background */
    selected: "#FFF6EE",
    /** Disabled surface */
    disabled: "#F2EFE9",
  },

  // ─── Borders ───────────────────────────────────────────────────────────────

  border: {
    /** Barely visible dividers */
    subtle: "#F0EBE3",
    /** Default card and input borders */
    default: "#E8E2D9",
    /** Stronger separation — tables, sections */
    strong: "#DAD3C8",
    /** Focus rings and active outlines */
    focus: "#F0C4A0",
    /** Selected item border */
    selected: "#F5D4B8",
    /** Disabled borders */
    disabled: "#EDE8E1",
  },

  // ─── Text hierarchy ────────────────────────────────────────────────────────

  text: {
    /** Headlines, primary labels */
    primary: "#1C1917",
    /** Body copy, descriptions */
    secondary: "#5C5650",
    /** Captions, metadata, placeholders */
    tertiary: "#8A837A",
    /** De-emphasized, timestamps */
    muted: "#ABA49B",
    /** Disabled form labels */
    disabled: "#C9C3BA",
    /** Text on orange primary buttons */
    inverse: "#FFFAF6",
    /** Brand accent links and highlights */
    accent: "#C4621A",
    /** Accent hover state */
    accentHover: "#A85214",
  },

  // ─── Orange primary scale ──────────────────────────────────────────────────

  orange: {
    50: "#FFF8F3",
    100: "#FFEFE3",
    200: "#FFDCC4",
    300: "#FFC49A",
    400: "#F5A06A",
    500: "#E87D3A",
    600: "#D66B28",
    700: "#B8571E",
    800: "#944518",
    900: "#733512",
  },

  // ─── Semantic — muted, never loud ─────────────────────────────────────────

  success: {
    DEFAULT: "#5E8A66",
    light: "#EEF5F0",
    muted: "#8BA892",
    border: "#C5D9C9",
    surface: "#F4F9F5",
  },

  warning: {
    DEFAULT: "#A8834A",
    light: "#F7F0E6",
    muted: "#C4A070",
    border: "#E0CEB0",
    surface: "#FBF7F0",
  },

  error: {
    DEFAULT: "#B66B63",
    light: "#FAF0EF",
    muted: "#C98E88",
    border: "#E5C8C4",
    surface: "#FDF5F4",
  },

  // ─── Workflow states ───────────────────────────────────────────────────────

  workflow: {
    /** Current active step */
    active: "#E87D3A",
    activeBackground: "#FFF8F3",
    activeBorder: "#FFDCC4",

    /** Completed step */
    completed: "#5E8A66",
    completedBackground: "#EEF5F0",
    completedBorder: "#C5D9C9",

    /** Upcoming / not yet reached */
    upcoming: "#ABA49B",
    upcomingBackground: "#F5F2EC",
    upcomingBorder: "#E8E2D9",

    /** In progress — processing */
    inProgress: "#D66B28",
    inProgressBackground: "#FFEFE3",
    inProgressBorder: "#FFC49A",

    /** Blocked or requires attention */
    blocked: "#B66B63",
    blockedBackground: "#FAF0EF",
    blockedBorder: "#E5C8C4",

    /** Skipped or optional */
    skipped: "#C9C3BA",
    skippedBackground: "#F2EFE9",
    skippedBorder: "#EDE8E1",
  },

  // ─── Upload states ─────────────────────────────────────────────────────────

  upload: {
    /** Default drop zone — idle */
    idleBackground: "#FFFFFF",
    idleBorder: "#E8E2D9",
    idleIcon: "#ABA49B",

    /** File dragged over zone */
    dragOverBackground: "#FFF8F3",
    dragOverBorder: "#FFC49A",
    dragOverIcon: "#E87D3A",

    /** Upload in progress */
    uploadingBackground: "#FFEFE3",
    uploadingBorder: "#F5A06A",
    uploadingProgress: "#E87D3A",
    uploadingIcon: "#D66B28",

    /** Upload succeeded */
    successBackground: "#EEF5F0",
    successBorder: "#C5D9C9",
    successIcon: "#5E8A66",

    /** Upload failed */
    errorBackground: "#FAF0EF",
    errorBorder: "#E5C8C4",
    errorIcon: "#B66B63",
  },

  // ─── Hover states ──────────────────────────────────────────────────────────

  hover: {
    /** Primary CTA button */
    primaryBackground: "#D66B28",
    primaryBackgroundPressed: "#B8571E",

    /** Secondary / outline button */
    secondaryBackground: "#F5F2EC",
    secondaryBorder: "#DAD3C8",

    /** Ghost / text button */
    ghostBackground: "#FFF8F3",

    /** Card and list row */
    surfaceBackground: "#F8F5F0",

    /** Interactive border emphasis */
    border: "#DAD3C8",

    /** Link text */
    link: "#A85214",

    /** Icon button */
    iconBackground: "#EFEBE4",
    iconForeground: "#5C5650",
  },

  // ─── Focus & overlay ───────────────────────────────────────────────────────

  focus: {
    ring: "#F0C4A0",
    ringOffset: "#FAF8F5",
  },

  overlay: {
    scrim: "#1C1917",
    scrimLight: "#5C5650",
  },
} as const;

export type Colors = typeof colors;
