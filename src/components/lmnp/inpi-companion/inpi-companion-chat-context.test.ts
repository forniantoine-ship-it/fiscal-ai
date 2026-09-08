/**
 * Compagnon INPI — Phase 4.5.1 : contexte conversationnel (context builder).
 * Run: npx tsx --test src/components/lmnp/inpi-companion/inpi-companion-chat-context.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { DeclarationDraft, Property } from "@/lib/lmnp/types/domain";
import type { InpiCompanionPersistedState } from "@/runtime/assistants/inpi-companion/types";
import { buildInpiCompanionChatContext } from "./inpi-companion-chat-context";

function companionState(overrides: Partial<InpiCompanionPersistedState> = {}): InpiCompanionPersistedState {
  return {
    mode: "creation",
    step: "identite",
    progressStatus: "active",
    history: [],
    confirmedFields: {},
    conflicts: {},
    updatedAt: "2026-09-08T10:00:00.000Z",
    ...overrides,
  };
}

const property = (id: string): Property => ({
  id,
  label: id,
  address: `${id} rue`,
  city: "Bordeaux",
  postalCode: "33000",
});

describe("currentQuestion / nextAction — dérivés du moteur, jamais inventés", () => {
  it("mode creation, rien de confirmé → currentQuestion pointe sur 'identite', reason vient du moteur", () => {
    const context = buildInpiCompanionChatContext({
      draft: undefined,
      properties: [],
      dossierInpiStatus: "not_started",
    });
    assert.equal(context.mode, "creation");
    assert.equal(context.currentQuestion?.field, "identite");
    assert.equal(context.currentQuestion?.label, "identité à confirmer");
    assert.equal(context.currentQuestion?.reason, "Cette information n'est pas disponible et doit être renseignée ou décidée par le client.");
    assert.equal(context.nextAction, "provide_missing_field");
  });

  it("champ fiable mais non confirmé → nextAction 'confirm_field'", () => {
    const draft = { exploitantFirstName: "Jean", exploitantLastName: "Dupont" } as DeclarationDraft;
    const context = buildInpiCompanionChatContext({ draft, properties: [], dossierInpiStatus: "not_started" });
    assert.equal(context.currentQuestion?.field, "identite");
    assert.equal(context.nextAction, "confirm_field");
  });

  it("toutes les étapes confirmées → step 'synthese', nextAction 'open_official_inpi'", () => {
    const draft = {
      exploitantFirstName: "Jean",
      exploitantLastName: "Dupont",
      activityStartDate: "2024-01-01",
      establishmentAddress: "1 rue A",
      siret: "12345678900012",
      inpiCompanionState: companionState({
        step: "synthese",
        confirmedFields: {
          identite: "t", activite: "t", date_debut: "t", etablissement: "t",
          siren_siret: "t", regime: "t", domiciliation: "t", documents: "t",
        },
      }),
    } as DeclarationDraft;
    const context = buildInpiCompanionChatContext({ draft, properties: [], dossierInpiStatus: "not_started" });
    assert.equal(context.currentQuestion?.label, "synthèse à vérifier");
    assert.equal(context.nextAction, "open_official_inpi");
  });

  it("mode resumed → nextAction 'resume', peu importe l'étape", () => {
    const draft = {
      inpiCompanionState: companionState({ mode: "poursuite", step: "documents", progressStatus: "active" }),
    } as DeclarationDraft;
    const context = buildInpiCompanionChatContext({ draft, properties: [], dossierInpiStatus: "registered" });
    assert.equal(context.nextAction, "resume");
  });

  it("mode attente → nextAction 'wait', currentQuestion null (pas de parcours à étapes)", () => {
    const context = buildInpiCompanionChatContext({ draft: undefined, properties: [], dossierInpiStatus: "submitted" });
    assert.equal(context.mode, "attente");
    assert.equal(context.nextAction, "wait");
    assert.equal(context.currentQuestion, null);
  });

  it("mode regularisation → nextAction 'explain'", () => {
    const context = buildInpiCompanionChatContext({ draft: undefined, properties: [], dossierInpiStatus: "regularization_required" });
    assert.equal(context.nextAction, "explain");
  });

  it("mode verification (registered) → nextAction 'review_summary'", () => {
    const context = buildInpiCompanionChatContext({ draft: undefined, properties: [], dossierInpiStatus: "registered" });
    assert.equal(context.nextAction, "review_summary");
  });

  it("conflit actif sur le champ courant → nextAction 'resolve_conflict', currentQuestion pointe sur le champ en conflit", () => {
    const draft = {
      inpiCompanionState: companionState({
        confirmedFields: { identite: "t" },
        conflicts: { siren_siret: { field: "siren_siret", previousValue: "A", newValue: "B" } },
      }),
    } as DeclarationDraft;
    const context = buildInpiCompanionChatContext({ draft, properties: [], dossierInpiStatus: "not_started" });
    assert.equal(context.currentQuestion?.field, "siren_siret");
    assert.equal(context.nextAction, "resolve_conflict");
    assert.equal(context.conflicts.length, 1);
  });
});

describe("knownValues / proposedValues / missingFields — distinction stricte (Phase 4.2)", () => {
  it("SIRET présent mais non confirmé dans le Compagnon → proposedValues, jamais knownValues", () => {
    const draft = { siret: "12345678900012" } as DeclarationDraft;
    const context = buildInpiCompanionChatContext({ draft, properties: [], dossierInpiStatus: "not_started" });
    assert.equal(context.proposedValues.siren_siret, "12345678900012");
    assert.equal(context.knownValues.siren_siret, undefined);
  });

  it("SIRET confirmé dans le Compagnon → knownValues, retiré de proposedValues", () => {
    const draft = {
      siret: "12345678900012",
      inpiCompanionState: companionState({ confirmedFields: { siren_siret: "2026-09-01T09:00:00.000Z" } }),
    } as DeclarationDraft;
    const context = buildInpiCompanionChatContext({ draft, properties: [], dossierInpiStatus: "not_started" });
    assert.equal(context.knownValues.siren_siret, "12345678900012");
    assert.equal(context.proposedValues.siren_siret, undefined);
  });

  it("domiciliation confirmée → n'apparaît dans AUCUN des trois buckets (jamais de valeur à afficher)", () => {
    const draft = {
      inpiCompanionState: companionState({ confirmedFields: { domiciliation: "2026-09-01T09:00:00.000Z" } }),
    } as DeclarationDraft;
    const context = buildInpiCompanionChatContext({ draft, properties: [], dossierInpiStatus: "not_started" });
    assert.equal(context.knownValues.domiciliation, undefined);
    assert.equal(context.proposedValues.domiciliation, undefined);
    assert.ok(!context.missingFields.includes("domiciliation"));
  });

  it("aucune donnée → tous les champs (hors synthese) dans missingFields", () => {
    const context = buildInpiCompanionChatContext({ draft: undefined, properties: [], dossierInpiStatus: "not_started" });
    assert.deepEqual(
      [...context.missingFields].sort(),
      ["date_debut", "documents", "domiciliation", "etablissement", "identite", "regime", "siren_siret"].sort(),
    );
    // "activite" est une inférence produit constante (toujours proposée), jamais manquante.
    assert.ok(!context.missingFields.includes("activite"));
    assert.equal(context.proposedValues.activite, "Location meublée non professionnelle");
  });
});

describe("Multi-biens", () => {
  it("plusieurs propriétés → isMultiProperty=true dans le contexte, jamais les adresses elles-mêmes", () => {
    const context = buildInpiCompanionChatContext({
      draft: undefined,
      properties: [property("a"), property("b")],
      dossierInpiStatus: "not_started",
    });
    assert.equal(context.isMultiProperty, true);
    assert.ok(!("properties" in context));
  });
});

describe("Confidentialité — whitelist stricte (§12)", () => {
  const POISONED_DRAFT = {
    exploitantFirstName: "Jean",
    exploitantLastName: "Dupont",
    exploitantEmail: "jean.dupont@example.com",
    exploitantTelephone: "0600000000",
    personalAddress: "42 avenue Secrète",
    personalCity: "Paris",
    personalPostalCode: "75001",
    siret: "12345678900012",
    establishmentAddress: "1 rue de l'Établissement",
    establishmentCity: "Bordeaux",
    establishmentPostalCode: "33000",
    activityStartDate: "2024-01-01",
    // Champs volontairement hors périmètre — ne doivent JAMAIS apparaître, même par accident :
    logementAmortissement: { plan: { lignes: [{ label: "secret", montant: 999999, dureeAnnees: 20 }] }, valeurTerrain: 12345, montantMobilier: 6789 },
    financementAssistantState: { loans: [{ pretId: "secret-loan", capitalInitial: 500000 }] },
    activiteAssistantState: { step: "complete", siret: "99999999999999", email: "leak@example.com" },
    inpiCompanionState: companionState(),
  } as unknown as DeclarationDraft;

  it("le contexte ne contient jamais fiscalYear/workspace/properties complets, ni email/téléphone/adresse personnelle", () => {
    const context = buildInpiCompanionChatContext({
      draft: POISONED_DRAFT,
      properties: [property("a")],
      dossierInpiStatus: "not_started",
    });
    const serialized = JSON.stringify(context);

    // Champs structurels jamais présents :
    for (const forbiddenKey of ["fiscalYear", "workspace", "properties", "logementAmortissement", "financementAssistantState", "activiteAssistantState"]) {
      assert.ok(!(forbiddenKey in context), `${forbiddenKey} ne doit jamais apparaître dans le contexte`);
    }

    // Valeurs sensibles injectées dans le faux draft : ne doivent jamais fuiter dans la sérialisation.
    for (const forbiddenValue of [
      "jean.dupont@example.com",
      "0600000000",
      "42 avenue Secrète",
      "leak@example.com",
      "99999999999999",
      "secret-loan",
      "500000",
    ]) {
      assert.ok(!serialized.includes(forbiddenValue), `"${forbiddenValue}" ne doit jamais apparaître dans le contexte sérialisé`);
    }
  });

  it("seuls les champs explicitement autorisés apparaissent au premier niveau du contexte", () => {
    const context = buildInpiCompanionChatContext({
      draft: POISONED_DRAFT,
      properties: [],
      dossierInpiStatus: "not_started",
    });
    const expectedKeys = [
      "mode", "step", "progressStatus", "currentQuestion", "nextAction",
      "knownValues", "proposedValues", "missingFields", "conflicts",
      "isMultiProperty", "dossierInpiStatus",
    ].sort();
    assert.deepEqual(Object.keys(context).sort(), expectedKeys);
  });

  it("garde-fou anti-régression : le builder ne peut structurellement pas être un spread de draft/workspace/properties (vérifié par lecture de source)", () => {
    // Ce test complète la vérification runtime ci-dessus par une vérification
    // statique du fichier source : aucune construction `{...draft}` /
    // `{...workspace}` / `{...properties}` ne doit apparaître dans le
    // context builder.
    const source = readFileSync(
      fileURLToPath(new URL("./inpi-companion-chat-context.ts", import.meta.url)),
      "utf8",
    );
    // Code fonctionnel uniquement — exclut les commentaires (docstrings), qui
    // peuvent légitimement mentionner ces motifs sans que ce soit du code réel.
    const functionalSource = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(functionalSource, /\.\.\.draft/);
    assert.doesNotMatch(functionalSource, /\.\.\.workspace/);
    assert.doesNotMatch(functionalSource, /\.\.\.properties/);
  });
});

describe("Pureté / non-mutation", () => {
  it("buildInpiCompanionChatContext ne mute ni draft ni properties, même gelés", () => {
    const draft = Object.freeze({
      siret: "12345678900012",
      inpiCompanionState: Object.freeze(companionState()),
    }) as unknown as DeclarationDraft;
    const properties = Object.freeze([property("a")]);

    const context = buildInpiCompanionChatContext({ draft, properties, dossierInpiStatus: "not_started" });

    assert.equal((draft as { siret?: string }).siret, "12345678900012");
    assert.equal(properties.length, 1);
    assert.equal(context.proposedValues.siren_siret, "12345678900012");
  });

  it("aucun accès réseau / écriture — la fonction est synchrone et ne retourne jamais une Promise", () => {
    const result = buildInpiCompanionChatContext({ draft: undefined, properties: [], dossierInpiStatus: undefined });
    assert.equal(result instanceof Promise, false);
  });
});
