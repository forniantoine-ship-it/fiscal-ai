import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

test("upload explicite A/B ignore le pointeur global mutable et insère la ligne dans le bon dossier", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://test.invalid.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
  const { resolveUploadDossierId, documentInsertForUpload } = await import("./uploadDocument");
  let legacyReads = 0;
  const legacy = () => { legacyReads++; return B; };
  for (const id of [A, B]) {
    const selected = resolveUploadDossierId(id, legacy);
    assert.equal(selected, id);
    const row = documentInsertForUpload({ userId: "user", dossierId: selected!, fileName: "synthetic.pdf",
      filePath: `test/${id}`, fiscalYear: 2025, documentRole: "annual_evidence" });
    assert.equal(row.dossier_id, id);
    assert.equal(row.fiscal_year, 2025);
  }
  assert.equal(legacyReads, 0);
  assert.equal(resolveUploadDossierId("", legacy), null);
  assert.equal(resolveUploadDossierId("not-a-uuid", legacy), null);
  assert.equal(legacyReads, 0);
  assert.equal(resolveUploadDossierId(undefined, legacy), B);
  assert.equal(legacyReads, 1);
});

test("tous les points d'upload des owners/Documents transmettent le dossier du workspace", () => {
  const callsites = [
    "../components/lmnp/assistants/F009ActiviteAssistantPanel.tsx",
    "../components/lmnp/assistants/F010LogementAssistantPanel.tsx",
    "../components/lmnp/assistants/F011FinancementAssistantPanel.tsx",
    "../components/lmnp/assistants/F012ChargesAssistantPanel.tsx",
    "../components/lmnp/activite/ActiviteDocumentStep.tsx",
    "../components/lmnp/documents/LogementDocumentStep.tsx",
    "../components/lmnp/documents/CreditDocumentStep.tsx",
    "../components/lmnp/documents/ChargesDocumentStep.tsx",
    "../components/lmnp/documents/RevenusDocumentStep.tsx",
    "../components/lmnp/documents/DocumentsWorkspace.tsx",
    "../components/lmnp/documents/AmortissementDocumentStep.tsx",
    "../design-system/components/UploadZone.tsx",
  ];
  for (const path of callsites) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(source, /dossierId[:=]/, path);
  }
  for (const path of ["./lmnp/services/f012/f012-impots-document-upload.ts",
    "./lmnp/services/f012/f012-documentary-review-upload.ts"]) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(source, /deps\.dossierId !== undefined/, path);
  }
});
