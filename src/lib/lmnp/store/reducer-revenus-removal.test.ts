import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { FiscalYear, LmnpDocument, Property, RevenueGptSession } from "../types";

/**
 * Cycle 15B — Test G, wiring réel du reducer (pas seulement la fonction pure
 * removeDocumentFromRevenueSession, déjà testée avec de vrais .xlsx dans
 * revenue-gpt-ui-prefill-multi-upload.test.ts). reducer.ts importe
 * transitivement src/lib/supabase.ts (client créé au chargement du module) —
 * import dynamique après avoir posé des valeurs factices, comme au Cycle 15A.
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

function revenusDocument(id: string): LmnpDocument {
  return {
    id,
    fiscalYearId: "fy-1",
    fileName: "releve.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    sizeBytes: 100,
    category: "revenus",
    documentType: "rent_bank_statement",
    status: "analyzed",
    uploadedAt: "2025-01-01T00:00:00Z",
  };
}

function sessionWithOneTransaction(documentId: string): RevenueGptSession {
  return {
    mode: "upload",
    properties: [
      {
        id: "prop-1",
        label: "Bien test",
        rows: [{ monthKey: "2025-01", month: "Janvier", loyers: 5000, autresRevenus: 0, charges: 0 }],
        transactions: [
          {
            id: "t1",
            date: "15/01/2025",
            description: "Loyer",
            amount: 5000,
            direction: "credit",
            category: "rent",
            sourceDocumentId: documentId,
            structuredMapping: true,
            monthLabel: "Janvier",
          },
        ],
        lowConfidenceTransactions: [],
        isolatedTransactions: [],
        gridUserEdited: false,
      },
    ],
  };
}

describe("Cycle 15B — REMOVE_DOCUMENT retire la contribution revenus (wiring reducer réel)", () => {
  it("supprimer le document revenus vide la session et invalide revenusAssistant/revenusConfirmedAt", async () => {
    const lmnpReducer = await loadReducer();

    const state = {
      fiscalYear: baseFiscalYear(),
      properties: [baseProperty()],
      documents: [revenusDocument("docA")],
      extractions: [],
      validationItems: [],
      ledgerEntries: [],
      declarationDraft: {
        completedSteps: ["revenus"],
        revenueGptSession: sessionWithOneTransaction("docA"),
        revenusAssistant: {
          exerciceFiscal: 2025,
          totalRecettes: 5000,
          loyersEncaisses: 5000,
          indemnitesAssurance: 0,
          recettesPlateforme: 0,
          ajustementsJanDec: 0,
          moisLocationEffectifs: 12,
          fieldSources: {},
          computedAt: "2025-01-01T00:00:00.000Z",
        },
        revenusConfirmedAt: "2025-01-01T00:00:00.000Z",
      },
      fileRegistry: new Map(),
    } as unknown as Parameters<Awaited<ReturnType<typeof loadReducer>>>[0];

    const next = lmnpReducer(state, { type: "REMOVE_DOCUMENT", documentId: "docA" });

    assert.equal(next.documents.some((d) => d.id === "docA"), false, "document retiré");
    assert.equal(next.declarationDraft?.revenusAssistant, undefined, "revenusAssistant invalidé — un total confirmé qui n'est plus le bon ne doit pas rester visible");
    assert.equal(next.declarationDraft?.revenusConfirmedAt, undefined, "verrouillage réciproque levé — l'utilisateur peut rouvrir l'upload");
    const remainingTotal = next.declarationDraft?.revenueGptSession?.properties[0]?.rows.reduce(
      (sum, row) => sum + row.loyers,
      0,
    );
    assert.equal(remainingTotal, 0, "la contribution du document supprimé n'apparaît plus dans la grille");
  });

  it("supprimer un document d'une autre catégorie (charges) ne touche pas les revenus", async () => {
    const lmnpReducer = await loadReducer();

    const chargesDoc: LmnpDocument = {
      id: "docCharges",
      fiscalYearId: "fy-1",
      fileName: "assurance.pdf",
      mimeType: "application/pdf",
      sizeBytes: 100,
      category: "charges",
      documentType: "rent_bank_statement",
      status: "analyzed",
      uploadedAt: "2025-01-01T00:00:00Z",
    };

    const state = {
      fiscalYear: baseFiscalYear(),
      properties: [baseProperty()],
      documents: [revenusDocument("docA"), chargesDoc],
      extractions: [],
      validationItems: [],
      ledgerEntries: [],
      declarationDraft: {
        completedSteps: ["revenus"],
        revenueGptSession: sessionWithOneTransaction("docA"),
        revenusAssistant: {
          exerciceFiscal: 2025,
          totalRecettes: 5000,
          loyersEncaisses: 5000,
          indemnitesAssurance: 0,
          recettesPlateforme: 0,
          ajustementsJanDec: 0,
          moisLocationEffectifs: 12,
          fieldSources: {},
          computedAt: "2025-01-01T00:00:00.000Z",
        },
        revenusConfirmedAt: "2025-01-01T00:00:00.000Z",
      },
      fileRegistry: new Map(),
    } as unknown as Parameters<Awaited<ReturnType<typeof loadReducer>>>[0];

    const next = lmnpReducer(state, { type: "REMOVE_DOCUMENT", documentId: "docCharges" });

    assert.equal(next.declarationDraft?.revenusAssistant?.totalRecettes, 5000, "revenusAssistant inchangé — le document supprimé n'était pas un document revenus");
  });
});

/**
 * Cycle 18 — Cas A (audit "Modifier" / verrouillage) : des revenus confirmés
 * par l'assistant CONVERSATIONNEL (aucun document source, `revenusExtraction`
 * jamais posé) ne pouvaient être invalidés par AUCUN mécanisme existant —
 * `REMOVE_DOCUMENT` ne s'applique qu'aux revenus issus d'un document, et
 * `F013RevenusAssistantPanel` n'offrait avant ce cycle aucune sortie de son
 * état "complete" en lecture seule. Dead-end réel, pas seulement une
 * confusion de navigation.
 *
 * Correctif (F013RevenusAssistantPanel.tsx, bouton "Modifier mes revenus") :
 * réutilise le SEUL mécanisme déjà prouvé pour lever le verrouillage
 * réciproque — un DECLARATION_PATCH_DRAFT effaçant explicitement
 * `revenusAssistant`/`revenusConfirmedAt`, exactement comme le fait déjà
 * REMOVE_DOCUMENT côté upload. Ce test verrouille que ce dispatch produit
 * bien le même effet côté reducer (le composant, lui, redémarre en plus le
 * questionnaire — non testable sans rendu réel, mais la mécanique de données
 * est identique et déjà éprouvée).
 */
describe("Cycle 18 — Cas A : lever le verrouillage de revenus confirmés sans document source", () => {
  it("DECLARATION_PATCH_DRAFT({revenusAssistant: undefined, revenusConfirmedAt: undefined}) lève le verrou, sans document à supprimer", async () => {
    const lmnpReducer = await loadReducer();

    const state = {
      fiscalYear: baseFiscalYear(),
      properties: [baseProperty()],
      documents: [], // aucun document — revenus saisis via l'assistant conversationnel
      extractions: [],
      validationItems: [],
      ledgerEntries: [],
      declarationDraft: {
        completedSteps: ["revenus"],
        revenusAssistant: {
          exerciceFiscal: 2025,
          totalRecettes: 12000,
          loyersEncaisses: 12000,
          indemnitesAssurance: 0,
          recettesPlateforme: 0,
          ajustementsJanDec: 0,
          moisLocationEffectifs: 12,
          fieldSources: {},
          computedAt: "2025-01-01T00:00:00.000Z",
        },
        revenusConfirmedAt: "2025-01-01T00:00:00.000Z",
      },
      fileRegistry: new Map(),
    } as unknown as Parameters<Awaited<ReturnType<typeof loadReducer>>>[0];

    // Avant correctif : aucune action de ce reducer ne pouvait atteindre cet
    // état (pas de document à retirer) — seul un nouveau chemin explicite
    // (le bouton "Modifier mes revenus") peut désormais l'invalider.
    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { revenusAssistant: undefined, revenusConfirmedAt: undefined },
    });

    assert.equal(next.declarationDraft?.revenusAssistant, undefined, "revenusAssistant effacé — le verrou réciproque avec l'upload est levé");
    assert.equal(next.declarationDraft?.revenusConfirmedAt, undefined, "revenusConfirmedAt effacé");
  });
});
