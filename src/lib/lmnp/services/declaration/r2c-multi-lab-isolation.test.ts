/**
 * MB-MULTI-E2E-LAB-1 — contrat PERMANENT du banc LAB « Mes biens » : l'édition multi n'est ouverte que localement à la route LAB ;
 * les six capacités de production restent fermées, `/assistants/biens` reste dormant, aucune route de production n'importe le LAB.
 *
 * Run: npx tsx --test src/lib/lmnp/services/declaration/r2c-multi-lab-isolation.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { OWNER_ROUTES } from "@/lab/v2-dossier/correction-scope";
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
  it("les six capacités globales sont fermées", () => {
    assert.deepEqual(MULTI_PROPERTY_CAPABILITIES, { edition: false, generation: false, delivery: false, payment: false, closing: false, nextYear: false });
    for (const capability of Object.keys(MULTI_PROPERTY_CAPABILITIES) as Array<keyof typeof MULTI_PROPERTY_CAPABILITIES>) {
      assert.equal(isMultiPropertyCapabilityOpen(capability), false, capability);
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
