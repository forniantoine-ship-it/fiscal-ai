export type ValidateActiviteDatesInput = {
  dateDebutActivite: string;
  dateMiseEnService: string;
  acteNotarieDate?: string;
};

export type ValidateActiviteDatesOutput = {
  valid: boolean;
  issues: string[];
};

function parseDate(value: string): Date | null {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function validateActiviteDates(
  input: ValidateActiviteDatesInput,
): ValidateActiviteDatesOutput {
  const issues: string[] = [];
  const debut = parseDate(input.dateDebutActivite);
  const miseEnService = parseDate(input.dateMiseEnService);

  if (!debut) {
    issues.push("La date de début d'activité n'est pas reconnue.");
  }
  if (!miseEnService) {
    issues.push("La date de mise en service n'est pas reconnue.");
  }
  if (debut && miseEnService && miseEnService < debut) {
    issues.push(
      "La mise en location ne peut pas précéder la date d'immatriculation de votre activité.",
    );
  }
  if (input.acteNotarieDate) {
    const acte = parseDate(input.acteNotarieDate);
    if (acte && miseEnService && miseEnService < acte) {
      issues.push(
        "La mise en location ne peut pas précéder la date de votre acte notarié.",
      );
    }
  }

  return { valid: issues.length === 0, issues };
}
