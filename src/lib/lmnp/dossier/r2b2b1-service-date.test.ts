/**
 * R2B.2b.1 — date de mise en service PAR BIEN collectée dans F010 (mode scopé).
 *
 * Contrat : dateDebutActivite = GLOBAL (F009) ; dateMiseEnService = PROPRE AU BIEN (F010 du bien actif, scopé).
 * Legacy mono : strictement inchangé (F009 reste propriétaire de la date, F010 ne la demande jamais).
 *
 * Run: npx tsx --test src/lib/lmnp/dossier/r2b2b1-service-date.test.ts
 */
import "@/lab/v2-dossier/test-public-env";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import { representativeMonoWorkspaces } from "@/lab/v2-dossier/bien-read-test-support";
import { bienScopeFor, withActivePropertyId } from "@/lib/lmnp/dossier/bien-scope";
import { BIEN_DRAFT_FIELDS, scopedInvariantViolation } from "@/lib/lmnp/dossier/bien-draft";
import { lmnpReducer, type LmnpAction, type LmnpState } from "@/lib/lmnp/store/reducer";
import { parseWorkspaceSnapshot, serializeWorkspaceSnapshot } from "@/lib/lmnp/store/workspace-snapshot";
import type { Property } from "@/lib/lmnp/types";
import { F009ActiviteAssistant, f009DraftPatch, remainingQuestions } from "@/runtime/assistants/f009-activite/assistant";
import { F010LogementAssistant } from "@/runtime/assistants/f010-logement/assistant";
import type { F010AssistantTurn, F010State } from "@/runtime/assistants/f010-logement/types";

const A = "home-1";
const B = "bien-b";
const PROPERTY_B: Property = { id: B, label: "Studio Nantes", address: "3 rue Y", city: "Nantes", postalCode: "44000" };
const ACTIVITY_START = "2025-01-01";
const ctx = { dossierId: "fy", fiscalYear: 2025, route: "/assistants/logement" };
const source = (relative: string) => readFileSync(path.join(process.cwd(), relative), "utf8");

/** Message historique (legacy) — doit rester octet pour octet. */
const LEGACY_BLOCKED_MESSAGE =
  "Il me manque la date de mise en service du logement pour calculer correctement l'amortissement " +
  "(elle détermine le prorata de la première année). " +
  "Complétez d'abord l'étape Activité, puis revenez ici — je ne peux pas deviner cette date.";

type ServiceDateTurn = F010AssistantTurn & { serviceDate?: string };
const submitDate = (date: string) => ({ type: "submit_service_date", date }) as never;

/** Dossier scopé A + B, la date de A retirée pour pouvoir la (re)collecter dans F010. */
async function scopedWithoutDates(): Promise<LmnpState> {
  const ws = await representativeMonoWorkspaces();
  const legacy: LmnpState = {
    ...ws.f014,
    fileRegistry: new Map(),
    declarationDraft: { ...ws.f014.declarationDraft!, activityStartDate: ACTIVITY_START },
  };
  const scoped = lmnpReducer(legacy, { type: "ADD_PROPERTY", property: PROPERTY_B });
  assert.ok(scoped.declarationDraft?.biens, "précondition : dossier scopé");
  const { dateMiseEnService: _removed, ...bienA } = scoped.declarationDraft.biens[A]!;
  void _removed;
  return { ...scoped, declarationDraft: { ...scoped.declarationDraft, biens: { ...scoped.declarationDraft.biens, [A]: bienA } } };
}

/** Deps F010 telles que le panel les construit pour le bien actif (mode scopé). */
function scopedDeps(state: LmnpState, propertyId: string) {
  const scope = bienScopeFor(state, propertyId);
  assert.equal(scope.status, "ready");
  assert.equal(scope.status === "ready" && scope.mode, "scoped");
  const draft = scope.status === "ready" ? scope.draft : undefined;
  return {
    dateMiseEnService: draft?.dateMiseEnService,
    optionFraisAcquisition: draft?.optionFraisAcquisition?.choix,
    collectServiceDate: true,
    dateDebutActivite: draft?.activityStartDate,
  } as never;
}

/** Toutes les réponses F010 connues, ventilation en attente. */
function readyForVentilation(choix: "integration" | "deduction" = "integration"): F010State {
  return {
    step: "ventilation",
    nature: "achat",
    prixAcquisition: 200_000,
    typeBien: "appartement",
    dateAcquisition: "2025-02-01",
    fraisNotaire: 15_000,
    choixTraitementFrais: choix,
    mobilierInclus: false,
    montantMobilier: 0,
    fieldSources: {},
    history: ["orientation", "collect_bien", "collect_frais", "collect_mobilier"],
  };
}

async function blockedOn(state: LmnpState, propertyId: string) {
  const deps = scopedDeps(state, propertyId);
  const assistant = new F010LogementAssistant(ctx, deps);
  const option = bienScopeFor(state, propertyId);
  const choix = option.status === "ready" ? option.draft.optionFraisAcquisition?.choix : undefined;
  const turn = await assistant.handle(readyForVentilation(choix), { type: "submit_ventilation", ratioTerrain: 0.15 });
  return { assistant, turn };
}

/** Réplique de l'écriture du panel : réponse acceptée → patch du bien actif via le dispatch scopé. */
function writeAccepted(state: LmnpState, propertyId: string, turn: ServiceDateTurn): LmnpState {
  assert.ok(turn.serviceDate, "la réponse acceptée est rendue au panel pour écriture");
  return lmnpReducer(state, withActivePropertyId({ type: "DECLARATION_PATCH_DRAFT", patch: { dateMiseEnService: turn.serviceDate } }, propertyId));
}

const bienOf = (state: LmnpState, id: string) => state.declarationDraft?.biens?.[id];

describe("R2B.2b.1 — SD1 → SD4 : F010 collecte la date du bien actif", () => {
  it("SD1 — scopé A sans date : F010 demande la date de mise en service de CE logement", async () => {
    const scoped = await scopedWithoutDates();
    const { turn } = await blockedOn(scoped, A);
    assert.equal(turn.state.step, "blocked_missing_date");
    const last = turn.messages.at(-1)?.content ?? "";
    assert.match(last, /À quelle date ce logement a-t-il été mis en service \?/);
    const answered = (await new F010LogementAssistant(ctx, scopedDeps(scoped, A)).handle(turn.state, submitDate("2025-03-01"))) as ServiceDateTurn;
    assert.notEqual(answered.state.step, "blocked_missing_date", "la réponse est collectable dans F010");
  });

  it("SD2 / SD3 — réponse sur A : écrit uniquement biens[A].dateMiseEnService, B inchangé", async () => {
    const scoped = await scopedWithoutDates();
    const { assistant, turn } = await blockedOn(scoped, A);
    const answered = (await assistant.handle(turn.state, submitDate("2025-03-01"))) as ServiceDateTurn;
    assert.equal(answered.serviceDate, "2025-03-01");
    const next = writeAccepted(scoped, A, answered);
    assert.equal(bienOf(next, A)?.dateMiseEnService, "2025-03-01");
    assert.equal(bienOf(next, B), bienOf(scoped, B), "B intact (même référence)");
    assert.equal(next.declarationDraft?.dateMiseEnService, undefined, "jamais à la racine");
  });

  it("SD4 — B peut porter une date différente de A", async () => {
    let state = await scopedWithoutDates();
    for (const [propertyId, date] of [[A, "2025-03-01"], [B, "2025-09-15"]] as const) {
      const { assistant, turn } = await blockedOn(state, propertyId);
      state = writeAccepted(state, propertyId, (await assistant.handle(turn.state, submitDate(date))) as ServiceDateTurn);
    }
    assert.equal(bienOf(state, A)?.dateMiseEnService, "2025-03-01");
    assert.equal(bienOf(state, B)?.dateMiseEnService, "2025-09-15");
  });
});

describe("R2B.2b.1 — SD5, SD6 : validation (règles F009 réutilisées)", () => {
  it("SD5 — date antérieure au début d'activité : refus, état inchangé, rien à écrire", async () => {
    const scoped = await scopedWithoutDates();
    const { assistant, turn } = await blockedOn(scoped, B);
    const refused = (await assistant.handle(turn.state, submitDate("2024-12-01"))) as ServiceDateTurn;
    assert.equal(refused.state, turn.state, "état inchangé (même référence)");
    assert.equal(refused.serviceDate, undefined);
    assert.match(refused.messages.at(-1)?.content ?? "", /précède le début d’activité/);
  });

  it("SD6 — date future : refus selon la règle F009 existante", async () => {
    const scoped = await scopedWithoutDates();
    const { assistant, turn } = await blockedOn(scoped, B);
    const refused = (await assistant.handle(turn.state, submitDate("2099-01-01"))) as ServiceDateTurn;
    assert.equal(refused.state, turn.state);
    assert.equal(refused.serviceDate, undefined);
    assert.match(refused.messages.at(-1)?.content ?? "", /Cette date est dans le futur/);
    const invalid = (await assistant.handle(turn.state, submitDate("2025-02-30"))) as ServiceDateTurn;
    assert.equal(invalid.state, turn.state, "date impossible refusée");
    assert.equal(invalid.serviceDate, undefined);
  });

  it("SD5/SD6 — une seule implémentation des règles : F009 et F010 consomment le même helper", () => {
    const helper = "validateServiceDate";
    assert.match(source("src/runtime/assistants/f009-activite/assistant.ts"), new RegExp(`${helper}\\(`));
    assert.match(source("src/runtime/assistants/f010-logement/assistant.ts"), new RegExp(`${helper}\\(`));
  });
});

describe("R2B.2b.1 — SD7, SD8 : sortie du blocage et messages", () => {
  it("SD7 — après une date valide F010 n'est plus bloqué : plan calculé avec la date du bien, confirmable", async () => {
    const scoped = await scopedWithoutDates();
    const { assistant, turn } = await blockedOn(scoped, B);
    const answered = (await assistant.handle(turn.state, submitDate("2025-07-01"))) as ServiceDateTurn;
    assert.equal(answered.state.step, "review_plan");
    assert.ok(answered.state.result?.planValide);
    assert.ok(Math.abs(answered.state.result!.prorataRatio - 184 / 365) < 0.02, "prorata issu de la date du bien");
    const confirmed = await assistant.handle(answered.state, { type: "confirm" });
    assert.equal(confirmed.completed, true);
  });

  it("SD8 — scopé : le message ne renvoie plus vers F009 / l'Activité, il vise CE logement (blocage et reprise)", async () => {
    const scoped = await scopedWithoutDates();
    const { assistant, turn } = await blockedOn(scoped, B);
    const blocked = turn.messages.at(-1)?.content ?? "";
    assert.doesNotMatch(blocked, /Activité|F009|F-009/);
    assert.match(blocked, /ce logement/);
    const resumed = assistant.resume({ ...turn.state, updatedAt: "x" } as never);
    assert.equal(resumed.state.step, "blocked_missing_date");
    assert.doesNotMatch(resumed.messages.at(-1)?.content ?? "", /Activité/);
    const panel = source("src/components/lmnp/assistants/F010LogementAssistantPanel.tsx");
    assert.match(panel, /submit_service_date/, "le panel collecte la date dans F010");
  });
});

describe("R2B.2b.1 — SD9, SD10 : legacy et F009", () => {
  it("SD9 — legacy mono : aucune nouvelle question F010, message et blocage historiques identiques", async () => {
    const assistant = new F010LogementAssistant(ctx); // legacy : aucune dep scopée
    const turn = await assistant.handle(readyForVentilation(), { type: "submit_ventilation", ratioTerrain: 0.15 });
    assert.equal(turn.state.step, "blocked_missing_date");
    assert.equal(turn.messages.at(-1)?.content, LEGACY_BLOCKED_MESSAGE);
    const ignored = (await assistant.handle(turn.state, submitDate("2025-03-01"))) as ServiceDateTurn;
    assert.equal(ignored.state, turn.state, "legacy : F010 n'accepte jamais la date");
    assert.equal(ignored.serviceDate, undefined);
    assert.deepEqual(ignored.messages, []);
    const resumed = assistant.resume({ ...turn.state, updatedAt: "x" } as never);
    assert.equal(resumed.messages.at(-1)?.content, LEGACY_BLOCKED_MESSAGE);
  });

  it("SD10 — F009 scopé : ne demande toujours pas et n'écrit toujours pas la date", async () => {
    const scoped = await scopedWithoutDates();
    const f009 = new F009ActiviteAssistant({ ...ctx, route: "/assistants/activite" });
    const state = f009.start(scoped.declarationDraft).state;
    assert.equal(remainingQuestions(state).includes("service_date"), false);
    assert.equal(f009DraftPatch({ ...state, dateMiseEnService: "2025-03-01" }, "2026-03-01T10:00:00.000Z", true).dateMiseEnService, undefined);
  });
});

describe("R2B.2b.1 — SD11, SD12 : persistance et invariant", () => {
  it("SD11 — reload : la date du bien est conservée et F010 reprend sur le plan, sans redemander", async () => {
    const scoped = await scopedWithoutDates();
    const { assistant, turn } = await blockedOn(scoped, B);
    const answered = (await assistant.handle(turn.state, submitDate("2025-09-15"))) as ServiceDateTurn;
    const written = writeAccepted(scoped, B, answered);
    const serialized = serializeWorkspaceSnapshot(written);
    assert.ok(serialized.ok);
    const parsed = parseWorkspaceSnapshot(JSON.parse(JSON.stringify(serialized.envelope)));
    assert.ok(parsed.ok);
    const reloaded = { ...written, ...parsed.envelope.workspace } as LmnpState;
    assert.equal(bienScopeFor(reloaded, B).status === "ready" && bienScopeFor(reloaded, B).draft?.dateMiseEnService, "2025-09-15");
    const resumed = new F010LogementAssistant(ctx, scopedDeps(reloaded, B)).resume({ ...answered.state, updatedAt: "x" } as never);
    assert.equal(resumed.state.step, "review_plan");
    assert.ok(resumed.state.result);
  });

  it("SD12 — aucun champ dateMiseEnService à plat en scopé ; écriture sans bien actif refusée", async () => {
    const scoped = await scopedWithoutDates();
    const { assistant, turn } = await blockedOn(scoped, B);
    const next = writeAccepted(scoped, B, (await assistant.handle(turn.state, submitDate("2025-09-15"))) as ServiceDateTurn);
    for (const field of BIEN_DRAFT_FIELDS) assert.equal(next.declarationDraft?.[field], undefined, `${field} absent à plat`);
    assert.equal(scopedInvariantViolation(next), null);
    const unscoped: LmnpAction = { type: "DECLARATION_PATCH_DRAFT", patch: { dateMiseEnService: "2025-09-15" } };
    assert.equal(lmnpReducer(next, unscoped), next, "aucun repli à plat sans bien actif");
    const panel = source("src/components/lmnp/assistants/F010LogementAssistantPanel.tsx");
    assert.doesNotMatch(panel, /properties\[0\]|propertyIds\[0\]|workspace\.declarationDraft/);
  });
});
