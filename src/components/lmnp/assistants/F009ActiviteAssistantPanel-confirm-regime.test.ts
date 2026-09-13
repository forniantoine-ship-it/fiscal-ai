/**
 * Régression — F009 V2 : le nouveau run() du panel ne dispatchait plus
 * CONFIRM_REGIME à la complétion (l'ancien persistCompletion() le faisait,
 * aux côtés de START_DOCUMENT_JOURNEY/DECLARATION_COMPLETE_STEP). Sans lui,
 * fiscalYear.regimeConfirmedAt n'est jamais posé et deriveStatutDossier()
 * reste bloqué sur DOSSIER_CREE pour tout dossier ayant terminé F009.
 *
 * Ce fichier aurait échoué contre le code Astra tel qu'audité (aucune
 * occurrence de CONFIRM_REGIME dans F009ActiviteAssistantPanel.tsx).
 *
 * Run: npx tsx --test "src/components/lmnp/assistants/F009ActiviteAssistantPanel-confirm-regime.test.ts"
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import type { FiscalYear, Property } from "@/lib/lmnp/types";
import { deriveStatutDossier } from "@/lib/lmnp/engine/dossier-status";

const panelSource = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "F009ActiviteAssistantPanel.tsx"),
  "utf-8",
);

async function loadReducer() {
  // reducer.ts importe transitivement @/lib/supabase.ts, dont le client est
  // construit au chargement du module — même pattern que
  // reducer-upload-documents-id.test.ts.
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://test.invalid.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
  const mod = await import("@/lib/lmnp/store/reducer");
  return mod.lmnpReducer;
}

function baseFiscalYear(): FiscalYear {
  return {
    id: "fy-1",
    year: 2026,
    status: "draft",
    regime: "reel",
    propertyIds: ["prop-1"],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

function baseProperty(): Property {
  return { id: "prop-1", label: "", address: "", city: "", postalCode: "" };
}

describe("0. vérification structurelle : le panel dispatche CONFIRM_REGIME à la complétion, sans nouvelle question utilisateur", () => {
  it('run() contient un dispatch CONFIRM_REGIME conditionné à result.completed', () => {
    const runBlock = panelSource.slice(panelSource.indexOf("const run = useCallback"), panelSource.indexOf("upload = async"));
    assert.match(runBlock, /if\s*\(result\.completed\)\s*dispatch\(\{\s*type:\s*"CONFIRM_REGIME"/);
  });
  it("aucune nouvelle question de régime n'est introduite dans l'UI (le réel simplifié reste implicite)", () => {
    const viewSource = readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), "F009ActiviteView.tsx"),
      "utf-8",
    );
    assert.doesNotMatch(viewSource, /régime/i);
  });
});

describe("1. CONFIRM_REGIME → regimeConfirmedAt → deriveStatutDossier progresse", () => {
  it("sans CONFIRM_REGIME, un dossier draft reste DOSSIER_CREE même complet par ailleurs (contrat que la régression cassait silencieusement)", async () => {
    const state = {
      fiscalYear: baseFiscalYear(),
      properties: [baseProperty()],
      documents: [],
      extractions: [],
      validationItems: [],
      ledgerEntries: [],
      declarationDraft: { completedSteps: [], inpiConfirmedAt: "2026-01-02T00:00:00Z" },
      fileRegistry: new Map(),
    } as unknown as Parameters<Awaited<ReturnType<typeof loadReducer>>>[0];

    assert.equal(
      deriveStatutDossier(state as unknown as Parameters<typeof deriveStatutDossier>[0]),
      "DOSSIER_CREE",
    );
  });

  it("après CONFIRM_REGIME (ce que le panel corrigé dispatche à la complétion de F009), le dossier progresse au-delà de DOSSIER_CREE", async () => {
    const lmnpReducer = await loadReducer();
    const initial = {
      fiscalYear: baseFiscalYear(),
      properties: [baseProperty()],
      documents: [],
      extractions: [],
      validationItems: [],
      ledgerEntries: [],
      declarationDraft: { completedSteps: [], inpiConfirmedAt: "2026-01-02T00:00:00Z" },
      fileRegistry: new Map(),
    } as unknown as Parameters<Awaited<ReturnType<typeof loadReducer>>>[0];

    const next = lmnpReducer(initial, { type: "CONFIRM_REGIME", regime: "reel" });

    assert.ok(next.fiscalYear.regimeConfirmedAt, "regimeConfirmedAt doit être renseigné après CONFIRM_REGIME");
    const status = deriveStatutDossier(next as unknown as Parameters<typeof deriveStatutDossier>[0]);
    assert.notEqual(status, "DOSSIER_CREE", "avec regimeConfirmedAt posé, le statut doit dépasser DOSSIER_CREE");
    assert.equal(status, "BIEN_EN_COURS");
  });
});
