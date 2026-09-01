export type ExplainMiseEnServiceInput = {
  dateDebutActivite: string;
  dateMiseEnService: string;
};

export type ExplainMiseEnServiceOutput = {
  daysInService: number;
  totalDaysInYear: number;
  prorataPercent: number;
  explanation: string;
};

function daysInYear(year: number): number {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365;
}

function formatFrDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function explainMiseEnService(
  input: ExplainMiseEnServiceInput,
  fiscalYear: number,
): ExplainMiseEnServiceOutput {
  const yearStart = new Date(fiscalYear, 0, 1);
  const yearEnd = new Date(fiscalYear, 11, 31);
  const miseEnService = new Date(input.dateMiseEnService);

  const serviceStart = miseEnService > yearStart ? miseEnService : yearStart;
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysInService =
    serviceStart > yearEnd
      ? 0
      : Math.floor((yearEnd.getTime() - serviceStart.getTime()) / msPerDay) + 1;
  const totalDaysInYear = daysInYear(fiscalYear);
  const prorataPercent = Math.round((daysInService / totalDaysInYear) * 1000) / 10;

  const explanation =
    `Votre activité a démarré le ${formatFrDate(input.dateDebutActivite)}. ` +
    `Votre bien était disponible à la location le ${formatFrDate(input.dateMiseEnService)}. ` +
    `Sur l'exercice ${fiscalYear}, cela représente ${daysInService} jours, ` +
    `soit un prorata d'environ ${prorataPercent.toString().replace(".", ",")} % ` +
    `pour vos amortissements de première année.`;

  return {
    daysInService,
    totalDaysInYear,
    prorataPercent,
    explanation,
  };
}
