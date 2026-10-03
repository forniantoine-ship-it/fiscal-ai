/**
 * R2A — cutover de LECTURE vers BienDraft (aucune écriture).
 *
 * Un dossier legacy mono est lu par projection de ses champs à plat ; un dossier scopé est lu UNIQUEMENT depuis
 * `draft.biens[propertyId]`. Jamais de repli scopé → à plat, jamais de fusion des deux formes : leur coexistence est un
 * conflit, fail-closed. La capacité de lecture (BienDraft) reste distincte du support produit V3 (mono uniquement).
 *
 * Run: npx tsx --test src/lab/v2-dossier/r2a-bien-read-cutover.test.ts
 */
import "./test-public-env";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import * as bienDraft from "@/lib/lmnp/dossier/bien-draft";
import { BIEN_DRAFT_FIELDS, createBienDraft, migrateLegacyMonoToBiens, resolveConsolidationInput } from "@/lib/lmnp/dossier/bien-draft";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import type { DeclarationDraft, Property } from "@/lib/lmnp/types";
import { representativeMonoWorkspaces, v3ReadSnapshot } from "./bien-read-test-support";
import { buildV3HousingDetail } from "./housing-detail-read-model";
import { resolveV3PropertySupport } from "./v3-property-scope";

type Domain = "f010" | "f011" | "f012" | "f013" | "f014";
const DOMAINS: Domain[] = ["f010", "f011", "f012", "f013", "f014"];

function scoped(workspace: PersistedWorkspace): PersistedWorkspace {
  const migrated = migrateLegacyMonoToBiens(workspace);
  assert.ok(migrated.ok, "migration pure du dossier de test");
  for (const field of BIEN_DRAFT_FIELDS) assert.equal(migrated.draft[field], undefined, `aucun ${field} à plat en mode scopé`);
  return { ...workspace, declarationDraft: migrated.draft };
}

function propertyIdOf(workspace: PersistedWorkspace): string {
  return workspace.properties[0]!.id;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}

const read = (workspace: PersistedWorkspace, propertyId?: string | null) => {
  const resolve = (bienDraft as Record<string, unknown>).resolveBienDraftForRead as
    | ((w: PersistedWorkspace, p?: string | null) => { status: string; view?: DeclarationDraft; source?: string })
    | undefined;
  assert.ok(resolve, "adaptateur de lecture R2A présent");
  return resolve(workspace, propertyId);
};

const workspaces = representativeMonoWorkspaces();

describe("R2A — Oracles A → E : lecture scopée F010 → F014 depuis draft.biens", () => {
  const labels: Record<Domain, string> = {
    f010: "A — F010 Logement", f011: "B — F011 Financement", f012: "C — F012 Charges", f013: "D — F013 Revenus", f014: "E — F014 Amortissements",
  };
  for (const domain of DOMAINS) {
    it(`${labels[domain]} : un dossier scopé (aucun champ à plat) se lit exactement comme son équivalent legacy`, async () => {
      const legacy = (await workspaces)[domain];
      const propertyId = propertyIdOf(legacy);
      assert.deepEqual(v3ReadSnapshot(scoped(legacy), propertyId), v3ReadSnapshot(legacy, propertyId));
    });
  }
});

describe("R2A — Oracle F : legacy mono inchangé", () => {
  it("la vue de lecture d'un dossier legacy EST son draft (même objet, aucune copie, aucune projection écrite)", async () => {
    for (const domain of DOMAINS) {
      const legacy = (await workspaces)[domain];
      const result = read(legacy);
      assert.equal(result.status, "resolved");
      assert.equal(result.source, "legacy_mono");
      assert.equal(result.view, legacy.declarationDraft, `${domain} : identité de la source`);
      assert.equal(resolveV3PropertySupport(legacy, propertyIdOf(legacy)), "full");
    }
  });
});

describe("R2A — Oracle G : conflit flat + scopé", () => {
  it("aucune lecture ne mélange les deux formes ni ne choisit l'une : fail-closed", async () => {
    const legacy = (await workspaces).f010;
    const migrated = scoped(legacy);
    const contradiction = { ...legacy.declarationDraft!.logementAmortissement!, prorataRatio: 0.123456 };
    const conflict: PersistedWorkspace = {
      ...migrated,
      declarationDraft: { ...migrated.declarationDraft!, logementAmortissement: contradiction },
    };
    const propertyId = propertyIdOf(conflict);
    assert.equal(read(conflict, propertyId).status, "conflict");
    assert.equal(read(conflict, propertyId).view, undefined);
    assert.equal(resolveV3PropertySupport(conflict, propertyId), "facts_only");
    const housing = buildV3HousingDetail(conflict, propertyId);
    assert.ok(housing.state !== "known" || housing.confirmed === false, "aucune confirmation lue");
    assert.doesNotMatch(JSON.stringify(v3ReadSnapshot(conflict, propertyId)), /0\.123456/, "jamais la valeur à plat");
    assert.equal(resolveConsolidationInput(conflict).kind, "blocked");
  });
});

describe("R2A — Oracle H : isolation par bien", () => {
  it("lecture A → uniquement A ; lecture B → uniquement B ; support produit multi scopé : full par bien explicite (MB-MULTI-PROPERTY-DETAILS-1)", async () => {
    const source = (await workspaces).f013;
    const outputA = source.declarationDraft!.revenusAssistant!;
    const outputB = { ...outputA, totalRecettes: outputA.totalRecettes + 777 };
    const properties: Property[] = [{ ...source.properties[0]!, id: "bien-a" }, { ...source.properties[0]!, id: "bien-b" }];
    const multi: PersistedWorkspace = {
      ...source,
      properties,
      fiscalYear: { ...source.fiscalYear, propertyIds: ["bien-a", "bien-b"] },
      documents: [],
      declarationDraft: {
        completedSteps: [],
        biens: {
          "bien-a": { ...createBienDraft("bien-a"), revenusAssistant: outputA },
          "bien-b": { ...createBienDraft("bien-b"), revenusAssistant: outputB },
        },
      },
    };
    assert.equal(read(multi, "bien-a").view?.revenusAssistant, outputA);
    assert.equal(read(multi, "bien-b").view?.revenusAssistant, outputB);
    assert.equal(read(multi).status, "ambiguous", "jamais le premier bien");
    assert.equal(resolveV3PropertySupport(multi, "bien-a"), "full");
    assert.equal(resolveV3PropertySupport(multi, "bien-b"), "full");
    assert.equal(resolveV3PropertySupport(multi, "inconnu"), "facts_only", "bien inconnu : jamais attribuable");
  });
});

describe("R2A — Oracle I : lecture sans écriture", () => {
  it("lire un dossier legacy ou scopé ne mute rien et ne persiste rien", async () => {
    for (const domain of DOMAINS) {
      const legacy = deepFreeze((await workspaces)[domain]);
      const migrated = deepFreeze(scoped(legacy));
      for (const workspace of [legacy, migrated]) {
        const before = JSON.stringify(workspace);
        v3ReadSnapshot(workspace, propertyIdOf(workspace));
        read(workspace, propertyIdOf(workspace));
        assert.equal(JSON.stringify(workspace), before);
      }
      assert.equal("biens" in legacy.declarationDraft!, false, `${domain} : aucun biens ajouté au legacy`);
    }
  });
});
