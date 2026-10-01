import { validateActiviteDates } from "./validate-activite-dates";

/** Date calendaire réelle au format AAAA-MM-JJ (ni 2025-02-30, ni format libre). */
export function isIsoCalendarDate(value?: string): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export type ValidateServiceDateInput = {
  date?: string;
  /** Aujourd'hui (AAAA-MM-JJ) : une disponibilité effective n'est jamais future. */
  today: string;
  /** Début d'activité connu : la mise en service ne peut pas le précéder (`validateActiviteDates`). */
  dateDebutActivite?: string;
};

export type ValidateServiceDateOutput =
  | { valid: true; date: string }
  | { valid: false; issue: "invalid" | "future" | "before_activity"; message: string };

/**
 * Règles de saisie de la date de mise en service (RAI-003), source unique pour F009 (legacy) et F010 (bien actif,
 * scopé) : date réelle, jamais future, jamais antérieure au début d'activité lorsqu'il est connu.
 */
export function validateServiceDate(input: ValidateServiceDateInput): ValidateServiceDateOutput {
  if (!isIsoCalendarDate(input.date)) {
    return { valid: false, issue: "invalid", message: "Indiquez la date à laquelle le logement était disponible à la location." };
  }
  const date = input.date!;
  if (date > input.today) {
    return {
      valid: false,
      issue: "future",
      message: "Cette date est dans le futur. Vous pourrez compléter la disponibilité effective plus tard ; aucune date prévisionnelle ne sera utilisée.",
    };
  }
  // Comparaison applicable seulement à un début d'activité réel ; sinon F009 le signale lui-même à sa confirmation.
  if (isIsoCalendarDate(input.dateDebutActivite)) {
    const dates = validateActiviteDates({ dateDebutActivite: input.dateDebutActivite!, dateMiseEnService: date });
    if (!dates.valid) return { valid: false, issue: "before_activity", message: dates.issues.join(" ") };
  }
  return { valid: true, date };
}
