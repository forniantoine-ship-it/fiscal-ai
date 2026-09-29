import { colors } from "./colors";

const moon = colors.brand.moonstone;
const moonLight = colors.background.appDiffusionLeft;
const moonDark = colors.background.appDiffusionRight;
const blue = colors.brand.lightBlue;
const blueLight = colors.surface.secondary;

/** CSS-ready gradients. Atmospheric gradients stay within one color family. */
export const gradients = {
  landing: {
    hero: `linear-gradient(112deg, ${moonLight} 0%, ${moon} 54%, ${moonDark} 100%)`,
    atmosphere: `linear-gradient(180deg, ${moonLight} 0%, transparent 24%, transparent 76%, ${moonDark} 100%)`,
    glowRight: `radial-gradient(ellipse 70% 80% at 100% 50%, ${moonLight} 0%, transparent 72%)`,
    glowLeft: `radial-gradient(ellipse 70% 80% at 0% 50%, ${moonLight} 0%, transparent 72%)`,
    sunsetRight: `linear-gradient(270deg, ${moonLight} 0%, transparent 60%)`,
  },
  app: {
    background: `linear-gradient(112deg, ${moonLight} 0%, ${moon} 55%, ${moonDark} 100%)`,
    atmosphere: `linear-gradient(180deg, ${moonLight} 0%, transparent 24%, transparent 76%, ${moonDark} 100%)`,
    glowLeft: `linear-gradient(90deg, ${moonLight} 0%, transparent 34%)`,
    glowRight: `linear-gradient(270deg, ${moonDark} 0%, transparent 34%)`,
    sunsetRight: `linear-gradient(270deg, ${moonLight} 0%, transparent 28%)`,
    centerVault: "none",
    centerLight: "none",
    diffusionLeft: `linear-gradient(90deg, ${moonLight} 0%, transparent 34%)`,
    diffusionRight: `linear-gradient(270deg, ${moonDark} 0%, transparent 34%)`,
  },
  dashboard: {
    background: `linear-gradient(112deg, ${moonLight} 0%, ${moon} 55%, ${moonDark} 100%)`,
    atmosphere: `linear-gradient(180deg, ${moonLight} 0%, transparent 22%, transparent 78%, ${moonDark} 100%)`,
    glowLeft: `linear-gradient(90deg, ${moonLight} 0%, transparent 25%)`,
    glowRight: `linear-gradient(270deg, ${moonDark} 0%, transparent 25%)`,
    edgeDepth: "none",
    centerVault: "none",
  },
  button: {
    primary: `linear-gradient(180deg, ${colors.brand.saffron}, ${colors.brand.saffron})`,
    primaryHover: `linear-gradient(180deg, ${colors.hover.primaryBackground}, ${colors.hover.primaryBackground})`,
    primaryPressed: `linear-gradient(180deg, ${colors.hover.primaryBackgroundPressed}, ${colors.hover.primaryBackgroundPressed})`,
    secondary: `linear-gradient(180deg, ${blueLight}, ${blue})`,
    secondaryHover: `linear-gradient(180deg, ${blue}, ${colors.surface.interactive})`,
    ghost: `linear-gradient(180deg, transparent, ${blueLight})`,
    ghostHover: `linear-gradient(180deg, ${blueLight}, ${blue})`,
  },
  card: {
    elevated: `linear-gradient(180deg, ${blueLight} 0%, ${blue} 100%)`,
    highlight: `linear-gradient(180deg, ${blueLight} 0%, ${blue} 100%)`,
    interactive: `linear-gradient(165deg, ${blueLight} 0%, ${blue} 100%)`,
    interactiveHover: `linear-gradient(165deg, ${blue} 0%, ${colors.surface.tertiary} 100%)`,
    inset: `linear-gradient(180deg, ${colors.surface.inset} 0%, ${blueLight} 100%)`,
  },
  workflow: {
    analyzing: `linear-gradient(90deg, ${blue} 0%, ${blueLight} 35%, ${blue} 50%, ${blueLight} 65%, ${blue} 100%)`,
    success: `linear-gradient(90deg, ${colors.success.light}, ${colors.success.surface}, ${colors.success.light})`,
    warning: `linear-gradient(90deg, ${colors.warning.light}, ${colors.warning.surface}, ${colors.warning.light})`,
  },
} as const;

export type Gradients = typeof gradients;
