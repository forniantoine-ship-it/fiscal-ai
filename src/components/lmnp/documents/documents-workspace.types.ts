export const PERSISTED_TUNNEL_IDS = [
  "inpi",
  "logement",
  "credit",
  "amortissements",
  "revenus",
  "charges",
  "validation",
] as const;

export type PersistedTunnelId = (typeof PERSISTED_TUNNEL_IDS)[number];
