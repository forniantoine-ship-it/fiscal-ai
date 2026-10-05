#!/usr/bin/env node
/**
 * GATE-1 §19 — MUTATION TESTING. Applique chaque mutation à UN fichier productif (copie mémoire restaurée dans `finally`), lance la
 * suite du gate, exige au moins un échec (mutation « tuée »). N'écrit rien d'autre ; le diff git doit rester vide à la fin.
 * Run: node src/lib/lmnp/services/article-39c/silent-error-gate/run-mutations.mjs [filtre]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const S = "src/lib/lmnp/services";
const R = "src/runtime/capabilities";
const MUTATIONS = [
  // --- F013 v2 : rattachement des loyers (SAV-034) ---
  { id: "M01 CO signe inversé", file: `${S}/f013/v2/f013-v2-engine.ts`, find: "validated.closingReceivablesCents! -\n      validated.openingReceivablesCents! +", repl: "validated.closingReceivablesCents! +\n      validated.openingReceivablesCents! +" },
  { id: "M02 CC ignorée", file: `${S}/f013/v2/f013-v2-engine.ts`, find: "validated.collectionsCents! +\n      validated.closingReceivablesCents! -", repl: "validated.collectionsCents! +\n      0 -" },
  { id: "M03 AO signe inversé", file: `${S}/f013/v2/f013-v2-engine.ts`, find: "+\n      validated.openingAdvancesCents! -", repl: "-\n      validated.openingAdvancesCents! -" },
  { id: "M04 AC ignorée", file: `${S}/f013/v2/f013-v2-engine.ts`, find: "-\n      validated.closingAdvancesCents!;", repl: "-\n      0;" },
  { id: "M05 propertyId ignoré (F013)", file: `${S}/f013/v2/f013-v2-engine.ts`, find: "const propertyOk = identityOk && propertyId === scope.propertyId;", repl: "const propertyOk = identityOk;" },
  { id: "M06 fiscalYear ignoré (F013)", file: `${S}/f013/v2/f013-v2-engine.ts`, find: "const yearOk = identityOk && fiscalYear === scope.fiscalYear;", repl: "const yearOk = identityOk;" },
  // --- Article 39 C : capacité, ordre, déficits ---
  { id: "M07 C non clampée à zéro (moteur)", file: `${R}/f006/article-39c-capacity.ts`, find: "capacite: fromCents(Math.max(0, sums.L - sums.B)),", repl: "capacite: fromCents(sums.L - sums.B)," },
  { id: "M08 C non clampée (séquence F006)", file: `${R}/f006/article-39c-capacity.ts`, find: "const capacity = Math.max(0, toCents(input.capacite));", repl: "const capacity = toCents(input.capacite);" },
  { id: "M09 OTHER_PRODUCT augmente C", file: `${R}/f006/article-39c-capacity.ts`, find: "capacite: fromCents(Math.max(0, sums.L - sums.B)),", repl: "capacite: fromCents(Math.max(0, sums.L + sums.OTHER_PRODUCT - sums.B))," },
  { id: "M10 ACTIVITY réduit C", file: `${R}/f006/article-39c-capacity.ts`, find: "capacite: fromCents(Math.max(0, sums.L - sums.B)),", repl: "capacite: fromCents(Math.max(0, sums.L - sums.B - sums.ACTIVITY))," },
  { id: "M11 ARD historique avant dotation courante", file: `${R}/f006/article-39c-capacity.ts`, find: "const d = Math.min(current, capacity);\n  const capacity2 = capacity - d;\n  const h = Math.min(ard, capacity2);", repl: "const h = Math.min(ard, capacity);\n  const capacity2 = capacity - h;\n  const d = Math.min(current, capacity2);" },
  { id: "M12 délai des déficits 11 ans", file: `${R}/f006/article-39c-capacity.ts`, find: "const DEFICIT_REPORT_YEARS = 10;", repl: "const DEFICIT_REPORT_YEARS = 11;" },
  { id: "M13 matérialité : toute incertitude immatérielle", file: `${R}/f006/article-39c-capacity.ts`, find: "const immaterial = branches.every((b) => relevantSignature(b.figures) === signature);", repl: "const immaterial = true;" },
  // --- Classification / qualifications ---
  { id: "M14 B commune absorbée (niveau activité)", file: `${S}/article-39c/from-f012.ts`, find: 'if (input.owner.level === "ACTIVITY" && c.class === "B") {', repl: 'if (false && input.owner.level === "ACTIVITY" && c.class === "B") {' },
  { id: "M15 UNKNOWN accepté (CFE inconnue → ACTIVITY)", file: `${S}/article-39c/qualification-facts.ts`, find: '    default:\n      return unresolved("UNRESOLVED", "UNRESOLVED", `cfe:${fact.provenance}`, "CFE : base UNKNOWN', repl: '    default:\n      return { ...base, class: "ACTIVITY", proofLevel: "STRONG_INFERENCE", provenance: "mut", ruleId: "mut", reason: "mut", qualificationStatus: "VALIDATED" };\n    case "__never__":\n      return unresolved("UNRESOLVED", "UNRESOLVED", `cfe:${fact.provenance}`, "CFE : base UNKNOWN' },
  { id: "M16 stale accepté (CFE)", file: `${S}/article-39c/qualification-facts.ts`, find: "|| fact.sourceFingerprint !== currentFingerprint) {", repl: "|| false) {" },
  { id: "M17 stale accepté (faits de nature)", file: `${S}/article-39c/qualification-facts.ts`, find: 'return fact.sourceFingerprint === currentFingerprint ? "FRESH" : "STALE";', repl: 'return "FRESH";' },
  { id: "M18 propertyId ignoré (qualifications)", file: `${S}/article-39c/qualification-store.ts`, find: "if (!sameScope(record.scope, scope)) {", repl: "if (false) {" },
  { id: "M19 fiscalYear ignoré (qualifications)", file: `${S}/article-39c/qualification-store.ts`, find: 'if (record.fiscalYear !== fiscalYear || record.validation !== "VALIDATED") continue;', repl: 'if (record.validation !== "VALIDATED") continue;' },
  { id: "M20 déduplication par montant seul (frais bancaires)", file: `${S}/article-39c/from-f012.ts`, find: "if (bank.alreadyCountedByF011 === true) {", repl: "if (bank.alreadyCountedByF011 === true || mayDuplicateF011) {" },
  { id: "M21 doublon F011/F012 non retiré de F-006", file: `${S}/declaration/exact-39c-switch.ts`, find: "const dedupe = charges !== undefined && duplicate > 0 &&", repl: "const dedupe = false && charges !== undefined && duplicate > 0 &&" },
  { id: "M22 CFE liée comptée deux fois", file: `${S}/declaration/exact-39c-switch.ts`, find: 'else if (record.recordKind === "CFE" && record.diversLinkage?.kind !== "LINKED") cents', repl: 'else if (record.recordKind === "CFE") cents' },
  { id: "M23 plausible EXCLUDED retiré (doublon possible)", file: `${S}/article-39c/from-f012.ts`, find: '["B", "ACTIVITY", "EXCLUDED"] : NEEDS_QUALIFICATION_DEFAULT_PLAUSIBLE;', repl: "NEEDS_QUALIFICATION_DEFAULT_PLAUSIBLE : NEEDS_QUALIFICATION_DEFAULT_PLAUSIBLE;" },
  // --- Switch / décision ---
  { id: "M24 F013 v1 traité comme v2", file: `${S}/declaration/exact-39c-switch.ts`, find: 'return states.some((s) => s?.facts.fiscalYear === year) ? "EXACT_39C_V2" : "LEGACY_PROXY";', repl: 'return "EXACT_39C_V2";' },
  { id: "M25 F013 v2 traité comme legacy", file: `${S}/declaration/exact-39c-switch.ts`, find: 'return states.some((s) => s?.facts.fiscalYear === year) ? "EXACT_39C_V2" : "LEGACY_PROXY";', repl: 'return "LEGACY_PROXY";' },
  { id: "M26 gate rouge → repli sur le proxy", file: `${S}/declaration/generation-workspace.ts`, find: 'if (switchResolution.mode === "EXACT_39C_V2" && switchResolution.status === "BLOCKED") {', repl: 'if (false && switchResolution.mode === "EXACT_39C_V2" && switchResolution.status === "BLOCKED") {' },
  { id: "M27 réconciliation exact ↔ F-006 désactivée", file: `${S}/declaration/exact-39c-switch.ts`, find: "const e = contract.expected;\n  const diffs: string[] = [];", repl: "return [];\n  const e = contract.expected;\n  const diffs: string[] = [];" },
  { id: "M28 réconciliation des lignes F012 désactivée", file: `${S}/article-39c/workspace-sources.ts`, find: "const diffs = reconcile(charges, confirmed);", repl: "const diffs: string[] = [];" },
  // --- Liasse ---
  { id: "M29 330 sans charges non déductibles", file: `${R}/f007/nonpro-neutralisation.ts`, find: "Math.max(-avantDeficits, 0) + nonDeductible", repl: "Math.max(-avantDeficits, 0)" },
  { id: "M30 350 sans ARD utilisée", file: `${R}/f007/nonpro-neutralisation.ts`, find: "Math.max(avantDeficits, 0) + aRD", repl: "Math.max(avantDeficits, 0)" },
  // --- Bilan / continuité ---
  { id: "M31 autre dette supprimée par ownership F013", file: `${S}/f013/v2/f013-v2-bilan-wiring.ts`, find: 'if (advances > 0 && bilan.tiers?.dettes?.status === "NUL_CONFIRME") {', repl: "if (advances > 0 && bilan.tiers?.dettes !== undefined) {" },
  { id: "M32 CC(N) reprise comme AO(N+1) (natures interverties)", file: `${S}/f013/v2/f013-v2-continuity.ts`, find: 'openingReceivables: openingFact(f.closingReceivables, source, "closing_receivable"),', repl: 'openingReceivables: openingFact(f.closingAdvances, source, "closing_receivable"),' },
  // --- doubles gardes : retirées ENSEMBLE (aucune des deux ne doit être seule responsable) ---
  { id: "M33 C non clampée : moteur ET séquence", edits: [
    { file: `${R}/f006/article-39c-capacity.ts`, find: "capacite: fromCents(Math.max(0, sums.L - sums.B)),", repl: "capacite: fromCents(sums.L - sums.B)," },
    { file: `${R}/f006/article-39c-capacity.ts`, find: "const capacity = Math.max(0, toCents(input.capacite));", repl: "const capacity = toCents(input.capacite);" } ] },
  { id: "M34 réconciliation F012 ET exact↔F-006 désactivées", edits: [
    { file: `${S}/article-39c/workspace-sources.ts`, find: "const diffs = reconcile(charges, confirmed);", repl: "const diffs: string[] = [];" },
    { file: `${S}/declaration/exact-39c-switch.ts`, find: "const e = contract.expected;\n  const diffs: string[] = [];", repl: "return [];\n  const e = contract.expected;\n  const diffs: string[] = [];" } ] },
  { id: "M35 identité F013 : bien ET exercice ignorés", edits: [
    { file: `${S}/f013/v2/f013-v2-engine.ts`, find: "const propertyOk = identityOk && propertyId === scope.propertyId;", repl: "const propertyOk = identityOk;" },
    { file: `${S}/f013/v2/f013-v2-engine.ts`, find: "const yearOk = identityOk && fiscalYear === scope.fiscalYear;", repl: "const yearOk = identityOk;" } ] },
  // --- GATE-1.1 : documents, première année, somme de frais ---
  { id: "M36 détection de documents identiques désactivée", file: `${S}/declaration/generation-workspace.ts`, find: "if (duplicateDocuments.length > 0) {", repl: "if (false) {" },
  { id: "M37 même document / deux charges toujours « distinctes »", file: `${S}/documents/duplicate-document-charges.ts`, find: "return ka !== undefined && kb !== undefined && ka !== kb;", repl: "return true;" },
  { id: "M38 empreinte invalide acceptée (reducer)", file: `src/lib/lmnp/store/reducer.ts`, find: "if (!isContentSha256(action.sha256)) return state;", repl: "" },
  { id: "M39 fichier remplacé : empreinte conservée", file: `src/lib/lmnp/store/reducer.ts`, find: "const documents = state.documents.some((d) => d.id === action.documentId && d.contentSha256 !== undefined)", repl: "const documents = false && state.documents.some((d) => d.id === action.documentId && d.contentSha256 !== undefined)" },
  { id: "M40 FIRST_REAL_YEAR + CO/AO non bloqué", file: `${S}/declaration/exact-39c-switch.ts`, find: 'if (workspace.fiscalYear.priorHistoryDeclaration?.status === "FIRST_REAL_YEAR" &&', repl: 'if (false && workspace.fiscalYear.priorHistoryDeclaration?.status === "FIRST_REAL_YEAR" &&' },
  { id: "M41 F012 = somme de F011 non détectée", file: `${S}/article-39c/from-f012.ts`, find: "return sums.has(amountCents);", repl: "return false;" },
  { id: "M42 deux documents de même contenu fusionnés (une charge retirée)", file: `${S}/documents/duplicate-document-charges.ts`, find: "if (!suspicious) continue;", repl: "continue;" },
];

const filter = process.argv[2]?.split(",");
const SUITE = [
  "src/lib/lmnp/services/article-39c/silent-error-gate/matrix.test.ts", "src/lib/lmnp/services/article-39c/silent-error-gate/fuzz.test.ts",
  "src/lib/lmnp/services/article-39c/silent-error-gate/multi.test.ts", "src/lib/lmnp/services/article-39c/silent-error-gate/continuity.test.ts",
  "src/lib/lmnp/services/article-39c/silent-error-gate/forms.test.ts", "src/lib/lmnp/services/article-39c/silent-error-gate/integrity.test.ts",
  "src/lib/lmnp/services/article-39c/silent-error-gate/cents.test.ts", "src/lib/lmnp/services/article-39c/silent-error-gate/engine.test.ts",
  "src/lib/lmnp/services/article-39c/silent-error-gate/findings.test.ts", "src/lib/lmnp/services/article-39c/silent-error-gate/guards.test.ts", "src/lib/lmnp/services/article-39c/silent-error-gate/pdf.test.ts", "src/lib/lmnp/services/article-39c/silent-error-gate/documents.test.ts", "src/lib/lmnp/services/declaration/exact-39c-switch.test.ts", "src/lib/lmnp/services/declaration/exact-39c-proof-gaps.test.ts",
];

const results = [];
for (const m of MUTATIONS) {
  if (filter !== undefined && !filter.some((f) => m.id.includes(f))) continue;
  const edits = m.edits ?? [{ file: m.file, find: m.find, repl: m.repl }];
  const originals = new Map(edits.map((e) => [e.file, readFileSync(e.file, "utf8")]));
  const bad = edits.find((e) => originals.get(e.file).split(e.find).length - 1 !== 1);
  if (bad !== undefined) { results.push({ id: m.id, status: `INVALID (find ×${originals.get(bad.file).split(bad.find).length - 1})` }); continue; }
  try {
    for (const e of edits) writeFileSync(e.file, readFileSync(e.file, "utf8").replace(e.find, () => e.repl));
    const run = spawnSync("npx", ["tsx", "--test", ...SUITE], { encoding: "utf8", maxBuffer: 1 << 28, timeout: 600000 });
    const out = `${run.stdout}\n${run.stderr}`;
    const fail = Number((out.match(/^# fail (\d+)/m) ?? [])[1] ?? NaN);
    const firstFail = (out.match(/^\s*not ok \d+ - ((?:(?!# TODO).)*)$/m) ?? [])[1] ?? "";
    results.push({ id: m.id, status: Number.isNaN(fail) ? "ERROR (suite illisible)" : fail > 0 ? "KILLED" : "SURVIVED", fail, firstFail: firstFail.slice(0, 110) });
  } finally {
    for (const [file, text] of originals) writeFileSync(file, text);
  }
}
for (const r of results) console.log(`${r.status.padEnd(9)} ${r.id}${r.fail !== undefined ? `  [${r.fail} échecs] ${r.firstFail}` : ""}`);
const killed = results.filter((r) => r.status === "KILLED").length;
console.log(`\nMUTATIONS: ${results.length} exécutées, ${killed} tuées, ${results.filter((r) => r.status === "SURVIVED").length} survivantes, ${results.filter((r) => !["KILLED", "SURVIVED"].includes(r.status)).length} invalides/erreurs`);
process.exit(killed === results.length ? 0 : 1);
