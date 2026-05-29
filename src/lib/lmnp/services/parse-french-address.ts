export type ParsedFrenchAddress = {
  /** Street lines joined (logement / client street address). */
  address: string;
  postalCode?: string;
  city?: string;
  raw: string;
};

/**
 * Parses a French postal address (multiline or single-line) into components.
 * Example:
 *   "15 ROUTE de Saint-Germain\nAppartement 101\n29600 Saint-Martin-des-Champs"
 * → { address: "15 ROUTE de Saint-Germain Appartement 101", postalCode: "29600", city: "Saint-Martin-des-Champs" }
 */
export function parseFrenchAddress(raw: string): ParsedFrenchAddress {
  const trimmed = raw.trim();
  if (!trimmed) return { address: "", raw: trimmed };

  const lines = trimmed
    .split(/\n+/)
    .flatMap((line) => line.split(/,(?=\s*\d{5}\s)/))
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return { address: trimmed, raw: trimmed };

  let postalLineIndex = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/\b\d{5}\b/.test(lines[i]!)) {
      postalLineIndex = i;
      break;
    }
  }

  if (postalLineIndex === -1) {
    return { address: lines.join(" "), raw: trimmed };
  }

  const postalLine = lines[postalLineIndex]!;
  const streetLines = [...lines.slice(0, postalLineIndex)];

  const match = postalLine.match(/\b(\d{5})\b\s*(.*)/);
  const postalCode = match?.[1];
  const city = match?.[2]?.trim() || undefined;

  const beforePostal = postalLine.replace(/\b\d{5}\b[\s\S]*$/, "").trim();
  if (beforePostal) streetLines.push(beforePostal);

  const address = streetLines.join(" ").trim() || trimmed;

  return { address, postalCode, city, raw: trimmed };
}
