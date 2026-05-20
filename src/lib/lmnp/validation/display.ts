import type { NormalizedValue } from "../types/values";
import { formatMoney } from "../types/values";

export function formatNormalizedValue(value: NormalizedValue): string {
  switch (value.type) {
    case "money":
      return formatMoney(value);
    case "text":
      return value.text;
    case "date":
      return new Date(value.date).toLocaleDateString("fr-FR");
    case "number":
      return String(value.value);
    case "boolean":
      return value.value ? "Oui" : "Non";
    case "enum":
      return value.enumKey;
    default:
      return "—";
  }
}

export const HIGH_CONFIDENCE_THRESHOLD = 95;

export function isPreValidated(confidence: number): boolean {
  return confidence >= HIGH_CONFIDENCE_THRESHOLD;
}
