export type ParsedAddressComponents = {
  line?: string;
  postalCode?: string;
  city?: string;
  country?: string;
};

function splitCityAndCountry(cityPart: string): { city?: string; country?: string } {
  const text = cityPart.replace(/^,\s*/, "").trim();
  if (!text) return {};

  if (/\s*-\s*FRANCE\s*$/i.test(text)) {
    const city = text.replace(/\s*-\s*FRANCE\s*$/i, "").trim();
    return {
      ...(city ? { city } : {}),
      country: "FRANCE",
    };
  }

  if (/\s+FRANCE$/i.test(text)) {
    const city = text.replace(/\s+FRANCE$/i, "").trim();
    return {
      ...(city ? { city } : {}),
      country: "FRANCE",
    };
  }

  return { city: text };
}

/**
 * Deterministic French address parsing for derivation only.
 * Never invents a postal code or city when they are absent from the source text.
 */
export function parseAddressComponents(raw: string): ParsedAddressComponents {
  const trimmed = raw.trim();
  if (!trimmed) return {};

  const lines = trimmed
    .split(/\n+/)
    .flatMap((line) => line.split(/,(?=\s*\d{5}\s)/))
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return {};

  let postalLineIndex = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/\b\d{5}\b/.test(lines[i]!)) {
      postalLineIndex = i;
      break;
    }
  }

  if (postalLineIndex === -1) {
    const line = lines.join(" ").trim();
    return line ? { line } : {};
  }

  const postalLine = lines[postalLineIndex]!;
  const streetLines = [...lines.slice(0, postalLineIndex)];

  const match = postalLine.match(/\b(\d{5})\b\s*(.*)/);
  const postalCode = match?.[1];
  const cityPart = match?.[2]?.trim() ?? "";
  const { city, country } = cityPart ? splitCityAndCountry(cityPart) : {};

  const beforePostal = postalLine.replace(/\b\d{5}\b[\s\S]*$/, "").trim();
  if (beforePostal) streetLines.push(beforePostal);

  const line = streetLines.join(" ").trim();

  return {
    ...(line ? { line } : {}),
    ...(postalCode ? { postalCode } : {}),
    ...(city ? { city } : {}),
    ...(country ? { country } : {}),
  };
}
