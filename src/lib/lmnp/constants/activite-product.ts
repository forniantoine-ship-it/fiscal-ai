/** Product scope for the Activité tunnel — LMNP réel simplifié only. */
export const LMNP_PRODUCT_MODE = "LMNP_REEL_SIMPLIFIE" as const;

export type LmnpProductMode = typeof LMNP_PRODUCT_MODE;

export const ACTIVITE_REGIME_LABEL = "Régime appliqué : LMNP réel simplifié";

/** Stored on fiscal year / draft when confirming Activité. */
export const ACTIVITE_FISCAL_REGIME = "reel-simplifie" as const;

export const ACTIVITE_ACTIVITY_TYPE = "LMNP" as const;
