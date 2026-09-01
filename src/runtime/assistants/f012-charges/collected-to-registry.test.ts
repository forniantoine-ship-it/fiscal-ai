import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildCategoryInventory } from "../../capabilities/f012/compute-charges-exercice";
import { collectedToChargeRegistry } from "./collected-to-registry";
import type { F012CollectedData } from "./types";
import type { F012CategoryId, ProfilCharges } from "../../capabilities/f012/types";

const EXERCISE = 2024;

const PROFIL_SIMPLE: ProfilCharges = {
  copropriete: false,
  agence: false,
  travaux: false,
  vacance: false,
  comptable: false,
};

const PROFIL_FULL: ProfilCharges = {
  copropriete: true,
  agence: true,
  travaux: true,
  vacance: false,
  comptable: true,
};

function emptyCollected(): F012CollectedData {
  return { coproLignes: [], travaux: [], divers: [], skippedCategories: [] };
}

function registryOf(collected: F012CollectedData, profil: ProfilCharges = PROFIL_SIMPLE) {
  return collectedToChargeRegistry({
    collected,
    profil,
    categoryInventory: buildCategoryInventory(profil) as F012CategoryId[],
    fieldSources: {},
    exercise: EXERCISE,
  });
}

describe("F-012 Cycle 5 — collected → Charge Registry", () => {
  it("A — aucune charge : registry vide, pas de Charge fantôme", () => {
    const registry = registryOf(emptyCollected());
    assert.equal(registry.charges.length, 0);
    assert.ok(registry.familyCoverage.every((f) => f.chargeIds.length === 0));
  });

  it("B — taxe foncière nominale devient une Charge stable", () => {
    const registry = registryOf({ ...emptyCollected(), taxeFonciere: 1200 });
    assert.equal(registry.charges.length, 1);
    assert.equal(registry.charges[0]?.id, "taxe-fonciere:2024");
    assert.equal(registry.charges[0]?.amount, 1200);
    assert.equal(registry.charges[0]?.familyId, "impots");
    assert.equal(registry.familyCoverage.find((f) => f.familyId === "impots")?.status, "captured");
  });

  it("J — montant 0 est une Charge, pas un unknown", () => {
    const registry = registryOf({
      ...emptyCollected(),
      divers: [{ id: "divers-zero", description: "Remboursé", montant: 0 }],
    });
    assert.equal(registry.charges.length, 1);
    assert.equal(registry.charges[0]?.amount, 0);
    assert.equal(registry.charges[0]?.id, "divers-zero");
  });

  it("K — skippedCategories ne deviennent pas des Charges", () => {
    const registry = registryOf({
      ...emptyCollected(),
      skippedCategories: ["taxe_fonciere", "assurance_pno"],
    });
    assert.equal(registry.charges.length, 0);
    assert.equal(registry.familyCoverage.find((f) => f.familyId === "impots")?.status, "unknown");
    assert.equal(registry.familyCoverage.find((f) => f.familyId === "assurances")?.status, "unknown");
  });

  it("P — skip = unknown, jamais none (none n'existe pas encore dans collected)", () => {
    const registry = registryOf({
      ...emptyCollected(),
      skippedCategories: ["taxe_fonciere", "assurance_pno", "frais_bancaires", "divers"],
    });
    assert.ok(registry.familyCoverage.every((f) => f.status !== "none"));
    assert.equal(registry.familyCoverage.find((f) => f.familyId === "autres")?.status, "unknown");
  });

  it("Q — pas de copropriété au profil → not_applicable, sans Charge", () => {
    const registry = registryOf(emptyCollected(), PROFIL_SIMPLE);
    const syndic = registry.familyCoverage.find((f) => f.familyId === "syndic");
    assert.equal(syndic?.status, "not_applicable");
    assert.deepEqual(syndic?.chargeIds, []);
    assert.equal(registry.familyCoverage.find((f) => f.familyId === "travaux")?.status, "not_applicable");
  });

  it("E — copro : une identité stable par ligne (type + index)", () => {
    const registry = registryOf(
      {
        ...emptyCollected(),
        coproLignes: [
          { type: "provisions", montant: 400 },
          { type: "regularisation", montant: -50 },
          { type: "provisions", montant: 100 },
        ],
      },
      { ...PROFIL_SIMPLE, copropriete: true },
    );
    assert.deepEqual(
      registry.charges.map((c) => c.id),
      ["copro:2024:provisions:0", "copro:2024:regularisation:1", "copro:2024:provisions:2"],
    );
  });

  it("F/G/H — travaux conservent leur id existant", () => {
    const registry = registryOf(
      {
        ...emptyCollected(),
        travaux: [
          {
            id: "travaux-1",
            description: "Peinture",
            montant: 800,
            choix: "reparation_identique",
            natureIntervention: "entretien",
          },
        ],
      },
      { ...PROFIL_SIMPLE, travaux: true },
    );
    assert.equal(registry.charges[0]?.id, "travaux-1");
    assert.equal(registry.charges[0]?.qualification, "entretien");
  });

  it("L — plusieurs divers conservent leurs ids", () => {
    const registry = registryOf({
      ...emptyCollected(),
      divers: [
        { id: "divers-a", description: "Clef", montant: 15 },
        { id: "divers-b", description: "Cadenas", montant: 8 },
      ],
    });
    assert.deepEqual(
      registry.charges.map((c) => c.id),
      ["divers-a", "divers-b"],
    );
  });

  it("N — overlap F-011 : Charge visible + exclusion, jamais une Charge F-011 importée", () => {
    const registry = registryOf({
      ...emptyCollected(),
      divers: [
        {
          id: "divers-ass",
          description: "Assurance emprunteur",
          montant: 300,
          financementOverlap: "assurance_emprunteur",
        },
      ],
    });
    assert.equal(registry.charges.length, 1);
    assert.equal(registry.charges[0]?.financingOverlap, "assurance_emprunteur");
    assert.equal(registry.charges[0]?.exclusionReason, "f011_overlap");
    assert.equal(
      registry.charges.some((c) => c.category === "assurance_pno" && c.description === "assurance emprunteur"),
      false,
    );
  });

  it("T — mêmes données → mêmes IDs", () => {
    const collected: F012CollectedData = {
      ...emptyCollected(),
      taxeFonciere: 1200,
      assurancePno: 180,
      coproLignes: [{ type: "provisions", montant: 400 }],
      travaux: [{ id: "travaux-1", description: "Toiture", montant: 2000, natureIntervention: "amélioration" }],
      divers: [{ id: "divers-1", description: "Clef", montant: 10 }],
    };
    const a = collectedToChargeRegistry({
      collected,
      profil: PROFIL_FULL,
      categoryInventory: buildCategoryInventory(PROFIL_FULL) as F012CategoryId[],
      fieldSources: { taxe_fonciere: "manual" },
      exercise: EXERCISE,
    });
    const b = collectedToChargeRegistry({
      collected,
      profil: PROFIL_FULL,
      categoryInventory: buildCategoryInventory(PROFIL_FULL) as F012CategoryId[],
      fieldSources: { taxe_fonciere: "manual" },
      exercise: EXERCISE,
    });
    assert.deepEqual(
      a.charges.map((c) => c.id),
      b.charges.map((c) => c.id),
    );
    assert.deepEqual(a, b);
  });

  it("U — collision d'identifiants refusée", () => {
    assert.throws(() =>
      registryOf({
        ...emptyCollected(),
        divers: [
          { id: "dup", description: "A", montant: 1 },
          { id: "dup", description: "B", montant: 2 },
        ],
      }),
    );
  });

  it("provenance : défaut manual, jamais un second système", () => {
    const registry = collectedToChargeRegistry({
      collected: { ...emptyCollected(), taxeFonciere: 100 },
      profil: PROFIL_SIMPLE,
      categoryInventory: ["taxe_fonciere"],
      fieldSources: { taxe_fonciere: "user_correction" },
      exercise: EXERCISE,
    });
    assert.equal(registry.charges[0]?.provenance, "user_correction");
    assert.equal(registry.charges[0]?.source, "manual");
  });

  it("n'invente pas paidAt / preExploitation / unknownHelpShownAt", () => {
    const registry = registryOf({ ...emptyCollected(), taxeFonciere: 100 });
    assert.equal(registry.charges[0]?.paidAt, undefined);
    assert.equal(registry.charges[0]?.preExploitation, undefined);
    assert.ok(registry.familyCoverage.every((f) => f.unknownHelpShownAt === undefined));
  });
});
