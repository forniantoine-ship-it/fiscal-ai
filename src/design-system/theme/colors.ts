/** The four approved brand pigments. All non-semantic UI tones derive from these. */
export const brand = {
  lightBlue: "#C3E7F1",
  moonstone: "#519CAB",
  saffron: "#FFC64F",
  gunmetal: "#20373B",
  white: "#FFFFFF",
} as const;

function mix(first: string, second: string, amount: number): string {
  const channel = (index: number) => Math.round(
    Number.parseInt(first.slice(index, index + 2), 16) * (1 - amount) +
    Number.parseInt(second.slice(index, index + 2), 16) * amount,
  ).toString(16).padStart(2, "0");
  return `#${channel(1)}${channel(3)}${channel(5)}`.toUpperCase();
}

const blue = brand.lightBlue;
const moon = brand.moonstone;
const yellow = brand.saffron;
const ink = brand.gunmetal;
const white = brand.white;
const readableInk = mix(ink, "#000000", 0.18);

/** Semantic color system. Legacy key names are retained for existing consumers. */
export const colors = {
  brand,
  background: {
    cream: moon,
    creamWarm: moon,
    creamSoft: moon,
    landingLeft: moon,
    landingGradientStart: moon,
    landingGradientMid: moon,
    landingGradientEnd: moon,
    landingGlow: mix(moon, white, 0.12),
    landingGlowSoft: mix(moon, white, 0.06),
    app: moon,
    appDiffusionLeft: mix(moon, white, 0.08),
    appDiffusionRight: mix(moon, ink, 0.08),
    appDiffusionCenter: moon,
  },
  surface: {
    primary: blue,
    secondary: mix(blue, white, 0.38),
    tertiary: mix(blue, white, 0.18),
    elevated: white,
    inset: white,
    interactive: mix(blue, white, 0.2),
    selected: blue,
    disabled: mix(blue, white, 0.55),
  },
  border: {
    subtle: mix(blue, ink, 0.12),
    default: mix(blue, ink, 0.2),
    strong: mix(blue, ink, 0.34),
    focus: yellow,
    selected: mix(blue, ink, 0.3),
    disabled: mix(blue, white, 0.35),
  },
  text: {
    primary: ink,
    secondary: readableInk,
    tertiary: readableInk,
    muted: readableInk,
    disabled: mix(ink, moon, 0.52),
    inverse: ink,
    onDark: white,
    /** Accessible small text directly on Moonstone (derived Gunmetal shade). */
    onMoonstone: readableInk,
    accent: ink,
    accentHover: ink,
  },
  /** Compatibility scale: 50–300 are quiet content tones, 400–900 are action tones. */
  orange: {
    50: mix(blue, white, 0.55),
    100: mix(blue, white, 0.28),
    200: blue,
    300: mix(blue, moon, 0.2),
    400: mix(yellow, white, 0.15),
    500: yellow,
    600: mix(yellow, ink, 0.12),
    700: mix(yellow, ink, 0.2),
    800: mix(yellow, ink, 0.3),
    900: mix(yellow, ink, 0.4),
  },
  success: {
    DEFAULT: "#336D49",
    light: "#E5F2E9",
    muted: "#528563",
    border: "#A7C9AF",
    surface: "#EFF7F1",
  },
  warning: {
    DEFAULT: "#86590A",
    light: "#FFF3D5",
    muted: "#966D23",
    border: "#D7B879",
    surface: "#FFF8E9",
  },
  error: {
    DEFAULT: "#A6433D",
    light: "#FBECEB",
    muted: "#BA6862",
    border: "#E1ABA7",
    surface: "#FFF5F4",
  },
  workflow: {
    active: yellow,
    activeBackground: blue,
    activeBorder: mix(blue, ink, 0.22),
    completed: "#336D49",
    completedBackground: "#E5F2E9",
    completedBorder: "#A7C9AF",
    upcoming: mix(ink, moon, 0.38),
    upcomingBackground: mix(blue, white, 0.38),
    upcomingBorder: mix(blue, ink, 0.2),
    inProgress: yellow,
    inProgressBackground: blue,
    inProgressBorder: mix(blue, moon, 0.2),
    blocked: "#A6433D",
    blockedBackground: "#FBECEB",
    blockedBorder: "#E1ABA7",
    skipped: mix(ink, moon, 0.52),
    skippedBackground: mix(blue, white, 0.55),
    skippedBorder: mix(blue, white, 0.35),
  },
  upload: {
    idleBackground: white,
    idleBorder: mix(blue, ink, 0.2),
    idleIcon: mix(ink, moon, 0.38),
    dragOverBackground: blue,
    dragOverBorder: yellow,
    dragOverIcon: ink,
    uploadingBackground: blue,
    uploadingBorder: mix(blue, moon, 0.2),
    uploadingProgress: yellow,
    uploadingIcon: ink,
    successBackground: "#E5F2E9",
    successBorder: "#A7C9AF",
    successIcon: "#336D49",
    errorBackground: "#FBECEB",
    errorBorder: "#E1ABA7",
    errorIcon: "#A6433D",
  },
  hover: {
    primaryBackground: mix(yellow, ink, 0.12),
    primaryBackgroundPressed: mix(yellow, ink, 0.2),
    secondaryBackground: mix(blue, white, 0.38),
    secondaryBorder: mix(blue, ink, 0.34),
    ghostBackground: mix(blue, white, 0.55),
    surfaceBackground: mix(blue, white, 0.2),
    border: mix(blue, ink, 0.34),
    link: ink,
    iconBackground: mix(blue, white, 0.18),
    iconForeground: ink,
  },
  focus: { ring: yellow, ringOffset: ink },
  overlay: { scrim: ink, scrimLight: mix(ink, moon, 0.2) },
} as const;

export type Colors = typeof colors;
