/* eslint-disable @typescript-eslint/no-explicit-any -- fixtures de brouillons hétérogènes (test) */
/**
 * GATE-1.1 — identité de CONTENU des documents (SHA-256 des octets) et risque de double comptage.
 * Invariant : SAME_DOCUMENT_CONTENT ≠ SAME_ACCOUNTING_FACT — le hash détecte, ne décide jamais (aucune charge supprimée ni fusionnée).
 * Run: npx tsx --test src/lib/lmnp/services/article-39c/silent-error-gate/documents.test.ts
 */
import "@/lab/v2-dossier/test-public-env";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import { isContentSha256, sha256HexOfBytes, sha256HexOfFile } from "@/lib/documents/content-identity";
import { DUPLICATE_DOCUMENT_CONTENT_CODE, chargeDraftsOfWorkspace, detectDuplicateDocumentCharges } from "@/lib/lmnp/services/documents/duplicate-document-charges";
import { deriveExpenseIdFromDocument } from "@/runtime/capabilities/f012/expense";
import { expense, roundtrip } from "./../article-39c-test-fixtures";
import { caseDossier, genProd, multiDossier } from "./fixtures.test";

const enc = (s: string) => new TextEncoder().encode(s);
const PDF_A = enc("%PDF-1.4 facture assurance PNO 400,00 EUR du 01/03/2026 — exemplaire A");
const PDF_B = enc("%PDF-1.4 facture assurance PNO 400,00 EUR du 01/03/2026 — exemplaire B (octets différents)");

type Doc = { id: string; fileName: string; bytes: Uint8Array | undefined; uploadedAt?: string; ocr?: string; propertyId?: string };
const doc = async (d: Doc) => ({
  id: d.id, fiscalYearId: "fy-1", fiscalYear: 2026, fileName: d.fileName, mimeType: "application/pdf", sizeBytes: d.bytes?.length ?? 0, category: "charges", documentType: "unknown",
  status: "uploaded", ...(d.propertyId ? { propertyId: d.propertyId } : {}), uploadedAt: d.uploadedAt ?? "2026-03-02T00:00:00.000Z", ...(d.ocr ? { chargeParserCorpus: d.ocr } : {}),
  ...(d.bytes ? { contentSha256: await sha256HexOfBytes(d.bytes) } : {}),
});
const exp = (id: string, documentId: string, over: Record<string, unknown> = {}) =>
  expense({ id, category: "assurance_pno", montant: 400, documentId, dateDepense: "2026-03-01", description: "Facture assurance", insuranceKind: "gli", ...over } as any);
const dossier = (expenses: any[]): any => caseDossier({ E: 12000, dotation: 0, extra: { collected: { documentExpenses: expenses } as any } });
const build = async (docs: Doc[], expenses: any[]) => ({ ...dossier(expenses), documents: await Promise.all(docs.map(doc)) }) as PersistedWorkspace;
const blockedByDuplicate = (g: any) => g.status === "blocked" && (g.blockingReasons ?? []).some((b: any) => b.code === DUPLICATE_DOCUMENT_CONTENT_CODE);

describe("GATE-1.1 — identité de contenu : SHA-256 des octets originaux", () => {
  it("vecteur connu (« abc ») ; octets Uint8Array = Blob ; format 64 hex minuscules ; jamais le contenu", async () => {
    const h = await sha256HexOfBytes(enc("abc"));
    assert.equal(h, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    assert.equal(await sha256HexOfFile(new Blob([enc("abc")])), h);
    assert.ok(isContentSha256(h) && !isContentSha256(h.toUpperCase()) && !isContentSha256("abc"));
    assert.ok(h.length === 64 && !h.includes("abc"));
  });
  it("calculé sur les OCTETS : nom, métadonnées, texte OCR, montant et date ne l'influencent pas", async () => {
    const a = await doc({ id: "d1", fileName: "facture.pdf", bytes: PDF_A, uploadedAt: "2026-03-02T00:00:00.000Z", ocr: "Assurance 400,00" });
    const renamed = await doc({ id: "d2", fileName: "scan_final_v2.pdf", bytes: PDF_A, uploadedAt: "2026-09-09T00:00:00.000Z", ocr: "tout autre texte" });
    const other = await doc({ id: "d3", fileName: "facture.pdf", bytes: PDF_B, ocr: "Assurance 400,00" });
    assert.equal(a.contentSha256, renamed.contentSha256, "D2/D3 : même contenu, nom et métadonnées différents");
    assert.notEqual(a.contentSha256, other.contentSha256, "D4/D5 : mêmes nom / OCR, octets différents");
  });
  it("reducer : empreinte posée si valide, ignorée si invalide ; REGISTER_FILE (fichier remplacé) l'invalide", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://test.invalid.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
    const reducer: any = (await import("@/lib/lmnp/store/reducer")).lmnpReducer;
    const base: any = { ...(caseDossier({ E: 1, dotation: 0 }) as any), fileRegistry: new Map(), documents: [await doc({ id: "d1", fileName: "a.pdf", bytes: undefined })] };
    const sha = await sha256HexOfBytes(PDF_A);
    const set = reducer(base, { type: "DOCUMENT_SET_CONTENT_SHA256", documentId: "d1", sha256: sha });
    assert.equal(set.documents[0].contentSha256, sha);
    assert.equal(reducer(base, { type: "DOCUMENT_SET_CONTENT_SHA256", documentId: "d1", sha256: "pas-un-hash" }).documents[0].contentSha256, undefined);
    assert.equal(reducer(base, { type: "DOCUMENT_SET_CONTENT_SHA256", documentId: "inconnu", sha256: sha }), base);
    const replaced = reducer(set, { type: "REGISTER_FILE", documentId: "d1", file: new File([PDF_B as BlobPart], "a.pdf") });
    assert.equal(replaced.documents[0].contentSha256, undefined, "fichier remplacé : empreinte non démontrée tant qu'elle n'est pas recalculée");
  });
});

describe("GATE-1.1 — détection D1…D7 : BLOQUÉ avant génération, jamais de suppression ni de fusion automatique", () => {
  it("D1/D2/D3 — même fichier déposé deux fois (renommé, métadonnées différentes), deux charges de 400 € : BLOQUÉ ; aucune charge supprimée, aucun total produit", async () => {
    const ws = await build(
      [{ id: "doc-0", fileName: "facture.pdf", bytes: PDF_A }, { id: "doc-1", fileName: "copie (1).pdf", bytes: PDF_A, uploadedAt: "2026-07-01T00:00:00.000Z" }],
      [exp("e0", "doc-0"), exp("e1", "doc-1")],
    );
    const g: any = genProd(ws);
    assert.equal(blockedByDuplicate(g), true, JSON.stringify(g.blockingReasons ?? g.anomalies));
    assert.equal(g.fiscalResult, undefined);
    const conflicts = detectDuplicateDocumentCharges({ documents: ws.documents, drafts: chargeDraftsOfWorkspace(ws.declarationDraft), fiscalYear: 2026 });
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0]!.relation, "SAME_DOCUMENT_CONTENT");
    assert.deepEqual(conflicts[0]!.expenseIds, ["e0", "e1"]);
    // les deux charges sont intactes dans le brouillon
    assert.equal((ws.declarationDraft as any).chargesAssistantState.collected.documentExpenses.length, 2);
  });

  it("D4 — même montant, même date, PDF différents (octets différents) : PAS un doublon documentaire → les deux charges comptées (800 €), aucune fusion sur l'identité insuffisante", async () => {
    const g: any = genProd(await build([{ id: "doc-0", fileName: "f.pdf", bytes: PDF_A }, { id: "doc-1", fileName: "f.pdf", bytes: PDF_B }], [exp("e0", "doc-0"), exp("e1", "doc-1")]));
    assert.equal(g.status, "generated");
    assert.equal(g.rfs.fiscalResult.charges.totalDeductible, 800);
  });

  it("D5 — même texte OCR, octets différents : identité documentaire NON certaine → aucune détection", async () => {
    const ws = await build([{ id: "doc-0", fileName: "f.pdf", bytes: PDF_A, ocr: "MÊME TEXTE OCR" }, { id: "doc-1", fileName: "f.pdf", bytes: PDF_B, ocr: "MÊME TEXTE OCR" }], [exp("e0", "doc-0"), exp("e1", "doc-1")]);
    assert.deepEqual(detectDuplicateDocumentCharges({ documents: ws.documents, drafts: chargeDraftsOfWorkspace(ws.declarationDraft), fiscalYear: 2026 }), []);
  });

  it("D6 — un document, une charge : une seule charge ; un décompte à lignes distinctes d'UN même document (identifiants dérivés distincts) : deux charges légitimes, non bloqué", async () => {
    const one: any = genProd(await build([{ id: "doc-0", fileName: "f.pdf", bytes: PDF_A }], [exp("e0", "doc-0")]));
    assert.equal(one.status, "generated");
    assert.equal(one.rfs.fiscalResult.charges.totalDeductible, 400);
    const lines = [exp(deriveExpenseIdFromDocument("doc-0", "ligne-1"), "doc-0", { montant: 150 }), exp(deriveExpenseIdFromDocument("doc-0", "ligne-2"), "doc-0", { montant: 250 })];
    const two: any = genProd(await build([{ id: "doc-0", fileName: "f.pdf", bytes: PDF_A }], lines));
    assert.equal(two.status, "generated");
    assert.equal(two.rfs.fiscalResult.charges.totalDeductible, 400);
  });

  it("D7 — un même document lié à deux charges SANS identité de ligne démontrée (identifiants non dérivés) : BLOQUÉ ; deux documents de même contenu liés à deux charges : BLOQUÉ", async () => {
    const same: any = genProd(await build([{ id: "doc-0", fileName: "f.pdf", bytes: PDF_A }], [exp("a", "doc-0"), exp("b", "doc-0")]));
    assert.equal(blockedByDuplicate(same), true);
    const copy: any = genProd(await build([{ id: "doc-0", fileName: "f.pdf", bytes: PDF_A }, { id: "doc-9", fileName: "g.pdf", bytes: PDF_A }], [exp("e0", "doc-0"), exp(deriveExpenseIdFromDocument("doc-9", "ligne-1"), "doc-9")]));
    assert.equal(blockedByDuplicate(copy), true);
  });

  it("empreinte absente (non calculée) : identité inconnue — ni identique ni distincte, aucune détection (limite documentée), jamais de blocage arbitraire", async () => {
    const g: any = genProd(await build([{ id: "doc-0", fileName: "f.pdf", bytes: undefined }, { id: "doc-1", fileName: "f.pdf", bytes: undefined }], [exp("e0", "doc-0"), exp("e1", "doc-1")]));
    assert.equal(g.status, "generated");
  });

  it("dossier LEGACY (F013 v1) : même protection (le risque est indépendant du mode de calcul)", async () => {
    const { legacyDossier } = await import("./../exact-generation-fixtures");
    const ex: any = await build([{ id: "doc-0", fileName: "f.pdf", bytes: PDF_A }, { id: "doc-1", fileName: "f.pdf", bytes: PDF_A }], [exp("e0", "doc-0"), exp("e1", "doc-1")]);
    const legacyBase: any = legacyDossier({ cash: 12000, dotation: 0 });
    const legacy = { ...legacyBase, documents: ex.documents, declarationDraft: { ...legacyBase.declarationDraft, chargesAssistantState: ex.declarationDraft.chargesAssistantState } };
    assert.equal(blockedByDuplicate(genProd(legacy)), true);
  });
});

describe("GATE-1.1 — reload, multi A/B, exercice, suppression / re-upload, remplacement de fichier", () => {
  it("reload : l'empreinte survit au snapshot sérialisé et le blocage est identique", async () => {
    const ws = await build([{ id: "doc-0", fileName: "f.pdf", bytes: PDF_A }, { id: "doc-1", fileName: "f.pdf", bytes: PDF_A }], [exp("e0", "doc-0"), exp("e1", "doc-1")]);
    const reloaded = roundtrip(ws).reloaded;
    assert.equal((reloaded.documents[0] as any).contentSha256, (ws.documents[0] as any).contentSha256);
    assert.equal(blockedByDuplicate(genProd(reloaded)), true);
  });

  it("multi A/B : le même fichier justifie une charge du bien A ET une du bien B → BLOQUÉ (propriétés signalées) ; une seule charge dans A → non bloqué", async () => {
    const mk = async (inB: boolean) => {
      const ws: any = multiDossier({ biens: [{ id: "A", E: 10000, dotation: 0, extra: { collected: { documentExpenses: [exp("eA", "doc-0")] } as any } }, { id: "B", E: 8000, dotation: 0, ...(inB ? { extra: { collected: { documentExpenses: [exp("eB", "doc-1")] } as any } } : {}) }] });
      return { ...ws, documents: await Promise.all([doc({ id: "doc-0", fileName: "f.pdf", bytes: PDF_A, propertyId: "A" }), doc({ id: "doc-1", fileName: "f.pdf", bytes: PDF_A, propertyId: "B" })]) } as PersistedWorkspace;
    };
    const both = await mk(true);
    const c = detectDuplicateDocumentCharges({ documents: both.documents, drafts: chargeDraftsOfWorkspace(both.declarationDraft), fiscalYear: 2026 });
    assert.deepEqual(c[0]?.propertyIds, ["A", "B"]);
    assert.equal(blockedByDuplicate(genProd(both)), true);
    assert.equal(genProd(await mk(false)).status, "generated");
  });

  it("exercice différent : une charge de l'exercice 2025 sur un contenu identique n'est pas une charge de 2026 → pas de conflit", async () => {
    const g: any = genProd(await build([{ id: "doc-0", fileName: "f.pdf", bytes: PDF_A }, { id: "doc-1", fileName: "f.pdf", bytes: PDF_A }], [exp("e0", "doc-0"), exp("e1", "doc-1", { exerciceFiscal: 2025 })]));
    assert.equal(g.status, "generated");
  });

  it("suppression puis re-upload : retirer la copie débloque (une charge) ; re-déposer le même contenu avec une nouvelle charge re-bloque ; le système ne supprime jamais rien", async () => {
    const docs = [{ id: "doc-0", fileName: "f.pdf", bytes: PDF_A }, { id: "doc-1", fileName: "f.pdf", bytes: PDF_A }];
    assert.equal(blockedByDuplicate(genProd(await build(docs, [exp("e0", "doc-0"), exp("e1", "doc-1")]))), true);
    const removed: any = genProd(await build(docs.slice(0, 1), [exp("e0", "doc-0")]));
    assert.equal(removed.status, "generated");
    assert.equal(removed.rfs.fiscalResult.charges.totalDeductible, 400, "la charge conservée est inchangée (même classe, même montant)");
    const reuploaded = [...docs.slice(0, 1), { id: "doc-2", fileName: "nouveau.pdf", bytes: PDF_A }];
    assert.equal(blockedByDuplicate(genProd(await build(reuploaded, [exp("e0", "doc-0"), exp("e2", "doc-2")]))), true);
  });

  it("remplacement du fichier : l'ancienne qualification (PNO « oui ») devient périmée — jamais rejouée sur le nouveau document", async () => {
    const { answer, ofKind } = await import("./flows");
    const { buildConsolidatedArticle39cFromWorkspace } = await import("./../consolidation");
    const mk = (docId: string, q?: unknown) => caseDossier({ E: 12000, dotation: 0, extra: { collected: { documentExpenses: [expense({ id: "ass-1", category: "assurance_pno", montant: 400, documentId: docId, insuranceKind: "logement" } as any)] } as any, ...(q ? { bien: { qualifications: q as any } } : {}) } });
    const yes = await answer(mk("doc-1"), "PNO_CONFIRMATION", "YES");
    const replaced = mk("doc-2", (yes.declarationDraft as any).article39cQualifications);
    const k = buildConsolidatedArticle39cFromWorkspace({ workspace: roundtrip(replaced).reloaded, expectedDossierId: "dossier-1" }).contributions.find((x) => x.contributionId.includes("assurance-pno"))!;
    assert.equal(k.class, "NEEDS_QUALIFICATION");
    assert.equal(ofKind(replaced, "PNO_CONFIRMATION").length, 1);
  });

  it("le hash ne décide jamais : un document identique ne change ni la classe ni le montant d'une charge unique", async () => {
    const solo: any = genProd(await build([{ id: "doc-0", fileName: "f.pdf", bytes: PDF_A }], [exp("e0", "doc-0")]));
    const noHash: any = genProd(await build([{ id: "doc-0", fileName: "f.pdf", bytes: undefined }], [exp("e0", "doc-0")]));
    assert.deepEqual(solo.rfs.fiscalResult.charges, noHash.rfs.fiscalResult.charges);
  });
});
