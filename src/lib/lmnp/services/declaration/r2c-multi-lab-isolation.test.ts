/**
 * MB-MULTI-E2E-LAB-1 — contrat PERMANENT du banc LAB « Mes biens » : l'édition multi n'est ouverte que localement à la route LAB ;
 * seule la génération est ouverte en production (édition fermée), `/assistants/biens` reste dormant, aucune route de production n'importe le LAB.
 *
 * Run: npx tsx --test src/lib/lmnp/services/declaration/r2c-multi-lab-isolation.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  OWNER_ROUTES,
  readV3CorrectionQuery,
  sameCorrectionScope,
  v3CorrectionHrefForResolvedScope,
  type V3CorrectionScope,
} from "@/lab/v2-dossier/correction-scope";
import {
  MULTI_PROPERTY_CAPABILITIES,
  MULTI_PROPERTY_NEVER_OPEN_CAPABILITIES,
  isMultiPropertyCapabilityOpen,
} from "@/lib/lmnp/dossier/multi-property-activation";

const ROOT = process.cwd();
const source = (relative: string) => readFileSync(path.join(ROOT, relative), "utf8");
const code = (relative: string) => source(relative).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const LAB_ROUTE_COMPONENT = "src/lab/v2-dossier/V3PropertiesLabRoute.tsx";
const LAB_PAGE = "src/app/lab/v2-dossier/real/biens/page.tsx";

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(path.join(ROOT, dir))) {
    const relative = `${dir}/${entry}`;
    if (statSync(path.join(ROOT, relative)).isDirectory()) walk(relative, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(relative);
  }
  return out;
}

/** Tout `src/` hors LAB (src/lab, src/app/lab) et hors tests : le périmètre « production ». */
const productionFiles = walk("src").filter((file) => !file.startsWith("src/lab/") && !file.startsWith("src/app/lab/") && !/\.test\.tsx?$/.test(file));

describe("MB-MULTI-E2E-LAB-1 — capacités de production", () => {
  it("seules la génération et la livraison sont ouvertes globalement ; l'édition de production reste fermée", () => {
    assert.deepEqual(MULTI_PROPERTY_CAPABILITIES, { edition: false, generation: true, delivery: true, payment: false, closing: false, nextYear: false });
    for (const capability of Object.keys(MULTI_PROPERTY_CAPABILITIES) as Array<keyof typeof MULTI_PROPERTY_CAPABILITIES>) {
      assert.equal(isMultiPropertyCapabilityOpen(capability), ["generation", "delivery"].includes(capability), capability);
    }
  });

  it("clôture et exercice suivant ne sont ouvrables par aucun objet de capacités, même LAB", () => {
    const labLike = { ...MULTI_PROPERTY_CAPABILITIES, edition: true, closing: true, nextYear: true };
    assert.equal(isMultiPropertyCapabilityOpen("closing", labLike), false);
    assert.equal(isMultiPropertyCapabilityOpen("nextYear", labLike), false);
    assert.deepEqual([...MULTI_PROPERTY_NEVER_OPEN_CAPABILITIES].sort(), ["closing", "nextYear"]);
  });

  it("le module de capacités ne connaît pas le LAB et n'exporte aucun contournement", () => {
    const text = code("src/lib/lmnp/dossier/multi-property-activation.ts");
    assert.doesNotMatch(text, /LAB_EDITION|PropertiesLab|process\.env|localStorage|searchParams|document\.cookie/);
  });
});

describe("MB-MULTI-E2E-LAB-1 — isolation de la route LAB", () => {
  it("la capacité d'édition est fournie localement : seule `edition` diffère de la production", () => {
    const text = source(LAB_ROUTE_COMPONENT);
    assert.match(text, /LAB_EDITION_ONLY_CAPABILITIES: MultiPropertyCapabilities = \{ \.\.\.MULTI_PROPERTY_CAPABILITIES, edition: true \}/);
    assert.equal((text.match(/: true/g) ?? []).length, 1, "une seule capacité ouverte dans le LAB");
    assert.match(text, /<PropertiesManager capabilities=\{LAB_EDITION_ONLY_CAPABILITIES\} \/>/);
  });

  it("le LAB monte le vrai PropertiesManager et ne réimplémente pas ADD_PROPERTY", () => {
    const text = code(LAB_ROUTE_COMPONENT);
    assert.match(text, /from "@\/components\/lmnp\/biens\/PropertiesManager"/);
    assert.doesNotMatch(text, /ADD_PROPERTY|addPropertyToWorkspace|planAddProperty|dispatch\(/);
  });

  it("la route LAB garde le blocage de production des routes lab, sans query param ni stockage de contournement", () => {
    const page = code(LAB_PAGE);
    assert.match(page, /process\.env\.NODE_ENV === "production" && !isV3RealTestRouteEnabled\(\)\) notFound\(\)/);
    for (const text of [page, code(LAB_ROUTE_COMPONENT)]) {
      assert.doesNotMatch(text, /searchParams|localStorage|sessionStorage|document\.cookie|cookies\(\)|NEXT_PUBLIC_/);
    }
    assert.match(page, /robots: \{ index: false, follow: false \}/);
  });

  it("la route LAB est enregistrée comme écran d'ACTIVITÉ (scope vérifié, aucun bien requis)", () => {
    assert.equal(OWNER_ROUTES["/lab/v2-dossier/real/biens"], false);
  });

  it("aucun fichier de production n'importe le LAB ni son contrat de capacités", () => {
    const offenders = productionFiles.filter((file) => /V3PropertiesLabRoute|LAB_EDITION_ONLY_CAPABILITIES|real\/biens/.test(source(file)));
    assert.deepEqual(offenders, []);
  });

  it("la route LAB n'est liée depuis aucune navigation (seul son enregistrement de scope la cite hors LAB)", () => {
    const citing = walk("src").filter((file) => !/\.test\.tsx?$/.test(file) && source(file).includes("/lab/v2-dossier/real/biens"));
    assert.deepEqual(citing, ["src/lab/v2-dossier/correction-scope.ts"]);
  });
});

describe("MB-MULTI-E2E-LAB-1 — production dormante", () => {
  it("/assistants/biens monte PropertiesManager SANS capacités (donc dormant) et sans bypass", () => {
    const page = source("src/app/(dashboard)/assistants/biens/page.tsx");
    assert.match(page, /<PropertiesManager \/>/);
    assert.doesNotMatch(page, /capabilities|edition|process\.env|searchParams|localStorage/);
  });
});

// ---------------------------------------------------------------------------
// MB-MULTI-E2E-LAB-SCOPE-FIX-1 — contrat d'entrée de la route LAB (écran d'ACTIVITÉ : jamais de propertyId)
// ---------------------------------------------------------------------------

describe("MB-MULTI-E2E-LAB-SCOPE-FIX-1 — scope d'entrée du LAB « Mes biens »", () => {
  const LAB = "/lab/v2-dossier/real/biens";
  const V3_SCOPE: V3CorrectionScope = {
    dossierId: "dossier-1", fiscalYearId: "year-1", year: 2025, property: { kind: "required", propertyId: "prop-A" }, shell: "v3",
  };
  const read = (search: string) => readV3CorrectionQuery(LAB, new URLSearchParams(search));

  it("scope V3 valide → URL LAB construite par le contrat réel (propertyId retiré, v3Shell conservé) → scope accepté", () => {
    const href = v3CorrectionHrefForResolvedScope(LAB, V3_SCOPE)!;
    assert.ok(href.startsWith(`${LAB}?`));
    const params = new URL(href, "http://x").searchParams;
    assert.equal(params.has("propertyId"), false);
    assert.equal(params.get("v3Shell"), "v3");
    const query = read(params.toString());
    assert.equal(query.kind, "scope");
    if (query.kind === "scope") {
      assert.deepEqual(query.scope, { dossierId: "dossier-1", fiscalYearId: "year-1", year: 2025, property: { kind: "not_applicable" }, shell: "v3" });
      assert.equal(sameCorrectionScope(query.scope, { ...V3_SCOPE, property: { kind: "not_applicable" } }), true);
    }
  });

  it("CAUSE RACINE : un propertyId sur cet écran d'activité est REFUSÉ (incohérent avec OWNER_ROUTES = false), jamais ignoré", () => {
    assert.deepEqual(read("dossierId=dossier-1&fiscalYearId=year-1&year=2025&propertyId=prop-A&v3Shell=v3&v3Correction=1"), { kind: "invalid" });
  });

  it("cas invalides toujours refusés : mauvais dossier / exercice (scope divergent), scope incomplet, propertyId vide ou répété", () => {
    const ok = read("dossierId=dossier-1&fiscalYearId=year-1&year=2025&v3Correction=1");
    assert.equal(ok.kind, "scope");
    if (ok.kind !== "scope") return;
    const loaded: V3CorrectionScope = { ...V3_SCOPE, property: { kind: "not_applicable" } };
    assert.equal(sameCorrectionScope(ok.scope, { ...loaded, dossierId: "autre-dossier" }), false);
    assert.equal(sameCorrectionScope(ok.scope, { ...loaded, fiscalYearId: "autre-exercice" }), false);
    assert.equal(sameCorrectionScope(ok.scope, { ...loaded, year: 2024 }), false);
    assert.equal(sameCorrectionScope(ok.scope, null), false);
    for (const search of [
      "fiscalYearId=year-1&year=2025&v3Correction=1",
      "dossierId=dossier-1&year=2025&v3Correction=1",
      "dossierId=dossier-1&fiscalYearId=year-1&v3Correction=1",
      "dossierId=dossier-1&fiscalYearId=year-1&year=2025&propertyId=&v3Correction=1",
      "dossierId=dossier-1&fiscalYearId=year-1&year=2025&propertyId=a&propertyId=b&v3Correction=1",
      "dossierId=dossier-1&fiscalYearId=year-1&year=2025&v3Correction=1&v3Shell=autre",
    ]) assert.deepEqual(read(search), { kind: "invalid" }, search);
  });

  it("sans marqueur v3Correction : aucun scope (le LAB ne s'ouvre pas sur un dossier implicite)", () => {
    assert.deepEqual(read("dossierId=dossier-1&fiscalYearId=year-1&year=2025"), { kind: "none" });
  });
});
