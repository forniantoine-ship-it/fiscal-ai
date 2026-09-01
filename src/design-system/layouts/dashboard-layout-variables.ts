import { type CSSProperties } from "react";

import { spacing } from "@/design-system/theme/spacing";

/** Gouttière horizontale du dashboard — unique source pour header, main et footer. */
export const DASHBOARD_GUTTER = `clamp(${spacing.gutter.mobile}, 4vw, ${spacing.gutter.desktop})`;

/** Hauteur de la ligne d'outils du header (avatar h-8 + padding vertical du bouton profil). */
const DASHBOARD_TOP_BAR_ROW_HEIGHT = spacing.scale[10];

/**
 * Expression CSS de la hauteur du header sticky.
 * Dérivée des tokens utilisés par DashboardTopBar + bordure du <header>.
 */
export function getDashboardHeaderHeightExpression(): string {
  return `calc(${spacing.scale[5]} + ${spacing.scale[5]} + ${DASHBOARD_TOP_BAR_ROW_HEIGHT} + ${spacing.scale.px})`;
}

/** Variables CSS posées sur le shell DashboardLayout — seule source de vérité layout. */
export function createDashboardLayoutCssVariables(): CSSProperties {
  const headerHeight = getDashboardHeaderHeightExpression();
  const mainOffsetTop = spacing.responsive.headerToMain.desktop;

  return {
    ["--dashboard-header-height" as string]: headerHeight,
    ["--dashboard-main-offset-top" as string]: mainOffsetTop,
    ["--dashboard-gutter" as string]: DASHBOARD_GUTTER,
    ["--chapter-scroll-height" as string]: "calc(100dvh - var(--dashboard-header-height))",
    ["--chapter-scroll-offset-top" as string]: `calc(-1 * ${mainOffsetTop})`,
    ["--chapter-scroll-offset-inline" as string]: `calc(-1 * (${DASHBOARD_GUTTER}))`,
    ["--chapter-panel-height" as string]: "var(--chapter-scroll-height)",
  };
}
