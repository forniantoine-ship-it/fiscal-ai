/**
 * Lot 2 — fiscal origin helpers (pure).
 * Run: npx tsx --test src/lib/lmnp/dossier/document-fiscal-origin.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  canInjectRemoteDocumentIntoWorkspace,
  canMergeRemoteMetadataIntoLocal,
  isEligibleAnnualEvidenceForFiscalYear,
  proveFiscalYearFromSnapshots,
  resolveEffectiveFiscalYear,
  shouldDestroyServerArtifactsOnRemove,
  toDurableHistoricalReference,
} from "./document-fiscal-origin";

describe("document-fiscal-origin — annual isolation", () => {
  it("1 — annual evidence N is eligible for workspace N only", () => {
    const origin = { fiscalYear: 2025, documentRole: "annual_evidence" as const };
    assert.equal(canInjectRemoteDocumentIntoWorkspace(origin, 2025), true);
    assert.equal(isEligibleAnnualEvidenceForFiscalYear(origin, 2025), true);
    assert.equal(canInjectRemoteDocumentIntoWorkspace(origin, 2026), false);
    assert.equal(isEligibleAnnualEvidenceForFiscalYear(origin, 2026), false);
  });

  it("4 — never falls back to the active year when fiscal year is unknown", () => {
    const origin = { fiscalYear: null, documentRole: "annual_evidence" as const };
    assert.equal(canInjectRemoteDocumentIntoWorkspace(origin, 2026), false);
    assert.equal(isEligibleAnnualEvidenceForFiscalYear(origin, 2026), false);
  });
});

describe("document-fiscal-origin — legacy", () => {
  it("5 — provable snapshot association yields a deterministic year", () => {
    const year = proveFiscalYearFromSnapshots("doc-1", [
      { fiscalYear: 2025, documentIds: ["doc-1", "other"] },
      { fiscalYear: 2026, documentIds: ["unrelated"] },
    ]);
    assert.equal(year, 2025);
    assert.equal(
      resolveEffectiveFiscalYear({
        serverFiscalYear: null,
        documentId: "doc-1",
        snapshots: [
          { fiscalYear: 2025, documentIds: ["doc-1"] },
          { fiscalYear: 2026, documentIds: [] },
        ],
      }),
      2025,
    );
  });

  it("6 — ambiguous legacy stays unresolved (fail-closed)", () => {
    assert.equal(
      proveFiscalYearFromSnapshots("doc-1", [
        { fiscalYear: 2025, documentIds: ["doc-1"] },
        { fiscalYear: 2026, documentIds: ["doc-1"] },
      ]),
      undefined,
    );
    assert.equal(
      canMergeRemoteMetadataIntoLocal({
        hasLocalDocument: false,
        origin: { fiscalYear: null },
        workspaceFiscalYear: 2026,
      }),
      false,
    );
  });

  it("local snapshot presence allows metadata merge without inventing a year", () => {
    assert.equal(
      canMergeRemoteMetadataIntoLocal({
        hasLocalDocument: true,
        origin: { fiscalYear: null },
        workspaceFiscalYear: 2026,
      }),
      true,
    );
  });
});

describe("document-fiscal-origin — durable reference", () => {
  it("7-12 — same id/path/propertyId, not annual evidence of another year", () => {
    const ref = toDurableHistoricalReference({
      documentId: "doc-acte",
      storagePath: "user/acte.pdf",
      fileName: "acte.pdf",
      originFiscalYear: 2025,
      propertyId: "prop-1",
    });
    assert.equal(ref.documentId, "doc-acte");
    assert.equal(ref.storagePath, "user/acte.pdf");
    assert.equal(ref.propertyId, "prop-1");
    assert.equal(ref.documentRole, "durable_reference");
    assert.equal(
      isEligibleAnnualEvidenceForFiscalYear(
        { fiscalYear: ref.originFiscalYear, documentRole: ref.documentRole },
        2026,
      ),
      false,
    );
    assert.equal(
      canInjectRemoteDocumentIntoWorkspace(
        { fiscalYear: ref.originFiscalYear, documentRole: ref.documentRole },
        2025,
      ),
      true,
    );
    assert.equal(
      canInjectRemoteDocumentIntoWorkspace(
        { fiscalYear: ref.originFiscalYear, documentRole: ref.documentRole },
        2026,
      ),
      false,
    );
  });
});

describe("document-fiscal-origin — delete / replace safety", () => {
  it("15 — durable reference never destroys server artifacts", () => {
    assert.equal(
      shouldDestroyServerArtifactsOnRemove({ documentRole: "durable_reference" }),
      false,
    );
  });

  it("15b — foreign-year annual evidence unlinks locally only", () => {
    assert.equal(
      shouldDestroyServerArtifactsOnRemove({
        documentRole: "annual_evidence",
        originFiscalYear: 2025,
        activeFiscalYear: 2026,
      }),
      false,
    );
  });

  it("annual evidence of the active year may still be destroyed", () => {
    assert.equal(
      shouldDestroyServerArtifactsOnRemove({
        documentRole: "annual_evidence",
        originFiscalYear: 2026,
        activeFiscalYear: 2026,
      }),
      true,
    );
  });
});
