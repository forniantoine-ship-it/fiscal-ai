/**
 * F011-R1 — validation documentaire scopée à l'exercice : `resolveDocumentaryEcheances` certifie « ce tableau permet de
 * sécuriser l'exercice N », pas « toute la durée du prêt est parfaite ». Les lignes postérieures au 31/12/N n'alimentent
 * aucun calcul ni contrôle de N ; une anomalie DANS N (ou dans la fenêtre d'ancrage qui y mène) reste bloquante, sans
 * aucune tolérance monétaire. Aucune donnée source n'est normalisée : le tableau est la preuve brute.
 *
 * Données 100 % synthétiques (aucune donnée personnelle), qui reproduisent les propriétés déterminantes d'un tableau
 * bancaire réel : ligne intercalaire, trou ancien, tableau long, arrondi négatif imprimé sur la dernière ligne.
 *
 * Run: npx tsx --test src/lib/lmnp/services/f011/f011-r1-exercise-scoped-schedule.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { resolveDocumentaryEcheances, type DocumentaryInstallment } from "@/runtime/capabilities/f011/resolve-documentary-echeances";
import { resolveCreditFinancingLoanEcheances } from "./f011-documentary-installments";
import { excludedLoanIdsFromFinancing } from "./credit-financing-to-financement-charges";
import { validateFiscalInputs } from "@/runtime/capabilities/f006/validate-fiscal-inputs";
import type { CreditFinancingData } from "@/lib/lmnp/types";

const EX = 2025;
const MONTHLY_PRINCIPAL = 500;
const MONTHLY_INTEREST = 100;
const MONTHLY_INSURANCE = 10;

type Row = DocumentaryInstallment & { totalPayment: number; fees: number; comment?: string };

const pad = (n: number) => String(n).padStart(2, "0");
const ym = (year: number, month: number) => `${year}-${pad(month)}`;

/** Mois [de, à] inclus, au format AAAA-MM. */
function monthsBetween(fromYear: number, fromMonth: number, toYear: number, toMonth: number): string[] {
  const out: string[] = [];
  for (let index = fromYear * 12 + fromMonth - 1; index <= toYear * 12 + toMonth - 1; index += 1) {
    out.push(ym(Math.floor(index / 12), (index % 12) + 1));
  }
  return out;
}

/**
 * Tableau synthétique complet : une ligne intercalaire 2024-06-24 (assurance seule, aucun capital), PUIS août 2024 →
 * octobre 2050 (315 mensualités, juillet 2024 ABSENT), dont la dernière porte un arrondi d'intérêts NÉGATIF imprimé.
 */
function realShapedTable(): Row[] {
  const months = monthsBetween(2024, 8, 2050, 10);
  const capital = MONTHLY_PRINCIPAL * months.length;
  const interim: Row = {
    date: "2024-06-24", principal: 0, interest: 0, insurance: 2362.92, fees: 0, totalPayment: 2362.92,
    remainingCapital: capital, comment: "Différé / intercalaire",
  };
  const regular = months.map((month, index): Row => {
    const isLast = index === months.length - 1;
    const interest = isLast ? -0.28 : MONTHLY_INTEREST;
    return {
      date: `${month}-05`, principal: MONTHLY_PRINCIPAL, interest, insurance: MONTHLY_INSURANCE, fees: 0,
      totalPayment: MONTHLY_PRINCIPAL + interest + MONTHLY_INSURANCE,
      remainingCapital: capital - MONTHLY_PRINCIPAL * (index + 1),
    };
  });
  return [interim, ...regular];
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const without = (rows: Row[], month: string) => rows.filter((row) => !row.date.startsWith(month));
const patch = (rows: Row[], month: string, change: Partial<Row>) =>
  rows.map((row) => (row.date.startsWith(month) ? { ...row, ...change } : row));

function resolve(rows: Row[], extra: { capitalInitialIndependant?: number; assuranceExterneDeclaree?: boolean } = {}) {
  return resolveDocumentaryEcheances({ rows, exerciceFiscal: EX, ...extra });
}

function assertBlocked(rows: Row[], label: string, extra: Parameters<typeof resolve>[1] = {}) {
  const res = resolve(rows, extra);
  assert.equal(res.status, "non_exploitable", `${label} : doit rester bloquant (${JSON.stringify(res).slice(0, 120)})`);
}

describe("F011-R1 — oracle du cas réel (synthétique) : exploitable pour 2025 sans toucher une ligne", () => {
  it("juin 2024 intercalaire, juillet absent, août→déc 2024 continus, 2025 complet, ligne 2050 à −0,28 → exploitable", () => {
    const rows = realShapedTable();
    const before = clone(rows);
    assert.equal(rows.length, 316);
    const res = resolve(rows);
    assert.equal(res.status, "exploitable");
    if (res.status !== "exploitable") return;

    // La donnée source est intacte : rien normalisé, rien inventé, rien supprimé.
    assert.deepEqual(rows, before, "aucune ligne source modifiée");
    assert.equal(rows.at(-1)!.interest, -0.28, "le −0,28 existe toujours");
    assert.equal(rows.some((row) => row.date.startsWith("2024-07")), false, "juillet 2024 n'est pas fabriqué");
    assert.equal(rows[0]!.comment, "Différé / intercalaire", "la ligne intercalaire n'est pas reclassifiée");

    // Seules les lignes ≤ 31/12/2025 sont retournées (contrat existant) : rien de postérieur ne sert à 2025.
    assert.equal(res.echeances.every((row) => row.date <= "2025-12-31"), true);
    assert.equal(res.echeances.at(-1)!.date, "2025-12-05");
    assert.equal(res.echeances.some((row) => row.date.startsWith("2050")), false);
    const in2025 = res.echeances.filter((row) => row.date.startsWith("2025"));
    assert.equal(in2025.length, 12);
    assert.equal(in2025.reduce((total, row) => total + row.interets, 0), 12 * MONTHLY_INTEREST);
    // CRD imprimé au 31/12/2025, jamais recalculé ni pris sur une ligne 2026+.
    assert.equal(in2025.at(-1)!.capitalRestantDu, rows.find((row) => row.date.startsWith("2025-12"))!.remainingCapital);
  });

  it("mêmes lignes, exercice 2026 : le −0,28 de 2050 ne sert toujours à rien", () => {
    assert.equal(resolveDocumentaryEcheances({ rows: realShapedTable(), exerciceFiscal: 2026 }).status, "exploitable");
  });
});

describe("F011-R1 — anomalie APRÈS l'exercice : ne bloque pas N", () => {
  it("TEST 1 — intérêts négatifs en 2050 → exploitable pour 2025", () => {
    assert.equal(resolve(realShapedTable()).status, "exploitable");
  });

  it("principal / assurance / CRD négatifs après N (2050) → toujours exploitable pour 2025", () => {
    for (const change of [{ principal: -1 }, { insurance: -1 }, { remainingCapital: -1 }] as Partial<Row>[]) {
      assert.equal(resolve(patch(realShapedTable(), "2050-10", change)).status, "exploitable", JSON.stringify(change));
    }
  });

  it("trou ou doublon APRÈS N (ex. 2030) → n'est pas nécessaire à 2025", () => {
    assert.equal(resolve(without(realShapedTable(), "2030-03")).status, "exploitable");
    const table = realShapedTable();
    assert.equal(resolve([...table, { ...table.find((row) => row.date.startsWith("2030-03"))! }]).status, "exploitable");
  });

  it("une date illisible reste bloquante même si la ligne pourrait être « après N » (jamais devinée)", () => {
    assertBlocked([...realShapedTable(), { date: "n/a", principal: 1, interest: 1, insurance: 0, totalPayment: 2, fees: 0 }], "date illisible");
  });
});

describe("F011-R1 — anomalie DANS l'exercice : reste bloquante, sans tolérance", () => {
  it("TEST 2 — intérêts négatifs en 2025 → non exploitable", () => {
    assertBlocked(patch(realShapedTable(), "2025-06", { interest: -0.28 }), "intérêts négatifs 2025");
  });

  it("principal / assurance / CRD négatifs en 2025 → non exploitable", () => {
    for (const change of [{ principal: -0.01 }, { insurance: -0.01 }, { remainingCapital: -0.01 }] as Partial<Row>[]) {
      assertBlocked(patch(realShapedTable(), "2025-06", change), JSON.stringify(change));
    }
  });

  it("montant non fini en 2025 → non exploitable", () => {
    assertBlocked(patch(realShapedTable(), "2025-06", { interest: Number.NaN }), "NaN");
  });

  it("TEST 5 — mois manquant dans N → non exploitable", () => {
    assertBlocked(without(realShapedTable(), "2025-03"), "mois manquant 2025");
  });

  it("TEST 6 — doublon dans N → non exploitable", () => {
    const table = realShapedTable();
    assertBlocked([...table, { ...table.find((row) => row.date.startsWith("2025-03"))!, date: "2025-03-20" }], "doublon 2025");
  });

  it("décembre N manquant alors que le tableau continue après N → non exploitable (jamais d'ancre décalée)", () => {
    assertBlocked(without(realShapedTable(), "2025-12"), "décembre 2025 absent");
  });

  it("TEST 7 — CRD au 31/12/N absent → non exploitable (jamais pris sur une ligne 2026+)", () => {
    assertBlocked(patch(realShapedTable(), "2025-12", { remainingCapital: undefined }), "CRD 31/12/2025 absent");
  });

  it("TEST 8 — tableau interrompu dans N avec CRD non nul → non exploitable", () => {
    assertBlocked(realShapedTable().filter((row) => row.date < "2025-07"), "tableau interrompu en 2025");
  });

  it("tableau ne couvrant pas N (arrêté avant, CRD non nul) → non exploitable", () => {
    assertBlocked(realShapedTable().filter((row) => row.date < "2025-01"), "tableau arrêté en 2024");
  });

  it("tableau uniquement postérieur à N → non exploitable", () => {
    assertBlocked(realShapedTable().filter((row) => row.date >= "2026-01"), "aucune ligne ≤ 31/12/2025");
  });
});

describe("F011-R1 — ancre d'entrée dans N (décembre N−1) et anciens trous", () => {
  it("TEST 3 — trou ancien (juillet 2024), août→déc 2024 continus → exploitable (déjà couvert par l'oracle)", () => {
    assert.equal(realShapedTable().some((row) => row.date.startsWith("2024-07")), false);
    assert.equal(resolve(realShapedTable()).status, "exploitable");
  });

  it("trou ancien encore plus profond (2024-08 → 2024-10 absents, nov→déc continus) → exploitable : hors ancre", () => {
    let table = realShapedTable();
    for (const month of ["2024-08", "2024-09", "2024-10"]) table = without(table, month);
    assert.equal(resolve(table).status, "exploitable");
  });

  it("TEST 4 — décembre 2024 manquant puis janvier→décembre 2025 → non exploitable (ancre d'entrée cassée)", () => {
    assertBlocked(without(realShapedTable(), "2024-12"), "décembre N−1 absent");
  });

  it("novembre ET décembre 2024 absents → non exploitable (l'entrée dans N n'est pas démontrée)", () => {
    assertBlocked(without(without(realShapedTable(), "2024-12"), "2024-11"), "N−1 lacunaire à l'entrée de N");
  });

  it("doublon sur la ligne d'ancre (décembre N−1) → non exploitable (ancre ambiguë)", () => {
    const table = realShapedTable();
    assertBlocked([...table, { ...table.find((row) => row.date.startsWith("2024-12"))!, date: "2024-12-20" }], "doublon décembre N−1");
  });

  it("montant négatif AVANT N reste bloquant (ligne validée jusqu'au 31/12/N, décision conservatrice)", () => {
    assertBlocked(patch(realShapedTable(), "2024-10", { interest: -1 }), "négatif 2024");
  });
});

describe("F011-R1 — tableau démarrant dans N / soldé : protections inchangées", () => {
  const startsInN = (rank?: number): Row[] => {
    const rows = realShapedTable().filter((row) => row.date >= "2025-04");
    return rank === undefined ? rows : rows.map((row, index) => (index === 0 ? { ...row, rank } : row));
  };

  it("TEST 9 — début en cours d'exercice sans rang n°1 imprimé → non exploitable", () => {
    assertBlocked(startsInN(), "partiel sans rang");
  });

  it("rang n°1 mais capital d'origine non prouvé par un document distinct → non exploitable", () => {
    assertBlocked(startsInN(1), "partiel sans capital d'offre");
  });

  it("rang n°1 + capital d'offre distinct cohérent → exploitable (comportement R1.x inchangé)", () => {
    const rows = startsInN(1);
    const first = rows[0]!;
    const capital = first.remainingCapital! + first.principal;
    assert.equal(resolve(rows, { capitalInitialIndependant: capital }).status, "exploitable");
  });

  it("rang n°1 mais capital d'offre contredit → non exploitable", () => {
    const rows = startsInN(1);
    assertBlocked(rows, "capital contredit", { capitalInitialIndependant: 1234 });
  });

  it("prêt soldé avant N (dernier CRD imprimé = 0) : exploitable seulement si le tableau est continu", () => {
    const rows: Row[] = [
      { date: "2024-10-05", principal: 500, interest: 1, insurance: 0, fees: 0, totalPayment: 501, remainingCapital: 500 },
      { date: "2024-11-05", principal: 500, interest: 1, insurance: 0, fees: 0, totalPayment: 501, remainingCapital: 0 },
    ];
    assert.equal(resolve(rows).status, "exploitable");
    const withHole: Row[] = [
      { ...rows[0]!, date: "2024-08-05" },
      { ...rows[1]!, date: "2024-11-05" },
    ];
    assertBlocked(withHole, "soldé avec trou");
  });

  it("prêt se soldant dans N (CRD 0 sur la dernière ligne de N) → exploitable, aucun mois requis après", () => {
    const rows = monthsBetween(2024, 8, 2025, 6).map((month, index, all): Row => ({
      date: `${month}-05`, principal: 500, interest: 10, insurance: 1, fees: 0, totalPayment: 511, remainingCapital: 500 * (all.length - index - 1),
    }));
    assert.equal(resolve(rows).status, "exploitable");
  });
});

describe("F011-R1 — assurance et attribution au prêt : protections inchangées", () => {
  it("TEST 10 — assurance déclarée externe alors que le tableau porte une assurance en N → non exploitable", () => {
    assertBlocked(realShapedTable(), "assurance externe + tableau assuré", { assuranceExterneDeclaree: true });
  });

  it("assurance externe, tableau sans assurance en N → exploitable (l'anomalie porte sur N seulement)", () => {
    const rows = realShapedTable().map((row) => (row.date.startsWith("2025") ? { ...row, insurance: 0 } : row));
    assert.equal(resolve(rows, { assuranceExterneDeclaree: true }).status, "exploitable");
  });

  it("assurance bancaire présente APRÈS N avec assurance externe déclarée → ne bloque pas N", () => {
    const rows = realShapedTable().map((row) => (row.date.startsWith("2025") ? { ...row, insurance: 0 } : row));
    assert.equal(rows.some((row) => row.date >= "2026" && row.insurance > 0), true);
    assert.equal(resolve(rows, { assuranceExterneDeclaree: true }).status, "exploitable");
  });

  it("plusieurs prêts pour un seul tableau → aucun prêt ne le reçoit (attribution inchangée)", () => {
    const loan = { assuranceType: "bancaire", capitalInitialOffre: undefined };
    const res = resolveCreditFinancingLoanEcheances(
      { loans: [{ ...loan }, { ...loan }] as unknown as CreditFinancingData["loans"], installments: realShapedTable() as never },
      loan as never,
      EX,
    );
    assert.equal(res.status, "non_exploitable");
  });
});

describe("F011-R1 — consommateurs : ils suivent le prédicat propriétaire, sans modification", () => {
  const financing = (installments: Row[]): CreditFinancingData => ({
    loans: [{ id: "loan-1", firstPaymentDate: "2024-06-24", assuranceType: "bancaire" }],
    installments,
  } as unknown as CreditFinancingData);

  it("excludedLoanIdsFromFinancing ne signale plus le prêt (tableau exploitable pour 2025)", () => {
    assert.deepEqual(excludedLoanIdsFromFinancing(financing(realShapedTable()), EX), []);
  });

  it("excludedLoanIdsFromFinancing signale toujours le prêt si 2025 est troué", () => {
    assert.deepEqual(excludedLoanIdsFromFinancing(financing(without(realShapedTable(), "2025-03")), EX), ["loan-1"]);
  });

  it("gate F-006 : plus d'anomalie « prêt exclu » quand la liste dérivée est vide ; toujours là sinon", () => {
    const anomaliesFor = (installments: Row[]) => {
      const excluded = excludedLoanIdsFromFinancing(financing(installments), EX);
      const result = validateFiscalInputs({
        exerciceFiscal: EX,
        activite: { dateMiseEnService: "2024-09-01" },
        financementCharges: { exerciceFiscal: EX, excludedLoanIds: excluded },
      } as never);
      return result.anomalies.some((anomaly) => anomaly.field === "financementCharges.excludedLoanIds");
    };
    assert.equal(anomaliesFor(realShapedTable()), false);
    assert.equal(anomaliesFor(without(realShapedTable(), "2025-03")), true);
  });
});
