/**
 * Visibilité UX du Compagnon INPI (intégration 4.5.6).
 * Run: npx tsx --test src/components/lmnp/inpi-companion/should-show-inpi-companion.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { InpiStatus } from "@/lib/lmnp/types/dossier";
import { shouldShowInpiCompanion } from "./should-show-inpi-companion";

const HELPER_SOURCE = readFileSync(
  fileURLToPath(new URL("./should-show-inpi-companion.ts", import.meta.url)),
  "utf8",
);
const PAGE_SOURCE = readFileSync(
  fileURLToPath(new URL("../../../app/(dashboard)/assistants/activite/page.tsx", import.meta.url)),
  "utf8",
);
const DASHBOARD_SOURCE = readFileSync(
  fileURLToPath(new URL("./InpiCompanionDashboardSummary.tsx", import.meta.url)),
  "utf8",
);
const VALIDATION_SOURCE = readFileSync(
  fileURLToPath(new URL("../validation-workflow/ValidationInpiBlock.tsx", import.meta.url)),
  "utf8",
);

const FUNCTIONAL_HELPER = HELPER_SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const FUNCTIONAL_PAGE = PAGE_SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const FUNCTIONAL_DASHBOARD = DASHBOARD_SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(
  /\/\/.*$/gm,
  "",
);

const MATRIX: ReadonlyArray<[InpiStatus | undefined, boolean]> = [
  [undefined, false],
  ["not_started", false],
  ["registered", false],
  ["preparing", true],
  ["in_progress", true],
  ["modification_in_progress", true],
  ["submitted", true],
  ["regularization_required", true],
];

describe("shouldShowInpiCompanion — matrice de visibilité", () => {
  for (const [status, expected] of MATRIX) {
    it(`${status ?? "undefined"} → ${expected ? "visible" : "hidden"}`, () => {
      assert.equal(shouldShowInpiCompanion(status), expected);
    });
  }
});

describe("shouldShowInpiCompanion — absence de SIREN/SIRET", () => {
  it("un seul argument : InpiStatus | undefined — pas de siren/siret", () => {
    assert.equal(shouldShowInpiCompanion.length, 1);
    assert.doesNotMatch(FUNCTIONAL_HELPER, /siren/i);
    assert.doesNotMatch(FUNCTIONAL_HELPER, /siret/i);
  });

  it("absence of siren + undefined → hidden", () => {
    const draftWithoutSiren = { siren: undefined };
    assert.equal(draftWithoutSiren.siren, undefined);
    assert.equal(shouldShowInpiCompanion(undefined), false);
  });

  it("absence of siret + undefined → hidden", () => {
    const draftWithoutSiret = { siret: undefined };
    assert.equal(draftWithoutSiret.siret, undefined);
    assert.equal(shouldShowInpiCompanion(undefined), false);
  });

  it("absence of siren/siret + not_started → hidden", () => {
    assert.equal(shouldShowInpiCompanion("not_started"), false);
  });
});

describe("Intégration — Activité monte F009 toujours, Companion seulement si visible", () => {
  it("importe shouldShowInpiCompanion et F009ActiviteAssistantPanel", () => {
    assert.match(PAGE_SOURCE, /shouldShowInpiCompanion/);
    assert.match(PAGE_SOURCE, /F009ActiviteAssistantPanel/);
    assert.match(FUNCTIONAL_PAGE, /<F009ActiviteAssistantPanel key=\{workspace\.fiscalYear\.id\} \/>/);
  });

  it("InpiCompanionPanel n'est rendu que derrière shouldShowInpiCompanion", () => {
    assert.match(
      FUNCTIONAL_PAGE,
      /shouldShowInpiCompanion\(dossierInpiStatus\?\.status\)\s*\?\s*<section id="activite-inpi-companion" aria-label="Compagnon INPI"><InpiCompanionPanel \/><\/section>\s*:\s*null/,
    );
  });
});

describe("Intégration — Dashboard : return null si helper faux", () => {
  it("importe shouldShowInpiCompanion", () => {
    assert.match(DASHBOARD_SOURCE, /shouldShowInpiCompanion/);
  });

  it("return null lorsque le helper est faux", () => {
    assert.match(
      FUNCTIONAL_DASHBOARD,
      /if \(!shouldShowInpiCompanion\(dossierInpiStatus\?\.status\)\) return null/,
    );
  });
});

describe("Parcours Validation CTA → preparing → Companion visible", () => {
  it("Validation écrit preparing puis route vers Activité (mécanisme existant, non modifié)", () => {
    assert.match(VALIDATION_SOURCE, /onDeclareStatus\("preparing"\)/);
    assert.match(VALIDATION_SOURCE, /router\.push\(LMNP_ROUTES\.activite\)/);
  });

  it("preparing rend le Companion visible", () => {
    assert.equal(shouldShowInpiCompanion("preparing"), true);
  });
});
