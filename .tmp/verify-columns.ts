import { parseSpatialAmortizationPdf } from "../src/lib/lmnp/parsers/spatial-amortization-node";

const pdf =
  "/Users/forniantoine/Desktop/JEDECLAREMONMEUBLE/Déclaration appartement - Elsa BOUVARD/Tableau d'amortissement.pdf";

async function main() {
  const r = await parseSpatialAmortizationPdf(pdf);
  const rows = r.installments;
  console.log(
    "deferred",
    rows.slice(1, 4).map((x) => ({
      date: x.date,
      payment: x.payment,
      principal: x.principal,
      interest: x.interest,
      insurance: x.insurance,
    })),
  );
  const amort = rows.filter((x) => (x.principal ?? 0) > 0).slice(0, 3);
  console.log(
    "amort",
    amort.map((x) => ({
      date: x.date,
      payment: x.payment,
      principal: x.principal,
      interest: x.interest,
      insurance: x.insurance,
    })),
  );
}

main().catch(console.error);
