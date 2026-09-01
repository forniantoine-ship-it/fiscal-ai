import type { Property, RevenueRawLine } from "../types";

export function isRevenusMockEnabled(): boolean {
  return process.env.NEXT_PUBLIC_REVENUS_MOCK === "true";
}

function rawLine(partial: Omit<RevenueRawLine, "id"> & { id?: string }): RevenueRawLine {
  return { id: partial.id ?? crypto.randomUUID(), ...partial };
}

/** Dev-only mock lines — requires NEXT_PUBLIC_REVENUS_MOCK=true */
export function buildMockRawFinancialLines(
  property: Property | undefined,
  fiscalYear: number,
  primary = true,
  sourceDocumentId = "mock-document",
): RevenueRawLine[] {
  if (!primary) {
    return [2, 4, 6, 8, 10].map((month) =>
      rawLine({
        date: `${String(month).padStart(2, "0")}/05/${fiscalYear}`,
        label: "Virement loyer M. Martin",
        amount: 800,
        direction: "credit",
        counterparty: "M. Martin",
        accountContext: "Compte courant LMNP",
        sourceType: "bank_statement",
        sourceDocumentId,
        confidence: 90,
      }),
    );
  }

  const rentMonths = [1, 2, 3, 4, 5, 6, 7, 8, 9, 11];
  const chargeMonths = [1, 3, 5, 8, 11];
  const tenant = "M. Dupont";

  const lines: RevenueRawLine[] = [
    rawLine({
      date: `31/12/${fiscalYear}`,
      label: "Total encaissements locatifs",
      amount: 16500,
      direction: "credit",
      lineKind: "total",
      sourceType: "bank_statement",
      sourceDocumentId,
      confidence: 20,
    }),
    rawLine({
      date: `15/02/${fiscalYear}`,
      label: "Virement entrant",
      amount: 4500,
      direction: "credit",
      counterparty: "Compte épargne perso",
      accountContext: "Compte courant LMNP",
      sourceType: "bank_statement",
      sourceDocumentId,
      confidence: 52,
    }),
    rawLine({
      date: `01/06/${fiscalYear}`,
      label: "Dépôt de garantie encaissé",
      amount: 1500,
      direction: "credit",
      counterparty: tenant,
      accountContext: "Compte courant LMNP",
      sourceType: "attestation",
      sourceDocumentId,
      confidence: 95,
    }),
    rawLine({
      date: `15/07/${fiscalYear}`,
      label: "Versement Airbnb juillet",
      amount: 980,
      direction: "credit",
      counterparty: "Airbnb Payments",
      accountContext: "Compte courant LMNP",
      sourceType: "platform_export",
      sourceDocumentId,
      confidence: 79,
    }),
    rawLine({
      date: `15/07/${fiscalYear}`,
      label: "Commission plateforme",
      amount: 120,
      direction: "debit",
      counterparty: "Airbnb Payments",
      accountContext: "Compte courant LMNP",
      sourceType: "platform_export",
      sourceDocumentId,
      confidence: 81,
    }),
    rawLine({
      date: `10/03/${fiscalYear}`,
      label: "Aide CAF versée au locataire",
      amount: 120,
      direction: "credit",
      counterparty: "CAF",
      accountContext: "Compte courant LMNP",
      sourceType: "bank_statement",
      sourceDocumentId,
      confidence: 76,
    }),
    rawLine({
      date: `22/09/${fiscalYear}`,
      label: "Virement non identifié",
      amount: 200,
      direction: "credit",
      accountContext: "Compte courant LMNP",
      sourceType: "bank_statement",
      sourceDocumentId,
      confidence: 52,
    }),
  ];

  for (const month of rentMonths) {
    const date = `${String(month).padStart(2, "0")}/05/${fiscalYear}`;
    lines.push(
      rawLine({
        date,
        label: `Virement loyer ${tenant}`,
        amount: 1500,
        direction: "credit",
        counterparty: tenant,
        accountContext: "Compte courant LMNP",
        sourceType: "bank_statement",
        sourceDocumentId,
        confidence: 92,
      }),
    );

    if (month === 1) {
      lines.push(
        rawLine({
          date,
          label: "Quittance loyer janvier",
          amount: 1500,
          direction: "credit",
          counterparty: tenant,
          accountContext: "Quittance",
          sourceType: "rent_receipt",
          sourceDocumentId,
          confidence: 84,
        }),
      );
    }

    if (chargeMonths.includes(month)) {
      lines.push(
        rawLine({
          date,
          label: "Charges locatives",
          amount: 40,
          direction: "debit",
          counterparty: tenant,
          accountContext: "Quittance",
          sourceType: "rent_receipt",
          sourceDocumentId,
          confidence: 88,
        }),
      );
    }
  }

  if (property?.label?.toLowerCase().includes("airbnb")) {
    return lines.filter((item) => item.sourceType !== "rent_receipt");
  }

  return lines;
}

export function buildMockLinesByProperty(
  properties: Property[],
  fiscalYear: number,
): Map<string, RevenueRawLine[]> {
  const map = new Map<string, RevenueRawLine[]>();
  properties.forEach((property, index) => {
    map.set(
      property.id,
      buildMockRawFinancialLines(property, fiscalYear, index === 0, `mock-${property.id}`),
    );
  });
  return map;
}
