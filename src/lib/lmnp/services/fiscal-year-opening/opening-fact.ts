/**
 * Lot 1 — reprise comptable : distinction explicite AVAILABLE ≠ UNAVAILABLE.
 *
 * `available([])` / `available(0)` = absence confirmée.
 * `unavailable` = donnée inconnue — jamais normalisée en 0 / [] / false.
 */

export type OpeningFactAvailable<T> = {
  status: "available";
  value: T;
};

export type OpeningFactUnavailable = {
  status: "unavailable";
  /** Raison optionnelle — diagnostic, jamais une valeur de substitution. */
  reason?: string;
};

export type OpeningFact<T> = OpeningFactAvailable<T> | OpeningFactUnavailable;

export function available<T>(value: T): OpeningFactAvailable<T> {
  return { status: "available", value };
}

export function unavailable(reason?: string): OpeningFactUnavailable {
  return reason === undefined ? { status: "unavailable" } : { status: "unavailable", reason };
}

export function isAvailable<T>(fact: OpeningFact<T>): fact is OpeningFactAvailable<T> {
  return fact.status === "available";
}

export function isUnavailable<T>(fact: OpeningFact<T>): fact is OpeningFactUnavailable {
  return fact.status === "unavailable";
}
