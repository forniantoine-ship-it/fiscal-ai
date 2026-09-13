import assert from "node:assert/strict";
import { test } from "node:test";
import { GUICHET_UNIQUE_DEPOT } from "./fixtures/guichet-unique-depot.fixture";
import { INPI_RNE_808900351_OCR } from "./fixtures/inpi-rne-808900351.fixture";
import { deterministicInpiRneExtractor } from "./deterministic-inpi-rne-extractor";
import { parseInpiRneEstablishments } from "./parse-inpi-rne-establishments";
import { groundActiviteFactExtraction } from "../../grounding-engine";
import { projectDocumentFactsToF009 } from "../../f009-fact-projection";
import { validateSiret } from "@/runtime/capabilities/f009/validate-siret";

const project = (text: string) => projectDocumentFactsToF009(groundActiviteFactExtraction(text, {}, "guichet-test").extraction);

// SIRET/NIC/Code APE appear BEFORE "Nature de l'établissement pour l'entreprise :"
// in the real document — a second establishment record follows the same order.
const secondEstablishment = (
  nic: string,
  siret: string,
  natureLabel: string,
  address: string,
) => `
Etablissements - ${nic}
SIRET de l'établissement : ${siret}
Numéro interne de classement (NIC) : ${nic}
Code APE de l'établissement : 6820A
Nature de l'établissement pour l'entreprise : ${natureLabel}
Adresse de l'établissement :
${address}
`;

test("Guichet Unique (ordre réel des champs : SIRET/NIC/APE avant Nature) → bloc → SIRET normalisé → actif → faits → projection F009, sans GPT", () => {
  assert.equal(deterministicInpiRneExtractor.canHandle(GUICHET_UNIQUE_DEPOT), true);
  const [establishment] = parseInpiRneEstablishments(GUICHET_UNIQUE_DEPOT);
  assert.equal(establishment.siret, "10458947800015");
  assert.equal(establishment.status, "actif");
  assert.equal(establishment.type, "Établissement principal");
  const facts = groundActiviteFactExtraction(GUICHET_UNIQUE_DEPOT, {}, "guichet-test").extraction.facts;
  assert.equal(facts.find((fact) => fact.type === "registry.siret")?.value, "10458947800015");
  assert.equal(facts.find((fact) => fact.type === "registry.siren")?.value, "104589478");
  const result = project(GUICHET_UNIQUE_DEPOT);
  assert.equal(result.siret, "10458947800015");
  assert.equal(result.siretAmbiguous, false);
  assert.equal(result.siretCandidates.length, 1);
  assert.match(result.siretCandidates[0].address!, /EXEMPLES/);
});

test("SIREN Guichet Unique : « N° d'identification (SIREN) : » reconnu (libellé distinct du format RNE)", () => {
  const facts = groundActiviteFactExtraction(GUICHET_UNIQUE_DEPOT, {}, "guichet-test").extraction.facts;
  assert.equal(facts.find((fact) => fact.type === "registry.siren")?.value, "104589478");
});

test("le SIRET de reproduction franchit le validateur actuel, Luhn conservé", () => {
  assert.deepEqual(validateSiret({ siret: "10458947800015" }), { valid: true, normalized: "10458947800015" });
});

test("Guichet Unique reconnu via data.inpi.fr, sans dépendre du vocabulaire RNE", () => {
  // Le vrai document Guichet Unique ne contient jamais cette expression — la
  // reconnaissance doit reposer sur "data.inpi.fr", pas sur du vocabulaire RNE.
  assert.equal(/registre national des entreprises/i.test(GUICHET_UNIQUE_DEPOT), false);
  assert.equal(deterministicInpiRneExtractor.canHandle(GUICHET_UNIQUE_DEPOT), true);
});

test("principal et secondaire actifs : aucune sélection silencieuse", () => {
  const withSecondary = GUICHET_UNIQUE_DEPOT + secondEstablishment("00016", "10458947800016", "Établissement secondaire", "8 RUE TEST\n33000 BORDEAUX");
  const result = project(withSecondary);
  assert.equal(result.siret, undefined);
  assert.equal(result.siretAmbiguous, true);
  assert.equal(result.siretCandidates.length, 2);
  assert.equal(result.establishmentAddress, undefined);
});

test("établissement fermé exclu des candidats actifs", () => {
  const closed = GUICHET_UNIQUE_DEPOT.replace("Établissement principal", "Établissement secondaire fermé");
  assert.equal(parseInpiRneEstablishments(closed)[0]!.status, "fermé");
  assert.equal(project(closed).siretCandidates.length, 0);
});

test("apostrophes typographiques, ancien format RNE et limites numériques préservés", () => {
  assert.equal(project(GUICHET_UNIQUE_DEPOT.replaceAll("'", "’")).siret, "10458947800015");
  assert.equal(project(INPI_RNE_808900351_OCR).siret, "80890035100020");
  assert.equal(project(GUICHET_UNIQUE_DEPOT.replace("10458947800015", "104589478000159")).siret, undefined);
});

test("pas de bloc ou pas de SIRET explicite : aucune fabrication", () => {
  assert.equal(project(GUICHET_UNIQUE_DEPOT.replace("Nature de l'établissement pour l'entreprise", "Texte sans libellé")).siret, undefined);
  assert.equal(project(GUICHET_UNIQUE_DEPOT.replace("SIRET de l'établissement : 10458947800015", "Identifiant absent")).siret, undefined);
});

test("adresse Guichet Unique : « Adresse de l'établissement : » reconnue, jamais rattachée à un autre établissement", () => {
  const withSecondary = GUICHET_UNIQUE_DEPOT + secondEstablishment("00016", "10458947800016", "Établissement secondaire fermé", "8 RUE TEST\n33000 BORDEAUX");
  const [principal, secondaire] = parseInpiRneEstablishments(withSecondary);
  assert.match(principal!.address!, /EXEMPLES/);
  assert.match(secondaire!.address!, /RUE TEST/);
  assert.doesNotMatch(secondaire!.address!, /EXEMPLES/);
});
