export type NormalizedValue =
  | { type: "money"; amountCents: number; currency: "EUR" }
  | { type: "date"; date: string }
  | { type: "text"; text: string }
  | { type: "number"; value: number }
  | { type: "boolean"; value: boolean }
  | { type: "enum"; enumKey: string };

export function moneyFromEuros(euros: number): NormalizedValue {
  return { type: "money", amountCents: Math.round(euros * 100), currency: "EUR" };
}

export function textValue(text: string): NormalizedValue {
  return { type: "text", text };
}

export function enumValue(enumKey: string): NormalizedValue {
  return { type: "enum", enumKey };
}

export function formatMoney(value: NormalizedValue): string {
  if (value.type !== "money") return "—";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: value.currency,
  }).format(value.amountCents / 100);
}

export function parseEurosFromText(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, "").replace(/€/g, "").replace(",", ".");
  const match = cleaned.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const n = Number.parseFloat(match[0]);
  return Number.isFinite(n) ? n : null;
}

export function moneyFromInput(input: string): NormalizedValue | null {
  const euros = parseEurosFromText(input);
  if (euros === null) return null;
  return moneyFromEuros(euros);
}

export function sumMoneyValues(values: NormalizedValue[]): NormalizedValue | null {
  const moneyValues = values.filter((v): v is Extract<NormalizedValue, { type: "money" }> => v.type === "money");
  if (moneyValues.length === 0) return null;
  const currency = moneyValues[0].currency;
  const amountCents = moneyValues.reduce((sum, v) => sum + v.amountCents, 0);
  return { type: "money", amountCents, currency };
}

export function valuesEqual(a: NormalizedValue, b: NormalizedValue): boolean {
  if (a.type !== b.type) return false;
  switch (a.type) {
    case "money":
      return b.type === "money" && a.amountCents === b.amountCents;
    case "text":
      return b.type === "text" && a.text === b.text;
    case "enum":
      return b.type === "enum" && a.enumKey === b.enumKey;
    case "number":
      return b.type === "number" && a.value === b.value;
    case "date":
      return b.type === "date" && a.date === b.date;
    case "boolean":
      return b.type === "boolean" && a.value === b.value;
    default:
      return false;
  }
}
