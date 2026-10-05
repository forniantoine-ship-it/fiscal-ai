/* eslint-disable @typescript-eslint/no-explicit-any -- sorties productives hétérogènes (test) */
/**
 * GATE-1 §11/§17 — DIVERGENCE PDF / MOTEUR : le PDF 2033-B réellement produit imprime, ligne par ligne, l'arrondi à l'euro de l'oracle
 * indépendant (convention : arrondi à l'euro le plus proche, négatif entre parenthèses). Les textes lus sont ceux DESSINÉS dans le PDF.
 * Run: npx tsx --test src/lib/lmnp/services/article-39c/silent-error-gate/pdf.test.ts
 */
import "@/lab/v2-dossier/test-public-env";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateCerfa2033BFromRfs } from "@/lib/lmnp/services/liasse-pdf/generate-cerfa-2033b";
import { extractDrawnStringsForPage } from "@/lib/lmnp/services/liasse-pdf/tests/extract-rendered-text";
import { oracle } from "./oracle";
import { toOracleInput } from "./check";
import { caseDossier, genProd, type Case } from "./fixtures.test";

/** Formatage INDÉPENDANT du générateur : euros arrondis, espace simple des milliers, négatif entre parenthèses. */
const printed = (cents: number): string => {
  const euros = Math.round(Math.abs(cents) / 100);
  const body = String(euros).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return cents < 0 && euros !== 0 ? `(${body})` : body;
};

const CASES: Array<{ id: string; c: Case }> = [
  { id: "A", c: { E: 12000, TF: 3000, COMPTA: 600, dotation: 4000 } },
  { id: "I", c: { E: 10000, TF: 7000, COMPTA: 4000, dotation: 2500 } },
  { id: "K", c: { E: 6000, TF: 7000, dotation: 2000 } },
  { id: "G8", c: { E: 10000, TF: 7000, COMPTA: 1000, dotation: 1500, ardOpen: 1500 } },
  { id: "G5", c: { E: 12000, TF: 3000, ND: 400, dotation: 0, ardOpen: 2000, deficits: [{ millesime: 2025, montant: 1500 }] } },
  { id: "G10", c: { E: 10000, TF: 7000, ND: 200, dotation: 4000 } },
  { id: "cts1", c: { E: 12345.67, TF: 3210.89, COMPTA: 456.78, ND: 123.45, dotation: 2500.5 } },
  { id: "cts2", c: { E: 9999.5, TF: 7000.49, dotation: 3000.01, ardOpen: 777.77 } },
  { id: "cts3", c: { E: 5000.5, TF: 5000.5, COMPTA: 0.5, dotation: 1000.5 } },
];

describe("GATE-1 — PDF 2033-B : les lignes 312/314/318/330/350/352/370 imprimées = arrondi de l'oracle indépendant", () => {
  for (const { id, c } of CASES) {
    it(`${id} — PDF réellement produit`, async () => {
      const g: any = genProd(caseDossier(c));
      assert.equal(g.status, "generated", JSON.stringify(g.blockingReasons ?? g.anomalies));
      const pdf: any = await generateCerfa2033BFromRfs({ rfs: g.rfs, declarationVersionId: "v-gate1", generatedAt: "2026-12-31T00:00:00.000Z" });
      assert.equal(pdf.status, "generated", JSON.stringify(pdf.violations));
      // ce qui est dessiné dans le PDF = ce que le manifeste annonce
      const drawn = new Set<string>();
      for (let p = 1; p <= pdf.pageCount; p++) for (const s of await extractDrawnStringsForPage(pdf.pdfBytes, p)) drawn.add(s);
      for (const m of pdf.manifest as any[]) assert.ok(drawn.has(m.text), `case ${m.caseId} : « ${m.text} » absent du PDF`);
      // lignes du résultat fiscal : arrondi indépendant
      const o = oracle(toOracleInput(c));
      const want: Record<string, number> = { "312": o.l312, "314": o.l314, "318": o.l318, "330": o.l330, "350": o.l350, "352": 0, "370": 0 };
      const text = (caseId: string) => (pdf.manifest as any[]).find((m) => m.caseId === caseId)?.text as string | undefined;
      for (const [caseId, cents] of Object.entries(want)) {
        if (cents === 0 && !["352", "370"].includes(caseId)) { assert.ok(text(caseId) === undefined || text(caseId) === "0", `${caseId} : zéro non imprimé ou « 0 »`); continue; }
        assert.equal(text(caseId), printed(cents), `${id} case ${caseId} (oracle ${cents / 100} €)`);
      }
      // l'équation imprimée tient à ±1 € (arrondis indépendants de chaque ligne à l'euro)
      const n = (s: string | undefined) => (s === undefined ? 0 : Number(s.replace(/[()\s]/g, "")) * (s.startsWith("(") ? -1 : 1));
      const closure = n(text("312")) - n(text("314")) + n(text("318")) + n(text("330")) - n(text("350"));
      assert.ok(Math.abs(closure) <= 1, `équation imprimée : écart ${closure} €`);
    });
  }
});
