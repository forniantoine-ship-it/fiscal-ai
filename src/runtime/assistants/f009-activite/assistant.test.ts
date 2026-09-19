import assert from "node:assert/strict";
import { test } from "node:test";
import { F009ActiviteAssistant, restoreF009, f009DraftPatch, nextMissingQuestion, hasF009Decisions, F009_QUESTIONS, toF009PersistedState } from "./assistant";
import type { F009Action, F009State } from "./types";
import type { DeclarationDraft } from "@/lib/lmnp/types/domain";
import { projectDocumentFactsToF009 } from "@/lib/documents/facts/f009-fact-projection";
import { groundActiviteFactExtraction } from "@/lib/documents/facts/grounding-engine";
import { INPI_RNE_808900351_OCR } from "@/lib/documents/facts/extraction/inpi-rne/fixtures/inpi-rne-808900351.fixture";
import { shouldShowInpiCompanion } from "@/components/lmnp/inpi-companion/should-show-inpi-companion";
import { identiteFromDeclarationDraft } from "@/lib/lmnp/services/f007/draft-to-liasse-inputs";
const assistant = new F009ActiviteAssistant({ dossierId: "test", fiscalYear: 2025, route: "/assistants/activite" });
const baseDraft: DeclarationDraft = { completedSteps: [], siret: "80890035100020", siren: "808900351", exploitantLastName: "Dupont", exploitantFirstName: "Marie", exploitantEmail: "contact@example.test", exploitantTelephone: "0102030405", establishmentAddress: "1 rue Test", establishmentCity: "Paris", establishmentPostalCode: "75001", activityStartDate: "2024-01-01", dateMiseEnService: "2024-02-01" };
const complete = (): F009State => ({ ...restoreF009(baseDraft), step: "review", registration: "yes" });
const projection = () => projectDocumentFactsToF009(groundActiviteFactExtraction(INPI_RNE_808900351_OCR, {}, "doc").extraction);
const handle = async (state: F009State, action: F009Action) => (await assistant.handle(state, action)).state;
const reload = (state: F009State, draft: DeclarationDraft = { completedSteps: [] }) => restoreF009({ ...draft, activiteAssistantState: JSON.parse(JSON.stringify(toF009PersistedState(state, "now"))) });

test("1. première question situation, puis document pour une activité immatriculée", async () => {
  const initial = assistant.start().state; assert.equal(initial.step, "situation");
  assert.equal((await handle(initial, { type: "select_registration", value: "yes" })).step, "document");
});
test("2. document complet : une synthèse, aucune confirmation individuelle", async () => {
  const reviewed = await handle(assistant.start().state, { type: "analysis_success", projection: projection() });
  assert.equal(reviewed.step, "review"); assert.equal(reviewed.siret, "80890035100020");
  assert.equal((await handle(reviewed, { type: "review_all" })).step, "service_date");
});
test("3. document partiel : conservation du trouvé, seule la donnée manquante est demandée", async () => {
  const p = projection(); p.activityStartDate = undefined;
  const reviewed = await handle(assistant.start().state, { type: "analysis_success", projection: p });
  const next = await handle(reviewed, { type: "review_all" }); assert.equal(next.step, "activity_date"); assert.equal(next.lastName, "FORNI");
});
test("4. email/téléphone absents ne bloquent ni ne deviennent une question", async () => {
  const s = complete(); s.email = undefined; s.telephone = undefined;
  assert.equal(nextMissingQuestion(s), undefined); assert.equal((await assistant.handle(s, { type: "review_all" })).completed, true);
});
test("5. draft partiel réutilisé avant chaque question", async () => {
  const s = restoreF009({ completedSteps: [], siret: baseDraft.siret, exploitantLastName: "Dupont", exploitantFirstName: "Marie" });
  assert.equal((await handle(s, { type: "manual" })).step, "address");
});
test("6. manuel SIRET connu : pas de SIREN séparé", async () => {
  const s = await handle({ ...assistant.start().state, step: "identifier" }, { type: "answer", values: { identifier: "808 900 351 00020" } });
  assert.equal(s.siren, "808900351"); assert.equal(s.step, "identity");
});
test("7. seul SIREN connu est conservé et suffit à l’identifiant", () => {
  const s = restoreF009({ ...baseDraft, siret: undefined }); assert.equal(nextMissingQuestion(s), undefined);
});
test("8. non immatriculé : information, sans collecte administrative bloquante", async () => {
  const s = await handle(assistant.start().state, { type: "select_registration", value: "no" });
  assert.equal(s.step, "pending_registration"); assert.equal(s.registration, "no");
});
test("9. poursuite sans SIRET ne prétend pas finaliser les données manquantes", async () => {
  const s = await handle(assistant.start().state, { type: "defer" });
  assert.equal(s.step, "complete"); assert.equal(s.deferred, true); assert.equal(f009DraftPatch(s, "now", true).inpiConfirmedAt, undefined);
});
test("10. retour sans SIRET : état conservé après reload", async () => {
  const s = await handle({ ...assistant.start().state, registration: "no" }, { type: "defer" });
  assert.equal(reload(s).step, "complete"); assert.equal(reload(s).registration, "no"); assert.equal(reload(s).deferred, true);
});
test("11. compagnon : les statuts existants couvrent progression, envoi et régularisation", () => {
  for (const status of ["preparing", "in_progress", "submitted", "regularization_required", "modification_in_progress"] as const) assert.equal(shouldShowInpiCompanion(status), true);
});
test("12. SIRET obtenu dans le Compagnon : retour en revue, données conservées", () => {
  const old = { ...complete(), step: "complete" as const, siret: undefined, deferred: true };
  const s = restoreF009({ ...baseDraft, activiteAssistantState: toF009PersistedState(old, "now") }, "registered");
  assert.equal(s.step, "review"); assert.equal(s.siret, baseDraft.siret); assert.equal(s.lastName, "Dupont"); assert.equal(s.deferred, false);
});
test("13. conflit avec draft fiable même sans confirmed F009", async () => {
  const s = await handle(complete(), { type: "analysis_success", projection: projection() });
  assert.equal(s.lastName, "Dupont"); assert.equal(s.conflicts?.lastName?.newValue, "FORNI"); assert.equal(hasF009Decisions(s), true);
});
test("14. choix de conflit structuré, conservé après reload", async () => {
  let s = await handle(complete(), { type: "analysis_success", projection: projection() });
  s = await handle(s, { type: "resolve_conflict", field: "lastName", value: "FORNI" });
  assert.equal(reload(s).lastName, "FORNI"); assert.equal(reload(s).resolutions?.[0].selected, "FORNI");
});
test("15. correction appliquée = valeur affichée et enregistrée, jamais l’ancienne", async () => {
  let s = await handle(complete(), { type: "edit_question", step: "identity" });
  s = await handle(s, { type: "answer", values: { lastName: "Martin", firstName: "Marie" } });
  assert.equal(s.lastName, "Martin"); assert.equal(f009DraftPatch(s, "now", true).exploitantLastName, "Martin");
});
test("16. modification après completion possible, aucun verrou définitif", async () => {
  let s = (await assistant.handle(complete(), { type: "review_all" })).state;
  s = await handle(s, { type: "edit" }); assert.equal(s.step, "edit");
  s = await handle(s, { type: "edit_question", step: "activity_date" });
  s = await handle(s, { type: "answer", values: { date: "2023-12-01" } }); assert.equal(s.dateDebutActivite, "2023-12-01");
});
test("17. Retour traverse les étapes effectivement éditables", async () => {
  let s = await handle(assistant.start().state, { type: "select_registration", value: "yes" });
  s = await handle(s, { type: "manual" }); assert.equal(s.step, "identifier");
  s = await handle(s, { type: "go_back" }); assert.equal(s.step, "document");
  s = await handle(s, { type: "go_back" }); assert.equal(s.step, "situation");
});
test("18. Retour conserve données, revue, confirmations et résolutions", async () => {
  const s = { ...complete(), history: ["document" as const], review: projection(), resolutions: [{ field: "lastName" as const, selected: "Dupont" }] };
  const back = await handle(s, { type: "go_back" }); assert.equal(back.lastName, s.lastName); assert.deepEqual(back.review, s.review); assert.deepEqual(back.resolutions, s.resolutions);
});
test("19. reload restaure aussi la saisie en cours sans transcript", async () => {
  const s = await handle({ ...complete(), step: "identity" }, { type: "stage_input", values: { firstName: "Anne", lastName: "Martin" } });
  const restored = reload(s); assert.equal(restored.inputs?.identity?.firstName, "Anne"); assert.equal("messages" in toF009PersistedState(s, "now"), false);
});
test("20. terminé avec SIRET : reprise complète du profil", async () => {
  const s = (await assistant.handle(complete(), { type: "review_all" })).state;
  const restored = reload(s); assert.equal(restored.step, "complete"); assert.equal(restored.email, baseDraft.exploitantEmail);
});
test("21. legacy terminé sans SIRET : migration, pas de redémarrage", () => {
  const s = restoreF009({ ...baseDraft, siret: undefined, activiteAssistantState: { step: "complete", updatedAt: "old" } });
  assert.equal(s.step, "complete"); assert.equal(s.lastName, "Dupont"); assert.equal(s.deferred, true);
});
test("22. reconfirmation legacy ne supprime aucun profil existant", () => {
  const s = restoreF009({ ...baseDraft, inpiConfirmedAt: "old" });
  const patch = f009DraftPatch(s, "new", true); const result = { ...baseDraft, ...patch };
  for (const key of ["exploitantLastName", "exploitantFirstName", "exploitantEmail", "exploitantTelephone", "establishmentAddress", "establishmentCity", "establishmentPostalCode"] as const) assert.equal(result[key], baseDraft[key]);
  assert.equal(identiteFromDeclarationDraft(result, 2025).adresseEntreprise, "1 rue Test, 75001, Paris");
});
test("23. choix établissement : SIRET et adresse associés", async () => {
  const p = projection(); p.siret = undefined; p.siretAmbiguous = true; p.establishmentAddress = undefined;
  p.siretCandidates = [{ siret: "80890035100020", entityId: "one", address: "8 rue Test, 33000 Bordeaux" }, { siret: "80890035100012", entityId: "two", address: "9 rue Test, 69001 Lyon" }];
  let s = await handle(assistant.start().state, { type: "analysis_success", projection: p });
  s = await handle(s, { type: "select_establishment", siret: "80890035100012" });
  assert.equal(s.establishmentAddressCity, "Lyon"); assert.equal(s.siret, "80890035100012"); assert.equal(s.review?.siretAmbiguous, false);
});
test("24. disponibilité : concept canonique, date prévisionnelle refusée", async () => {
  assert.match(F009_QUESTIONS.service_date.title, /disponible/);
  const s = await handle({ ...complete(), step: "service_date" }, { type: "answer", values: { date: "2099-01-01" } }); assert.ok(s.error);
});
test("25. début d’activité ≠ immatriculation", () => {
  const p = projection(); assert.equal(p.activityStartDate, "2019-01-02"); assert.equal(p.datesAmbiguous, false); assert.equal(p.immatriculationDateRaw, "2015-01-01");
});
test("26. aucune question régime et aucun choix fiscal ajouté", () => { assert.equal(Object.keys(F009_QUESTIONS).length, 5); assert.equal("regime" in F009_QUESTIONS, false); });
test("27. coordonnées facultatives contradictoires : conserver sans question", async () => {
  const p = projection(); p.email = "autre@example.test";
  const s = await handle(complete(), { type: "analysis_success", projection: p }); assert.equal(s.email, baseDraft.exploitantEmail); assert.equal(s.conflicts?.email, undefined);
});
test("28. vraie ambiguïté empêche validation globale, correction libre possible", async () => {
  const s = { ...complete(), review: { ...projection(), datesAmbiguous: true, activityStartDateCandidates: ["2024-01-01", "2024-01-02"] } };
  assert.ok((await handle(s, { type: "review_all" })).error);
  const corrected = await handle(s, { type: "correct_field", field: "dateDebutActivite", value: "2024-01-01" }); assert.equal(corrected.review?.datesAmbiguous, false);
});
test("29. analyse échouée : reprise ou manuel, état connu préservé", async () => {
  let s = await handle(complete(), { type: "upload_document", documentId: "doc" });
  s = await handle(s, { type: "analysis_failed", cause: "network" });
  assert.equal((await handle(s, { type: "retry" })).step, "analyzing");
  assert.equal((await handle(s, { type: "continue_manually" })).lastName, "Dupont");
});
test("30. adresse corrigée : ancien code postal et ville jamais conservés", async () => {
  const s = await handle(complete(), { type: "correct_field", field: "establishmentAddress", value: "9 rue Neuve, 69001 Lyon" });
  assert.equal(s.establishmentAddressPostalCode, "69001"); assert.equal(s.establishmentAddressCity, "Lyon");
  const noZip = await handle(s, { type: "correct_field", field: "establishmentAddress", value: "Adresse étrangère" }); assert.equal(noZip.establishmentAddressPostalCode, undefined);
});
test("31. SIRET invalide : même refus en saisie et correction documentaire", async () => {
  const a = await handle({ ...complete(), step: "identifier" }, { type: "answer", values: { identifier: "123" } });
  const b = await handle(complete(), { type: "correct_field", field: "siret", value: "123" }); assert.equal(a.error, b.error);
});
test("32. erreurs de dates empêchent la finalisation ; Retour ne relance pas l’analyse", async () => {
  assert.ok((await handle({ ...complete(), dateMiseEnService: "2023-01-01" }, { type: "review_all" })).error);
  const back = await handle({ ...complete(), history: ["document", "analyzing"] }, { type: "go_back" }); assert.equal(back.step, "document");
});
test("33. même adresse avec retours ligne : pas de faux conflit", async () => {
  const p = projection(); p.establishmentAddress = "1 rue Test\n75001 Paris";
  const s = await handle(complete(), { type: "analysis_success", projection: p }); assert.equal(s.conflicts?.establishmentAddress, undefined);
});
test("34. garder l’ancien SIRET conserve son adresse, sans décision incohérente", async () => {
  const p = projection(); p.siret = "80890035100012"; p.establishmentAddress = "8 rue Test, 69001 Lyon";
  let s = await handle(complete(), { type: "analysis_success", projection: p });
  s = await handle(s, { type: "resolve_conflict", field: "siret", value: "80890035100020" });
  assert.equal(s.establishmentAddress, "1 rue Test, 75001 Paris"); assert.equal(s.conflicts?.establishmentAddress, undefined);
  const reused = await handle(reload(s), { type: "analysis_success", projection: p });
  assert.equal(reused.siret, "80890035100020");
  assert.equal(reused.conflicts?.siret, undefined);
  assert.equal(reused.conflicts?.establishmentAddress, undefined);
  assert.equal(reused.resolutions?.find((entry) => entry.field === "establishmentAddress")?.selected, "1 rue Test, 75001 Paris");
});
test("35. modification libre lève aussi une ambiguïté documentaire", async () => {
  let s = { ...complete(), review: { ...projection(), datesAmbiguous: true, activityStartDateCandidates: ["2024-01-01", "2024-01-02"] } };
  s = await handle(s, { type: "edit_question", step: "activity_date" });
  s = await handle(s, { type: "answer", values: { date: "2024-01-03" } }); assert.equal(s.review?.datesAmbiguous, false);
});


test("SIRET différent sans adresse extraite : contrôle de l’adresse, sans effacement", async () => {
  const state = { ...complete(), review: { ...projection(), siretAmbiguous: false, siretCandidates: [{ siret: "10458947800015", establishmentType: "principal", entityId: "new-establishment" }] }, conflicts: { siret: { confirmedValue: baseDraft.siret!, newValue: "10458947800015" } } };
  const next = await handle(state, { type: "resolve_conflict", field: "siret", value: "10458947800015" });
  assert.equal(next.step, "address");
  assert.equal(next.editing, true);
  assert.equal(next.establishmentAddress, state.establishmentAddress);
  assert.equal(reload(next).step, "address");
  const checked = await handle(next, { type: "answer", values: { address: "12 rue Exemple, 69001 Lyon" } });
  assert.equal(checked.step, "review");
  assert.equal(checked.establishmentAddressCity, "Lyon");
});

test("37. changer la date de début d'activité efface la disponibilité devenue potentiellement incohérente, sans la garder confirmée en silence", async () => {
  const s = complete();
  assert.equal(s.dateMiseEnService, "2024-02-01");
  const edited = await handle({ ...s, step: "activity_date" }, { type: "answer", values: { date: "2024-06-01" } });
  assert.equal(edited.dateMiseEnService, undefined, "une valeur potentiellement incohérente ne doit jamais rester confirmée en silence");
  assert.equal(edited.confirmed?.dateMiseEnService, false);
  assert.equal(edited.step, "service_date", "nextMissingQuestion doit re-demander la disponibilité effacée");
});
test("38. changer la date de début d'activité pour une valeur identique ne réinitialise pas la disponibilité déjà connue", async () => {
  const s = complete();
  const unchanged = await handle({ ...s, step: "activity_date" }, { type: "answer", values: { date: "2024-01-01" } });
  assert.equal(unchanged.dateMiseEnService, "2024-02-01");
});

// --- Régression E2E Payment 2025 : identité INPI confirmée (formulaire manuel) SANS dates ---
// Avant le correctif, restoreF009 concluait « complete » dès que inpiConfirmedAt était posé :
// le Logement réclamait ensuite la date de mise en service sans que l'Activité ne la demande.
const identityOnlyDraft = (): DeclarationDraft => ({
  completedSteps: [], inpiConfirmedAt: "2025-09-19T19:51:54.652Z", activityType: "LMNP",
  exploitantLastName: "TESTEUR", exploitantFirstName: "Alice", exploitantEmail: "alice@example.test",
  personalAddress: "12 rue de l'Exemple", personalCity: "Paris", personalPostalCode: "75001",
});
test("39. identité INPI confirmée + aucune date : restauration vers la première date manquante, jamais complete", () => {
  const s = restoreF009(identityOnlyDraft());
  assert.notEqual(s.step, "complete");
  assert.equal(s.step, "activity_date");
  assert.equal(nextMissingQuestion(s), "activity_date");
  assert.equal(s.deferred, true, "sans SIRET : reporté, la question SIRET n'est pas reposée");
  assert.equal(s.lastName, "TESTEUR", "l'identité déjà confirmée est conservée");
});
test("40. identité confirmée + date de début présente, mise en service absente : restauration vers dateMiseEnService", () => {
  const s = restoreF009({ ...identityOnlyDraft(), activityStartDate: "2025-02-01" });
  assert.notEqual(s.step, "complete");
  assert.equal(s.step, "service_date");
  assert.equal(s.dateDebutActivite, "2025-02-01");
});
test("41. identité confirmée + les deux dates présentes : complete (comportement inchangé)", () => {
  const s = restoreF009({ ...identityOnlyDraft(), activityStartDate: "2025-02-01", dateMiseEnService: "2025-02-01" });
  assert.equal(s.step, "complete");
  assert.equal(s.deferred, true);
  assert.equal(nextMissingQuestion(s), undefined);
});
test("42. parcours normal inchangé : SIRET connu, dates présentes, inpiConfirmedAt → complete sans SIRET reposé", () => {
  const s = restoreF009({ ...baseDraft, inpiConfirmedAt: "old" });
  assert.equal(s.step, "complete");
  assert.notEqual(s.deferred, true);
  assert.equal(s.siret, baseDraft.siret);
});
test("43. parcours complet après reprise : les deux dates sont demandées, jamais le SIRET, puis complete avec dates persistées", async () => {
  let s = restoreF009(identityOnlyDraft());
  assert.equal(s.step, "activity_date");
  s = await handle(s, { type: "answer", values: { date: "2025-02-01" } });
  assert.equal(s.step, "service_date", "après la date de début, la disponibilité est demandée — pas le SIRET");
  s = await handle(s, { type: "answer", values: { date: "2025-02-01" } });
  assert.equal(s.step, "review");
  const turnResult = await assistant.handle(s, { type: "review_all" });
  assert.equal(turnResult.completed, true);
  assert.equal(turnResult.state.step, "complete");
  const patch = f009DraftPatch(turnResult.state, "2025-09-19T20:00:00.000Z", true);
  assert.equal(patch.activityStartDate, "2025-02-01");
  assert.equal(patch.dateMiseEnService, "2025-02-01", "la date que le Logement exige est bien écrite dans le dossier");
  assert.equal(patch.inpiConfirmedAt, "2025-09-19T20:00:00.000Z");
});
test("44. reprise après reload d'une session interrompue à la question de date : la question est conservée", async () => {
  const s = restoreF009(identityOnlyDraft());
  const reloaded = reload(s, identityOnlyDraft());
  assert.equal(reloaded.step, "activity_date");
});
