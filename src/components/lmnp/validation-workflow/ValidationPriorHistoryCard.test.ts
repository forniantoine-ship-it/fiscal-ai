/**
 * P0 launch safety — carte « antériorité LMNP » : modèle d'affichage, wording,
 * et garde de câblage des points d'entrée qui décident d'un paiement ou d'une
 * génération.
 * Run: npx tsx --test src/components/lmnp/validation-workflow/ValidationPriorHistoryCard.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { PRIOR_HISTORY_COPY, resolvePriorHistoryCardView } from "./ValidationPriorHistoryCard";
import { resolvePriorHistoryEligibility } from "@/lib/lmnp/services/declaration/prior-history-eligibility";

const NOW = "2026-09-04T00:00:00.000Z";
const VALID_OPENING = { sourceClosureId: "c", stocks: { deficits: [], amortissementsReportes: 0 } };

describe("carte antériorité — modèle d'affichage (management par exception)", () => {
  it("continuité native prouvée → AUCUNE question (carte masquée)", () => {
    const view = resolvePriorHistoryCardView(
      resolvePriorHistoryEligibility({ previousFiscalYearId: "fy-0", stocksOuverture: VALID_OPENING }),
    );
    assert.deepEqual(view, { kind: "hidden" });
  });

  it("aucune preuve, aucune réponse → la question est posée", () => {
    assert.deepEqual(resolvePriorHistoryCardView(resolvePriorHistoryEligibility({})), { kind: "question" });
  });

  it("première année déclarée → simple rappel modifiable, pas de blocage", () => {
    const view = resolvePriorHistoryCardView(
      resolvePriorHistoryEligibility({ priorHistoryDeclaration: { status: "FIRST_REAL_YEAR", declaredAt: NOW } }),
    );
    assert.deepEqual(view, { kind: "confirmed" });
  });

  it("historique externe → message de reprise indisponible, réponse modifiable", () => {
    const view = resolvePriorHistoryCardView(
      resolvePriorHistoryEligibility({ priorHistoryDeclaration: { status: "EXTERNAL_HISTORY", declaredAt: NOW } }),
    );
    assert.equal(view.kind, "blocked");
    assert.equal(view.kind === "blocked" && view.message, PRIOR_HISTORY_COPY.blocked.EXTERNAL_HISTORY_DECLARED);
    assert.equal(view.kind === "blocked" && view.canChangeAnswer, true);
  });

  it("« Fiscal AI » sans continuité → message dédié, réponse modifiable", () => {
    const view = resolvePriorHistoryCardView(
      resolvePriorHistoryEligibility({ priorHistoryDeclaration: { status: "FISCAL_AI_PREVIOUS", declaredAt: NOW } }),
    );
    assert.equal(view.kind === "blocked" && view.message, PRIOR_HISTORY_COPY.blocked.FISCAL_AI_CLAIM_WITHOUT_CONTINUITY);
    assert.equal(view.kind === "blocked" && view.canChangeAnswer, true);
  });

  it("prédécesseur sans stocks d'ouverture → blocage sans question, raison conservée affichée", () => {
    const view = resolvePriorHistoryCardView(
      resolvePriorHistoryEligibility({
        previousFiscalYearId: "fy-0",
        stocksOuvertureUnavailableReason: "L'exercice précédent n'est pas clôturé.",
      }),
    );
    assert.equal(view.kind, "blocked");
    assert.equal(view.kind === "blocked" && view.canChangeAnswer, false, "aucune réponse ne répare une continuité absente");
    assert.equal(view.kind === "blocked" && view.detail, "L'exercice précédent n'est pas clôturé.");
  });
});

describe("carte antériorité — wording simple", () => {
  const allText = JSON.stringify(PRIOR_HISTORY_COPY);

  it("n'emploie aucun jargon technique (FEC, liasse, 2033, RFS, CRD) ni ne promet une reprise disponible", () => {
    assert.doesNotMatch(allText, /\bFEC\b|liasse|2033|\bRFS\b|\bCRD\b/i);
  });

  it("le message de blocage externe exprime l'intention demandée", () => {
    const message = PRIOR_HISTORY_COPY.blocked.EXTERNAL_HISTORY_DECLARED;
    assert.match(message, /reprendre certains éléments de votre comptabilité précédente/);
    assert.match(message, /déficits et amortissements reportables/);
    assert.match(message, /pas encore disponible/);
  });

  it("propose exactement les trois situations", () => {
    assert.deepEqual(
      PRIOR_HISTORY_COPY.options.map((o) => o.status),
      ["FIRST_REAL_YEAR", "FISCAL_AI_PREVIOUS", "EXTERNAL_HISTORY"],
    );
  });
});

describe("garde de câblage — chaque point d'entrée qui décide d'un paiement/génération consulte le même résolveur", () => {
  const root = path.join(__dirname, "../../..");
  const read = (rel: string) => readFileSync(path.join(root, rel), "utf-8");

  it("ValidationDocumentStep : porte, paiement et génération", () => {
    const source = read("components/lmnp/documents/ValidationDocumentStep.tsx");
    const gateArgs = extractCallObjectLiterals(source, "resolveDeclarationGenerationGate");
    assert.ok(gateArgs.length > 0, "au moins un appel à la porte");
    assert.ok(
      gateArgs.every((args) => /\bpriorHistory\b/.test(args)),
      "la porte reçoit l'éligibilité",
    );
    const generation = source.slice(source.indexOf("const handleGenerationComplete"));
    assert.match(generation.slice(0, 500), /resolvePriorHistoryEligibility\(fiscalYear\)\.eligible/, "génération : relecture défensive");
    // Payment V1 — le paiement passe désormais par le checkout serveur ; la relecture défensive précède tout appel.
    const payment = source.slice(source.indexOf("const handleStartCheckout"));
    assert.match(payment.slice(0, 500), /resolvePriorHistoryEligibility\(fiscalYear\)\.eligible/, "paiement : relecture défensive");
  });

  it("/declarations : accès aux livrables conditionné à l'éligibilité", () => {
    assert.match(read("app/(dashboard)/declarations/page.tsx"), /resolvePriorHistoryEligibility\(workspace\.fiscalYear\)/);
  });

  it("clôture : canCloseFiscalYear consulte le même résolveur", () => {
    const source = read("lib/lmnp/services/dossier/fiscal-year-cycle.ts");
    const close = source.slice(source.indexOf("export function canCloseFiscalYear"));
    assert.match(close.slice(0, 2500), /resolvePriorHistoryEligibility\(fiscalYear\)/);
  });

  it("paiement sans génération : la préparation au paiement lit l'éligibilité portée par la porte", () => {
    assert.match(read("lib/lmnp/services/declaration/payment-readiness.ts"), /gate\.priorHistory && !gate\.priorHistory\.eligible/);
  });
});

describe("garde de fail-open — aucun nouvel appelant de la porte ne peut omettre l'éligibilité", () => {
  const srcRoot = path.join(__dirname, "../../..");

  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(full);
    }
    return out;
  }

  // Appelants de pure détection de dérive : ils ne décident d'aucun paiement ni
  // d'aucune génération. `canCloseFiscalYear` porte sa propre vérification
  // d'éligibilité (voir fiscal-year-cycle.ts) ; `resolveDeclarationOutOfDate`
  // n'expose qu'un booléen de présentation.
  const DRIFT_ONLY_CALLERS = new Set([
    "lib/lmnp/services/dossier/fiscal-year-cycle.ts",
    "lib/lmnp/services/declaration/declaration-freshness.ts",
  ]);
  const DEFINITION = "lib/lmnp/services/declaration/declaration-generation-gate.ts";

  it("tout appelant de resolveDeclarationGenerationGate passe `priorHistory`, sauf la liste fermée d'appelants de dérive", () => {
    const offenders: string[] = [];
    const seen: string[] = [];
    for (const file of walk(srcRoot)) {
      const rel = path.relative(srcRoot, file).split(path.sep).join("/");
      if (rel === DEFINITION) continue;
      const source = readFileSync(file, "utf-8");
      const calls = extractCallObjectLiterals(source, "resolveDeclarationGenerationGate");
      if (calls.length === 0) continue;
      seen.push(rel);
      if (DRIFT_ONLY_CALLERS.has(rel)) continue;
      if (!calls.every((args) => /\bpriorHistory\b/.test(args))) offenders.push(rel);
    }
    assert.deepEqual(offenders, [], "appelant(s) qui décident d'un paiement/génération sans éligibilité");
    assert.ok(seen.includes("components/lmnp/documents/ValidationDocumentStep.tsx"), "le scan trouve bien l'appelant de production");
    assert.ok(seen.includes("lib/lmnp/services/dossier/fiscal-year-cycle.ts"), "le scan trouve bien les appelants de dérive");
  });
});

/**
 * Extrait le corps de chaque littéral d'objet passé à `callee({ ... })`,
 * en respectant les accolades imbriquées (ex. `continuity: resolveX({ ... })`).
 * Évite le faux positif d'un regex non-greedy qui s'arrête au premier `}`.
 */
function extractCallObjectLiterals(source: string, callee: string): string[] {
  const needle = `${callee}({`;
  const bodies: string[] = [];
  let from = 0;
  while (from < source.length) {
    const start = source.indexOf(needle, from);
    if (start < 0) break;
    const openBrace = start + callee.length + 1; // index of '{'
    let depth = 0;
    let i = openBrace;
    for (; i < source.length; i++) {
      const ch = source[i];
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          bodies.push(source.slice(openBrace + 1, i));
          break;
        }
      }
    }
    from = i + 1;
  }
  return bodies;
}