import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

// =====================================================================
// P2-4 — garde d'architecture : source unique du quartet
// FiscalResult + RFS + Liasse + LiasseRfs.
//
// Audit P2-4 (READ-ONLY, HEAD e8ac45c) : F006FiscalEnginePanel.tsx et
// F007LiasseEnginePanel.tsx pouvaient persister directement fiscalResult /
// liasseResult dans declarationDraft via DECLARATION_PATCH_DRAFT, en dehors
// de runDeclarationGeneration() — un quartet partiel (sans rfs/liasseRfs)
// pouvait alors atterrir dans le draft persisté. Aucun consommateur du
// parcours 2026 n'exposait ce quartet partiel à l'utilisateur (Validation
// recalcule toujours un preview frais ; /declarations est gaté par
// declarationGeneratedAt/paidAt, écrits uniquement par la génération
// canonique), mais la capacité d'écriture elle-même contredisait
// l'invariant documenté dans run-declaration-generation.ts et
// append-declaration-version.ts. Cette suite verrouille la fermeture de
// cette capacité, sans toucher aux kernels (produceFiscalResult/
// produceLiasse) ni à runDeclarationGeneration() lui-même.
// =====================================================================

const F006_PANEL = path.join(
  __dirname,
  "../../../../components/lmnp/assistants/F006FiscalEnginePanel.tsx",
);
const F007_PANEL = path.join(
  __dirname,
  "../../../../components/lmnp/assistants/F007LiasseEnginePanel.tsx",
);
const RUN_DECLARATION_GENERATION = path.join(__dirname, "run-declaration-generation.ts");

describe("P2-4 — F006FiscalEnginePanel ne persiste plus fiscalResult directement", () => {
  const source = readFileSync(F006_PANEL, "utf-8");

  it("ne dispatch plus DECLARATION_PATCH_DRAFT", () => {
    assert.equal(
      source.includes("DECLARATION_PATCH_DRAFT"),
      false,
      "F006FiscalEnginePanel.tsx ne doit plus écrire fiscalResult (ni aucun autre champ) dans declarationDraft — seul runDeclarationGeneration() écrit le quartet",
    );
  });

  it("ne contourne pas la fermeture en appelant directement les kernels RFS", () => {
    for (const token of ["buildFiscalRepresentation", "assembleLiasseFromRfs"]) {
      assert.equal(
        source.includes(token),
        false,
        `F006FiscalEnginePanel.tsx ne doit pas appeler ${token}() — cela resterait un contournement de runDeclarationGeneration()`,
      );
    }
  });

  it("continue de calculer/afficher un résultat localement (comportement conservé, non persisté)", () => {
    assert.ok(
      source.includes("state.result ? <ResultSummaryCard"),
      "le panel doit continuer à afficher son résultat local (state.result), sans le persister",
    );
  });
});

describe("P2-4 — F007LiasseEnginePanel ne persiste plus liasseResult directement", () => {
  const source = readFileSync(F007_PANEL, "utf-8");

  it("ne dispatch plus DECLARATION_PATCH_DRAFT", () => {
    assert.equal(
      source.includes("DECLARATION_PATCH_DRAFT"),
      false,
      "F007LiasseEnginePanel.tsx ne doit plus écrire liasseResult (ni aucun autre champ) dans declarationDraft — seul runDeclarationGeneration() écrit le quartet",
    );
  });

  it("ne contourne pas la fermeture en appelant directement les kernels RFS", () => {
    for (const token of ["buildFiscalRepresentation", "assembleLiasseFromRfs"]) {
      assert.equal(
        source.includes(token),
        false,
        `F007LiasseEnginePanel.tsx ne doit pas appeler ${token}() — cela resterait un contournement de runDeclarationGeneration()`,
      );
    }
  });

  it("continue de calculer/afficher un résultat localement (comportement conservé, non persisté)", () => {
    assert.ok(
      source.includes("state.result ? <CasesPreviewCard"),
      "le panel doit continuer à afficher son résultat local (state.result), sans le persister",
    );
  });
});

describe("P2-4 — runDeclarationGeneration() reste le chemin canonique de persistance du quartet", () => {
  const source = readFileSync(RUN_DECLARATION_GENERATION, "utf-8");

  it("appelle toujours produceFiscalResult(), produceLiasse(), buildFiscalRepresentation() et assembleLiasseFromRfs() dans un seul et même appel", () => {
    for (const token of [
      "produceFiscalResult(",
      "produceLiasse(",
      "buildFiscalRepresentation(",
      "assembleLiasseFromRfs(",
    ]) {
      assert.ok(
        source.includes(token),
        `run-declaration-generation.ts doit toujours appeler ${token} — chemin canonique inchangé`,
      );
    }
  });

  it("retourne toujours les quatre artefacts du quartet dans le statut 'generated'", () => {
    for (const field of ["fiscalResult:", "liasseResult:", "rfs,", "liasseRfs,"]) {
      assert.ok(
        source.includes(field),
        `run-declaration-generation.ts doit toujours produire ${field} dans son résultat`,
      );
    }
  });
});
