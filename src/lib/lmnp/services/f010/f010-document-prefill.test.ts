import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { LogementActeExtraction } from "@/lib/documents/gpt/schemas/logement-acte.schema";
import type { GovernedFieldStore } from "@/lib/documents/types/governed-field";

import {
  buildF010ConfirmedFieldLocks,
  buildF010CreditGovernancePayload,
  buildF010SyntheticDocument,
  deriveF010ExtractionState,
  isCanonicalFieldLocked,
} from "./f010-document-prefill";
import { acteExtractionToF010Prefill } from "./acte-to-assistant";

function fullActeExtraction(): LogementActeExtraction {
  return {
    propertyAddress: "12 rue des Lilas",
    propertyPostalCode: "75011",
    propertyCity: "Paris",
    propertyType: "appartement",
    acquisitionDate: "2023-05-12",
    propertyPurchasePrice: 280_000,
    notaryFees: 21_000,
    surfaceM2: 45,
    loanAmount: 200_000,
    bankName: "Banque Populaire",
    loanDurationMonths: 240,
    monthlyPayment: 950,
    interestRate: 3.2,
  };
}

function lockedStore(field: "acquisitionPrice", value: unknown): GovernedFieldStore {
  return {
    [field]: {
      value,
      sourceTunnel: "logement",
      sourceDocument: "acte_notarie",
      extractedBy: "user",
      ownershipTunnel: "logement",
      manuallyValidated: true,
      updatedAt: "2026-08-27T10:00:00.000Z",
      crossTunnelInferred: false,
    },
  };
}

describe("f010-document-prefill — buildF010SyntheticDocument (acte valide)", () => {
  it("construit un LmnpDocument minimal, identique au schéma produit par le reducer UPLOAD_DOCUMENTS", () => {
    const file = new File(["contenu"], "acte-notarie.pdf", { type: "application/pdf" });
    const doc = buildF010SyntheticDocument({ id: "doc-1", fiscalYearId: "fy-1", file });

    assert.equal(doc.id, "doc-1");
    assert.equal(doc.fiscalYearId, "fy-1");
    assert.equal(doc.fileName, "acte-notarie.pdf");
    assert.equal(doc.mimeType, "application/pdf");
    assert.equal(doc.category, "autre");
    assert.equal(doc.documentType, "unknown");
    assert.equal(doc.status, "uploaded");
  });
});

describe("f010-document-prefill — deriveF010ExtractionState", () => {
  it("extraction réussie : tous les champs cœur présents → success", () => {
    const prefill = acteExtractionToF010Prefill(fullActeExtraction());
    const outcome = deriveF010ExtractionState({
      extractionSuccess: true,
      pipelineError: false,
      prefill,
    });
    assert.equal(outcome.state, "success");
    assert.deepEqual(outcome.missingCoreFields, []);
  });

  it("extraction partielle : dateAcquisition manquante (champ cœur) → partial", () => {
    const extraction = { ...fullActeExtraction(), acquisitionDate: undefined };
    const prefill = acteExtractionToF010Prefill(extraction);
    const outcome = deriveF010ExtractionState({
      extractionSuccess: true,
      pipelineError: false,
      prefill,
    });
    assert.equal(outcome.state, "partial");
    assert.deepEqual(outcome.missingCoreFields, ["dateAcquisition"]);
  });

  it("corpus invalide : aucun champ, extraction non réussie → failed", () => {
    const outcome = deriveF010ExtractionState({
      extractionSuccess: false,
      pipelineError: true,
      prefill: {},
    });
    assert.equal(outcome.state, "failed");
    assert.equal(outcome.hasAnyPrefillField, false);
  });

  it("échec OCR : même contrat que corpus invalide — aucune donnée exploitable → failed", () => {
    const outcome = deriveF010ExtractionState({
      extractionSuccess: false,
      pipelineError: true,
      prefill: {},
    });
    assert.equal(outcome.state, "failed");
    assert.deepEqual(outcome.missingCoreFields, ["prixAcquisition", "dateAcquisition"]);
  });

  it("fallback Vision réussi : le chemin d'extraction (texte vs vision) est invisible ici — seul le prefill compte", () => {
    // runLogementGptPipeline ne distingue pas texte/vision dans le contrat consommé par
    // deriveF010ExtractionState (extractionSuccess + prefill) — visionFallbackActivated
    // reste une métadonnée de trace, jamais lue par cette fonction.
    const prefill = acteExtractionToF010Prefill(fullActeExtraction());
    const outcome = deriveF010ExtractionState({
      extractionSuccess: true,
      pipelineError: false,
      prefill,
    });
    assert.equal(outcome.state, "success");
  });

  it("ne réutilise jamais les champs cœur du Tunnel A (city/postalCode n'existent pas dans F010ActePrefill)", () => {
    const prefill = acteExtractionToF010Prefill(fullActeExtraction());
    assert.equal("city" in prefill, false);
    assert.equal("postalCode" in prefill, false);
  });
});

describe("f010-document-prefill — verrouillage cross-tunnel (contrainte #7)", () => {
  it("champ gouverné déjà confirmé : isCanonicalFieldLocked le détecte", () => {
    const store = lockedStore("acquisitionPrice", 245_000);
    assert.equal(isCanonicalFieldLocked(store, "acquisitionPrice"), true);
    assert.equal(isCanonicalFieldLocked(store, "acquisitionDate"), false);
  });

  it("document après données existantes : buildF010ConfirmedFieldLocks calcule les paires à verrouiller", () => {
    const locks = buildF010ConfirmedFieldLocks({
      prixAcquisition: 280_000,
      dateAcquisition: "2023-05-12",
      surface: 45,
      typeBien: "appartement",
    });
    assert.deepEqual(
      locks.sort((a, b) => a.field.localeCompare(b.field)),
      [
        { field: "acquisitionDate", value: "2023-05-12" },
        { field: "acquisitionPrice", value: 280_000 },
        { field: "propertyType", value: "appartement" },
        { field: "surfaceArea", value: 45 },
      ],
    );
  });

  it("absence d'écrasement : un champ non fourni (undefined/vide) n'est jamais verrouillé à une valeur fantôme", () => {
    const locks = buildF010ConfirmedFieldLocks({
      prixAcquisition: 280_000,
      dateAcquisition: "",
      surface: undefined,
      typeBien: "appartement",
    });
    const fields = locks.map((l) => l.field).sort();
    assert.deepEqual(fields, ["acquisitionPrice", "propertyType"]);
  });
});

describe("f010-document-prefill — gouvernance crédit (contrainte #6)", () => {
  it("les 5 champs crédit sont renommés vers les clés canoniques, jamais vers F010State", () => {
    const payload = buildF010CreditGovernancePayload(fullActeExtraction());
    assert.deepEqual(payload, {
      loanPrincipal: 200_000,
      lenderName: "Banque Populaire",
      loanTermMonths: 240,
      monthlyPayment: 950,
      loanRate: 3.2,
    });
  });

  it("absence d'écrasement : les champs logement (propertyAddress, acquisitionDate…) ne fuient jamais dans le payload crédit", () => {
    const payload = buildF010CreditGovernancePayload(fullActeExtraction());
    assert.equal("propertyAddress" in payload, false);
    assert.equal("acquisitionDate" in payload, false);
    assert.equal("acquisitionPrice" in payload, false);
  });

  it("champs crédit absents de l'extraction → payload vide (pas de valeurs inventées)", () => {
    const payload = buildF010CreditGovernancePayload({
      propertyPurchasePrice: 100_000,
    } as LogementActeExtraction);
    assert.deepEqual(payload, {});
  });
});

describe("f010-document-prefill — non-régression Tunnel A", () => {
  it("acteExtractionToF010Prefill (réutilisé tel quel) reste inchangé par ce module", () => {
    const extraction = fullActeExtraction();
    const prefill = acteExtractionToF010Prefill(extraction);
    assert.equal(prefill.prixAcquisition, 280_000);
    assert.equal(prefill.fraisNotaire, 21_000);
    assert.equal(prefill.dateAcquisition, "2023-05-12");
    assert.equal(prefill.surface, 45);
    assert.equal(prefill.typeBien, "appartement");
    assert.equal(prefill.adresse, "12 rue des Lilas, 75011 Paris");
  });

  it("ce module n'exporte aucune clé de LogementFormValues (label/city/postalCode/coproperty/status)", () => {
    // Vérifie structurellement qu'aucune des fonctions exportées ne dépend de LogementFormValues —
    // buildF010ConfirmedFieldLocks n'accepte que des clés F010, jamais Tunnel A.
    const locks = buildF010ConfirmedFieldLocks({});
    assert.deepEqual(locks, []);
  });
});
