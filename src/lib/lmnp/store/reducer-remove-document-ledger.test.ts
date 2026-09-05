import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { FiscalYear, LedgerEntry, LmnpDocument, Property } from "../types";

/**
 * P0-2b (audit "périmètre fiscal / documentaire", défaut D6) — wiring réel du
 * reducer (pas une fonction isolée) : REMOVE_DOCUMENT retirait déjà
 * extractions/validationItems du document supprimé, mais laissait
 * ledgerEntries actives — une donnée dérivée d'un document qui n'existe plus
 * restait visible comme si elle l'était encore. reducer.ts importe
 * transitivement src/lib/supabase.ts (client créé au chargement du module) —
 * import dynamique après avoir posé des valeurs factices, même pattern que
 * reducer-revenus-removal.test.ts.
 */
async function loadReducer() {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://test.invalid.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
  const mod = await import("./reducer");
  return mod.lmnpReducer;
}

function baseFiscalYear(): FiscalYear {
  return {
    id: "fy-1",
    year: 2025,
    status: "draft",
    regime: "reel",
    propertyIds: ["prop-1"],
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
  };
}

function baseProperty(): Property {
  return { id: "prop-1", label: "", address: "", city: "", postalCode: "" };
}

function chargesDocument(id: string): LmnpDocument {
  return {
    id,
    fiscalYearId: "fy-1",
    fileName: `${id}.pdf`,
    mimeType: "application/pdf",
    sizeBytes: 100,
    category: "charges",
    documentType: "insurance_invoice",
    status: "analyzed",
    uploadedAt: "2025-01-01T00:00:00Z",
  };
}

/** Ledger entry active, issue d'un seul document — reproduit ce que produit autoSyncDocumentToLedger(). */
function ledgerEntryFromDocument(id: string, documentId: string): LedgerEntry {
  return {
    id,
    fiscalYearId: "fy-1",
    propertyId: "prop-1",
    domain: "expense",
    fieldKey: "expense.insurance",
    value: { type: "money", amountCents: 45000, currency: "EUR" },
    validationItemId: `vi-${documentId}`,
    sourceDocumentIds: [documentId],
    origin: "ai_auto_synced",
    status: "active",
    version: 1,
    createdAt: "2025-01-01T00:00:00.000Z",
  };
}

describe("P0-2b D6 — REMOVE_DOCUMENT voide les ledgerEntries du document supprimé (wiring reducer réel)", () => {
  it("document + ledgerEntry liée → REMOVE_DOCUMENT → document/extraction/validationItem absents, ledgerEntry voidée", async () => {
    const lmnpReducer = await loadReducer();

    const state = {
      fiscalYear: baseFiscalYear(),
      properties: [baseProperty()],
      documents: [chargesDocument("docA")],
      extractions: [
        { id: "ext-1", documentId: "docA", fiscalYearId: "fy-1", fieldKey: "expense.insurance", rawValue: "450", normalizedValue: { type: "money", amountCents: 45000, currency: "EUR" } },
      ],
      validationItems: [
        { id: "vi-docA", fiscalYearId: "fy-1", propertyId: "prop-1", fieldKey: "expense.insurance", label: "Assurance", proposedValue: { type: "money", amountCents: 45000, currency: "EUR" }, status: "approved", confidence: 0.95, documentId: "docA", extractionIds: ["ext-1"], isRequired: false, updatedAt: "2025-01-01T00:00:00.000Z" },
      ],
      ledgerEntries: [ledgerEntryFromDocument("ledger-1", "docA")],
      declarationDraft: { completedSteps: [] },
      fileRegistry: new Map(),
    } as unknown as Parameters<Awaited<ReturnType<typeof loadReducer>>>[0];

    const next = lmnpReducer(state, { type: "REMOVE_DOCUMENT", documentId: "docA" });

    assert.equal(next.documents.some((d) => d.id === "docA"), false, "document retiré");
    assert.equal(next.extractions.some((e) => e.documentId === "docA"), false, "extraction retirée");
    assert.equal(next.validationItems.some((v) => v.documentId === "docA"), false, "validationItem retiré");

    const ledgerEntry = next.ledgerEntries.find((e) => e.id === "ledger-1");
    if (!ledgerEntry) throw new Error("ledgerEntry attendue (voidée, pas supprimée physiquement)");
    assert.equal(ledgerEntry.status, "voided", "la ledgerEntry issue du document supprimé ne doit plus rester active");
  });

  it("document A + ledgerEntry A, document B + ledgerEntry B → suppression de A seulement → ledgerEntry A voidée, ledgerEntry B conservée active", async () => {
    const lmnpReducer = await loadReducer();

    const state = {
      fiscalYear: baseFiscalYear(),
      properties: [baseProperty()],
      documents: [chargesDocument("docA"), chargesDocument("docB")],
      extractions: [],
      validationItems: [],
      ledgerEntries: [
        ledgerEntryFromDocument("ledger-A", "docA"),
        ledgerEntryFromDocument("ledger-B", "docB"),
      ],
      declarationDraft: { completedSteps: [] },
      fileRegistry: new Map(),
    } as unknown as Parameters<Awaited<ReturnType<typeof loadReducer>>>[0];

    const next = lmnpReducer(state, { type: "REMOVE_DOCUMENT", documentId: "docA" });

    const ledgerA = next.ledgerEntries.find((e) => e.id === "ledger-A");
    const ledgerB = next.ledgerEntries.find((e) => e.id === "ledger-B");
    if (!ledgerA || !ledgerB) throw new Error("les deux ledgerEntries doivent rester présentes (voidage, jamais suppression physique)");

    assert.equal(ledgerA.status, "voided", "ledgerEntry du document supprimé (A) voidée");
    assert.equal(ledgerB.status, "active", "ledgerEntry d'un autre document (B) non affectée");
    assert.equal(next.documents.some((d) => d.id === "docB"), true, "document B non affecté");
  });

  it("déjà voidée avant la suppression → reste voidée, aucune erreur (idempotence du filtre status==='active')", async () => {
    const lmnpReducer = await loadReducer();

    const alreadyVoided: LedgerEntry = { ...ledgerEntryFromDocument("ledger-voided", "docA"), status: "voided" };

    const state = {
      fiscalYear: baseFiscalYear(),
      properties: [baseProperty()],
      documents: [chargesDocument("docA")],
      extractions: [],
      validationItems: [],
      ledgerEntries: [alreadyVoided],
      declarationDraft: { completedSteps: [] },
      fileRegistry: new Map(),
    } as unknown as Parameters<Awaited<ReturnType<typeof loadReducer>>>[0];

    const next = lmnpReducer(state, { type: "REMOVE_DOCUMENT", documentId: "docA" });

    const ledgerEntry = next.ledgerEntries.find((e) => e.id === "ledger-voided");
    if (!ledgerEntry) throw new Error("ledgerEntry attendue");
    assert.equal(ledgerEntry.status, "voided", "reste voidée");
  });
});
