/* eslint-disable @typescript-eslint/no-explicit-any -- sorties productives hétérogènes (test) */
/**
 * FISCAL-SILENT-ERROR-GATE-1 — vérificateur : génère un dossier PRODUCTIF et compare TOUTES les sorties fiscales à l'oracle indépendant.
 */
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import { YEAR, roundtrip } from "@/lib/lmnp/services/article-39c/article-39c-test-fixtures";
import { map2033BFromRfs } from "@/runtime/capabilities/rfs/projection/map-2033b";
import { map2031FromRfs } from "@/runtime/capabilities/rfs/projection/map-2031-from-rfs";
import { resolveExactSwitch } from "@/lib/lmnp/services/declaration/exact-39c-switch";
import { oracle, closes2033B, type OracleInput, type OracleOutput } from "./oracle";
import { cents, caseDossier, genProd, type Case } from "./fixtures.test";

export const toOracleInput = (c: Case): OracleInput => ({
  E: cents(c.E), CO: cents(c.CO ?? 0), CC: cents(c.CC ?? 0), AO: cents(c.AO ?? 0), AC: cents(c.AC ?? 0),
  B: cents(c.TF ?? 0), ACTIVITY: cents(c.COMPTA ?? 0), ND: cents(c.ND ?? 0), dotation: cents(c.dotation), ardOpen: cents(c.ardOpen ?? 0),
  deficits: (c.deficits ?? []).map((d) => ({ millesime: d.millesime, montant: cents(d.montant) })), year: YEAR,
});

const c100 = (n: unknown): number => (typeof n === "number" ? Math.round(n * 100) : 0);
const val = (cases: { caseId: string; value?: unknown }[], id: string) => cases.find((x) => x.caseId === id)?.value;

export type Observed = Record<string, number | string>;

/** Retourne les écarts (vide = concordance) et la sortie observée. `blocked` si la génération est refusée. */
export function checkWorkspace(ws: PersistedWorkspace, input: OracleInput, label: string): { diffs: string[]; blocked?: string; observed?: Observed; expected: OracleOutput } {
  const expected = oracle(input);
  const r: any = genProd(ws);
  if (r.status !== "generated") return { diffs: [`${label} BLOQUÉ`], blocked: JSON.stringify(r.blockingReasons?.map((b: any) => b.code) ?? r.anomalies?.map((a: any) => a.message)), expected };
  const f = r.rfs.fiscalResult;
  const form = map2033BFromRfs(r.rfs);
  const c2031 = map2031FromRfs(r.rfs).cases;
  const obs: Observed = {
    L: c100(f.recettes.total), avant: c100(f.resultatAvantAmort), D: c100(f.amortDeduct), ARDn: c100(f.amortNonDeduitExercice), H: c100(f.amortReportesUtilises),
    ardClose: c100(f.stocks.amortissementsReportes), apres: c100(f.resultatFiscalAvantDeficits), imputes: c100(f.deficitsImputes), deficitNouveau: c100(f.deficitNouveau), resultat: c100(f.resultatFiscal),
    l312: c100(val(form.cases, "312")), l314: c100(val(form.cases, "314")), l318: c100(val(form.cases, "318")), l330: c100(val(form.cases, "330")), l350: c100(val(form.cases, "350")),
    l352: c100(val(form.cases, "352")), l370: c100(val(form.cases, "370")), c7a: c100(val(c2031, "I_7A")), c7b: c100(val(c2031, "I_7B")),
    deficitsClose: JSON.stringify((f.stocks.deficits as { millesime: number; montant: number }[]).map((d) => ({ millesime: d.millesime, montant: c100(d.montant) }))),
  };
  const diffs: string[] = [];
  const cmp = (k: keyof OracleOutput | "l352" | "l370", exp: number | string) => {
    if (obs[k] !== exp) diffs.push(`${label} ${k}: obtenu ${obs[k]} ≠ oracle ${exp}`);
  };
  for (const k of ["L", "avant", "D", "ARDn", "H", "ardClose", "apres", "imputes", "deficitNouveau", "resultat", "l312", "l314", "l318", "l330", "l350", "c7a", "c7b"] as const) cmp(k, expected[k]);
  cmp("l352", 0); cmp("l370", 0);
  if (c100(val(c2031, "C_L1_COL1")) !== 0) diffs.push(`${label} 2031 ligne 1 colonne 1 ≠ 0 (SAV-032)`);
  cmp("deficitsClose", JSON.stringify(expected.deficitsClose));
  if (form.balancing.status !== "BALANCED") diffs.push(`${label} 2033-B non bouclée: ${form.balancing.status}`);
  if (!closes2033B(expected)) diffs.push(`${label} oracle lui-même ne boucle pas (bug d'oracle)`);
  // 7a·7b = 0 ; les deux jamais ensemble
  if (obs.c7a !== 0 && obs.c7b !== 0) diffs.push(`${label} 7a et 7b simultanés`);
  // Capacité du moteur exact (contrat) = C de l'oracle
  const s = resolveExactSwitch(ws);
  if (s.mode === "EXACT_39C_V2" && s.status === "READY") {
    if (c100(s.contract.capacite) !== expected.C) diffs.push(`${label} capacité: obtenue ${c100(s.contract.capacite)} ≠ oracle ${expected.C}`);
  } else diffs.push(`${label} switch non READY alors que la génération a abouti`);
  // Persistance / reload : mêmes chiffres
  const again: any = genProd(roundtrip(ws).reloaded);
  if (again.status !== "generated" || c100(again.rfs.fiscalResult.resultatFiscal) !== obs.resultat || c100(again.rfs.fiscalResult.amortDeduct) !== obs.D || c100(again.rfs.fiscalResult.stocks.amortissementsReportes) !== obs.ardClose) diffs.push(`${label} reload: résultat différent`);
  return { diffs, observed: obs, expected };
}

export const checkCase = (c: Case, label: string) => checkWorkspace(caseDossier(c), toOracleInput(c), label);
