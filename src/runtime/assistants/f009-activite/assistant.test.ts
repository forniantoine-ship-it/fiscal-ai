/**
 * Run: npx tsx src/runtime/assistants/f009-activite/assistant.test.ts
 */
import type { ActiviteFieldProvenance } from "@/lib/lmnp/services/activite-field-provenance";
import type { F009DocumentProjection } from "@/lib/documents/facts/f009-fact-projection";

import { F009ActiviteAssistant } from "./assistant";
import {
  createF009IntroState,
  createInitialF009State,
  shouldResumeF009,
  toF009PersistedState,
} from "./types";
import type { F009PersistedState, F009State } from "./types";

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertTrue(actual: boolean, message: string): void {
  if (!actual) throw new Error(`${message}: expected true, got false`);
}

function assertUndefined(actual: unknown, message: string): void {
  if (actual !== undefined) {
    throw new Error(`${message}: expected undefined, got ${JSON.stringify(actual)}`);
  }
}

const CTX = { dossierId: "dossier-1", fiscalYear: 2026 };

const EXTRACTED: ActiviteFieldProvenance = { status: "extracted", origin: "inpi_document", fieldSource: "extracted" };
const MISSING: ActiviteFieldProvenance = { status: "missing", origin: "inpi_document" };
const PROPOSED: ActiviteFieldProvenance = { status: "proposed", origin: "fiscal_ai", fieldSource: "judgment" };

function projection(overrides: Partial<F009DocumentProjection> = {}): F009DocumentProjection {
  return {
    siret: "12345678901234",
    siretProvenance: EXTRACTED,
    siretAmbiguous: false,
    siretCandidates: [{ siret: "12345678901234", entityId: "12345678901234" }],
    activityStartDate: "2024-03-05",
    activityStartDateProvenance: EXTRACTED,
    activityStartDateRaw: "2024-03-05",
    immatriculationDateRaw: "2024-03-05",
    datesAmbiguous: false,
    lastName: "Dupont",
    lastNameProvenance: EXTRACTED,
    firstName: "Marie",
    firstNameProvenance: EXTRACTED,
    email: "marie.dupont@example.com",
    emailProvenance: EXTRACTED,
    telephone: "0612345678",
    telephoneProvenance: EXTRACTED,
    personalAddress: "4 allée Malbec, 33650 Saint-Médard-d'Eyrans",
    personalAddressProvenance: EXTRACTED,
    personalAddressCity: "Saint-Médard-d'Eyrans",
    personalAddressPostalCode: "33650",
    establishmentAddress: undefined,
    establishmentAddressProvenance: MISSING,
    establishmentAddressCity: undefined,
    establishmentAddressPostalCode: undefined,
    ...overrides,
  };
}

async function runTests(): Promise<void> {
  let passed = 0;
  let total = 0;

  async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
    total++;
    try {
      await fn();
      passed++;
      console.log(`  ✓ ${name}`);
    } catch (err) {
      console.error(`  ✗ ${name}`);
      console.error(`    ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log("f009-activite/assistant.ts");
  const assistant = new F009ActiviteAssistant(CTX);

  await test("INTRO → NO_DOCUMENT", async () => {
    const turn = await assistant.handle(createF009IntroState(), { type: "select_no_document" });
    assertEqual(turn.state.step, "no_document", "step");
    assertEqual(turn.state.history?.at(-1), "intro", "history");
  });

  await test("INTRO → ANALYZING", async () => {
    const turn = await assistant.handle(createF009IntroState(), { type: "upload_document" });
    assertEqual(turn.state.step, "analyzing", "step");
  });

  await test("ANALYZING → REVIEW_EXTRACTED_DATA (facts appliqués, provenance extracted)", async () => {
    const analyzing = (await assistant.handle(createF009IntroState(), { type: "upload_document" })).state;
    const turn = await assistant.handle(analyzing, {
      type: "analysis_success",
      projection: projection(),
    });
    assertEqual(turn.state.step, "review_extracted_data", "step");
    assertEqual(turn.state.siret, "12345678901234", "siret");
    assertEqual(turn.state.dateDebutActivite, "2024-03-05", "dateDebutActivite");
    assertEqual(turn.state.confirmed?.siret, false, "siret non confirmé automatiquement");
    assertUndefined(turn.state.conflicts?.siret, "pas de conflit");
  });

  await test("ANALYZING → ANALYSIS_FAILED", async () => {
    const analyzing = (await assistant.handle(createF009IntroState(), { type: "upload_document" })).state;
    const turn = await assistant.handle(analyzing, { type: "analysis_failed", cause: "unrecognized" });
    assertEqual(turn.state.step, "analysis_failed", "step");
    assertEqual(turn.state.analysisFailureCause, "unrecognized", "cause");
  });

  await test("REVIEW → ASK_MISSING_DATA (aucun conflit)", async () => {
    const analyzing = (await assistant.handle(createF009IntroState(), { type: "upload_document" })).state;
    const review = (
      await assistant.handle(analyzing, { type: "analysis_success", projection: projection() })
    ).state;
    const turn = await assistant.handle(review, { type: "continue_review" });
    assertEqual(turn.state.step, "ask_missing_data", "step");
  });

  await test("REVIEW → bloqué tant qu'un conflit siret n'est pas résolu", async () => {
    const conflicted: F009State = {
      ...createF009IntroState(),
      step: "review_extracted_data",
      siret: "OLD00000000001",
      confirmed: { siret: true },
      conflicts: { siret: { confirmedValue: "OLD00000000001", newValue: "NEW00000000002" } },
    };
    const turn = await assistant.handle(conflicted, { type: "continue_review" });
    assertEqual(turn.state.step, "review_extracted_data", "reste bloqué en revue");
  });

  await test("NO_DOCUMENT → MANUAL_PROFILE", async () => {
    const noDoc = (await assistant.handle(createF009IntroState(), { type: "select_no_document" })).state;
    const turn = await assistant.handle(noDoc, { type: "submit_siret_known", known: false });
    assertEqual(turn.state.step, "manual_profile", "step");
  });

  await test("MANUAL_PROFILE → ASK_MISSING_DATA", async () => {
    const noDoc = (await assistant.handle(createF009IntroState(), { type: "select_no_document" })).state;
    const manual = (await assistant.handle(noDoc, { type: "submit_siret_known", known: false })).state;
    const turn = await assistant.handle(manual, {
      type: "submit_manual_activity_date",
      dateDebutActivite: "2024-01-15",
    });
    assertEqual(turn.state.step, "ask_missing_data", "step");
    assertEqual(turn.state.dateDebutActivite, "2024-01-15", "dateDebutActivite");
    assertTrue(turn.state.confirmed?.dateDebutActivite === true, "confirmed");
  });

  await test("DOCUMENT_FOUND_LATER → ANALYZING (depuis MANUAL_PROFILE)", async () => {
    const noDoc = (await assistant.handle(createF009IntroState(), { type: "select_no_document" })).state;
    const manual = (await assistant.handle(noDoc, { type: "submit_siret_known", known: false })).state;
    const turn = await assistant.handle(manual, { type: "upload_document" });
    assertEqual(turn.state.step, "analyzing", "step");
  });

  await test("GO_BACK revient au point de contrôle précédent, sans RESTART global", async () => {
    const noDoc = (await assistant.handle(createF009IntroState(), { type: "select_no_document" })).state;
    const manual = (await assistant.handle(noDoc, { type: "submit_siret_known", known: false })).state;
    assertEqual(manual.step, "manual_profile", "sanity: en manual_profile");
    assertEqual(manual.manualProfile?.siretKnown, false, "sanity: siretKnown posé");

    const back = await assistant.handle(manual, { type: "go_back" });
    assertEqual(back.state.step, "no_document", "revient à NO_DOCUMENT, pas à intro");
    assertEqual(back.state.manualProfile?.siretKnown, false, "les données saisies restent en mémoire");
  });

  await test("GO_BACK depuis COMPLETE rouvre CONFIRMING, même sans historique (reprise legacy)", async () => {
    const resumed: F009State = {
      step: "complete",
      siret: "12345678901234",
      dateDebutActivite: "2024-03-05",
      dateMiseEnService: "2024-04-01",
      regimeFiscal: "reel_simplifie",
      fieldSources: {},
    };
    const turn = await assistant.handle(resumed, { type: "go_back" });
    assertEqual(turn.state.step, "confirmation", "step");
    assertEqual(turn.state.siret, "12345678901234", "données conservées");
  });

  await test("GO_BACK depuis COMPLETE avec historique réel, puis un second GO_BACK continue de reculer", async () => {
    const analyzing = (await assistant.handle(createF009IntroState(), { type: "upload_document" })).state;
    const review = (
      await assistant.handle(analyzing, { type: "analysis_success", projection: projection() })
    ).state;
    const missing = (await assistant.handle(review, { type: "continue_review" })).state;
    const confirming = (
      await assistant.handle(missing, { type: "submit_mise_en_service", dateMiseEnService: "2024-04-01" })
    ).state;
    const complete = (await assistant.handle(confirming, { type: "confirm" })).state;
    assertEqual(complete.step, "complete", "sanity: complete");

    const backOnce = await assistant.handle(complete, { type: "go_back" });
    assertEqual(backOnce.state.step, "confirmation", "1er GO_BACK → confirmation");

    const backTwice = await assistant.handle(backOnce.state, { type: "go_back" });
    assertEqual(backTwice.state.step, "ask_missing_data", "2e GO_BACK → ask_missing_data (via historique)");
  });

  await test("GO_BACK sans historique et hors COMPLETE est un no-op", async () => {
    const turn = await assistant.handle(createF009IntroState(), { type: "go_back" });
    assertEqual(turn.state.step, "intro", "reste sur intro");
  });

  await test("Modification de la date de début d'activité invalide la date de mise en service déjà confirmée", async () => {
    const analyzing = (await assistant.handle(createF009IntroState(), { type: "upload_document" })).state;
    const review = (
      await assistant.handle(analyzing, { type: "analysis_success", projection: projection() })
    ).state;
    const missing = (await assistant.handle(review, { type: "continue_review" })).state;
    const confirming = (
      await assistant.handle(missing, { type: "submit_mise_en_service", dateMiseEnService: "2024-04-01" })
    ).state;
    assertEqual(confirming.dateMiseEnService, "2024-04-01", "sanity");
    assertTrue(confirming.confirmed?.dateMiseEnService === true, "sanity: confirmé");
    assertTrue(typeof confirming.explanation === "string" && confirming.explanation.length > 0, "sanity: prorata calculé");

    // L'utilisateur revient en arrière et corrige la date de début d'activité extraite.
    const backToReview = (await assistant.handle(confirming, { type: "go_back" })).state; // → ask_missing_data
    const backToReview2 = (await assistant.handle(backToReview, { type: "go_back" })).state; // → review_extracted_data
    assertEqual(backToReview2.step, "review_extracted_data", "sanity: retour en revue");

    const corrected = await assistant.handle(backToReview2, {
      type: "correct_field",
      field: "dateDebutActivite",
      value: "2024-05-20",
    });

    assertEqual(corrected.state.dateDebutActivite, "2024-05-20", "nouvelle date appliquée");
    assertUndefined(corrected.state.dateMiseEnService, "date de mise en service invalidée");
    assertUndefined(corrected.state.explanation, "prorata invalidé");
    assertUndefined(corrected.state.prorataPercent, "prorataPercent invalidé");
    assertUndefined(corrected.state.confirmed?.dateMiseEnService, "confirmation invalidée");
  });

  await test("Retry après échec repart en ANALYZING et efface la cause d'échec", async () => {
    const analyzing = (await assistant.handle(createF009IntroState(), { type: "upload_document" })).state;
    const failed = (
      await assistant.handle(analyzing, { type: "analysis_failed", cause: "ocr_failed" })
    ).state;
    const turn = await assistant.handle(failed, { type: "retry" });
    assertEqual(turn.state.step, "analyzing", "step");
    assertUndefined(turn.state.analysisFailureCause, "cause effacée");
  });

  await test("Fusion manuel → document : le SIRET saisi manuellement est confirmé immédiatement (verrouillé)", async () => {
    const noDoc = (await assistant.handle(createF009IntroState(), { type: "select_no_document" })).state;
    const manual = (
      await assistant.handle(noDoc, { type: "submit_siret_known", known: true, siret: "99999999900009" })
    ).state;
    assertTrue(manual.siret === "99999999900009", "sanity");
    assertTrue(manual.confirmed?.siret === true, "une saisie manuelle soumise vaut confirmation explicite");
  });

  await test("Fusion document → document : une valeur NON confirmée est librement remplacée par un second document", async () => {
    const analyzing = (await assistant.handle(createF009IntroState(), { type: "upload_document" })).state;
    const review = (
      await assistant.handle(analyzing, { type: "analysis_success", projection: projection() })
    ).state;
    assertTrue(review.confirmed?.siret === false, "sanity: pas encore confirmé après une simple extraction");

    const secondUpload = (await assistant.handle(review, { type: "upload_document" })).state;
    const secondAnalysis = await assistant.handle(secondUpload, {
      type: "analysis_success",
      projection: projection({ siret: "00000000000099" }),
    });

    assertEqual(secondAnalysis.state.siret, "00000000000099", "remplacé librement — rien n'était verrouillé");
    assertUndefined(secondAnalysis.state.conflicts?.siret, "aucun conflit sur une valeur non confirmée");
  });

  await test("Fusion document → document : une valeur CONFIRMÉE n'est jamais écrasée silencieusement", async () => {
    const analyzing = (await assistant.handle(createF009IntroState(), { type: "upload_document" })).state;
    const review = (
      await assistant.handle(analyzing, { type: "analysis_success", projection: projection() })
    ).state;
    const confirmed = await assistant.handle(review, { type: "confirm_field", field: "siret" });
    assertTrue(confirmed.state.confirmed?.siret === true, "sanity: siret confirmé");

    const secondUpload = (await assistant.handle(confirmed.state, { type: "upload_document" })).state;
    const secondAnalysis = await assistant.handle(secondUpload, {
      type: "analysis_success",
      projection: projection({ siret: "00000000000099" }),
    });

    assertEqual(secondAnalysis.state.siret, "12345678901234", "valeur confirmée conservée, pas écrasée");
    assertTrue(secondAnalysis.state.confirmed?.siret === true, "reste confirmé");
    assertEqual(secondAnalysis.state.conflicts?.siret?.confirmedValue, "12345678901234", "conflit expose l'ancienne valeur");
    assertEqual(secondAnalysis.state.conflicts?.siret?.newValue, "00000000000099", "conflit expose la nouvelle valeur");
  });

  await test("Absence dans une nouvelle analyse n'efface jamais une valeur déjà établie", async () => {
    const analyzing = (await assistant.handle(createF009IntroState(), { type: "upload_document" })).state;
    const review = (
      await assistant.handle(analyzing, { type: "analysis_success", projection: projection() })
    ).state;

    const secondUpload = (await assistant.handle(review, { type: "upload_document" })).state;
    const secondAnalysis = await assistant.handle(secondUpload, {
      type: "analysis_success",
      projection: projection({ siret: undefined, siretCandidates: [] }),
    });

    assertEqual(secondAnalysis.state.siret, "12345678901234", "SIRET du premier document conservé");
  });

  await test("start() renvoie désormais INTRO (F009 devient le point d'orchestration, Étape 3)", async () => {
    const start = assistant.start();
    assertEqual(start.state.step, "intro", "step");
    assertEqual(start.messages[0]?.suggestions?.length, 2, "2 suggestions : importer / pas de document");
  });

  await test("Chemin manuel legacy (orientation → ... → complete), toujours atteignable directement", async () => {
    const siretStep = await assistant.handle(createInitialF009State(), {
      type: "select_orientation",
      orientation: "registered_siret",
    });
    assertEqual(siretStep.state.step, "collect_siret", "step");

    const activityStep = await assistant.handle(siretStep.state, {
      type: "submit_siret",
      siret: "73282932000074",
    });
    assertEqual(activityStep.state.step, "collect_activity", "step");
    assertTrue(activityStep.state.siret !== undefined, "siret normalisé appliqué");

    const miseEnServiceStep = await assistant.handle(activityStep.state, {
      type: "submit_activity",
      dateDebutActivite: "2024-01-01",
      regimeFiscal: "reel_simplifie",
    });
    assertEqual(miseEnServiceStep.state.step, "mise_en_service", "step");

    const confirmationStep = await assistant.handle(miseEnServiceStep.state, {
      type: "submit_mise_en_service",
      dateMiseEnService: "2024-02-01",
    });
    assertEqual(confirmationStep.state.step, "confirmation", "step");

    const completeStep = await assistant.handle(confirmationStep.state, { type: "confirm" });
    assertEqual(completeStep.state.step, "complete", "step");
    assertTrue(completeStep.completed, "turn.completed");
  });

  // ---------------------------------------------------------------------
  // Tests requis Étape 3 (A-I) non déjà couverts ci-dessus.
  // ---------------------------------------------------------------------

  await test("D. Extraction partielle : le champ manquant n'empêche pas la progression, reste éditable", async () => {
    const analyzing = (await assistant.handle(createF009IntroState(), { type: "upload_document" })).state;
    const review = (
      await assistant.handle(analyzing, {
        type: "analysis_success",
        projection: projection({
          activityStartDate: undefined,
          activityStartDateRaw: undefined,
          activityStartDateProvenance: MISSING,
          immatriculationDateRaw: undefined,
        }),
      })
    ).state;
    assertEqual(review.siret, "12345678901234", "siret toujours extrait");
    assertUndefined(review.dateDebutActivite, "date manquante, pas bloquante");
    assertUndefined(review.conflicts?.dateDebutActivite, "aucun conflit — juste une absence");

    // Continuer malgré le champ manquant.
    const missing = await assistant.handle(review, { type: "continue_review" });
    assertEqual(missing.state.step, "ask_missing_data", "la progression n'est pas bloquée par le champ manquant");

    // Le champ manquant reste corrigeable après coup (retour en arrière).
    const back = await assistant.handle(missing.state, { type: "go_back" });
    assertEqual(back.state.step, "review_extracted_data", "sanity");
    const corrected = await assistant.handle(back.state, {
      type: "correct_field",
      field: "dateDebutActivite",
      value: "2024-06-01",
    });
    assertEqual(corrected.state.dateDebutActivite, "2024-06-01", "champ manquant éditable manuellement");
  });

  await test("E. Mauvais document : ANALYSIS_FAILED propose retry ET bascule manuel", async () => {
    const analyzing = (await assistant.handle(createF009IntroState(), { type: "upload_document" })).state;
    const failed = (
      await assistant.handle(analyzing, { type: "analysis_failed", cause: "unrecognized" })
    ).state;

    const viaRetry = await assistant.handle(failed, { type: "retry" });
    assertEqual(viaRetry.state.step, "analyzing", "issue 1 : réessayer");

    const viaManual = await assistant.handle(failed, { type: "continue_manually" });
    assertEqual(viaManual.state.step, "no_document", "issue 2 : continuer sans document");
  });

  await test("G. Document après saisie manuelle CONFIRMÉE : la valeur confirmée est protégée, conflit explicite", async () => {
    const noDoc = (await assistant.handle(createF009IntroState(), { type: "select_no_document" })).state;
    const manual = (
      await assistant.handle(noDoc, { type: "submit_siret_known", known: true, siret: "99999999900009" })
    ).state;
    assertTrue(manual.confirmed?.siret === true, "sanity : saisie manuelle confirmée");

    const analyzing = (await assistant.handle(manual, { type: "upload_document" })).state;
    const afterDoc = await assistant.handle(analyzing, {
      type: "analysis_success",
      projection: projection({ siret: "12345678901234" }),
    });

    assertEqual(afterDoc.state.siret, "99999999900009", "valeur manuelle confirmée conservée");
    assertEqual(afterDoc.state.conflicts?.siret?.confirmedValue, "99999999900009", "conflit expose la valeur confirmée");
    assertEqual(afterDoc.state.conflicts?.siret?.newValue, "12345678901234", "conflit expose la valeur du document");
  });

  await test("I. Parcours manuel complet (sans document), de bout en bout, reste fonctionnel", async () => {
    const noDoc = (await assistant.handle(createF009IntroState(), { type: "select_no_document" })).state;
    const manual = (await assistant.handle(noDoc, { type: "submit_siret_known", known: false })).state;
    const missing = (
      await assistant.handle(manual, { type: "submit_manual_activity_date", dateDebutActivite: "2024-01-10" })
    ).state;
    const confirming = (
      await assistant.handle(missing, { type: "submit_mise_en_service", dateMiseEnService: "2024-03-01" })
    ).state;
    assertEqual(confirming.step, "confirmation", "step");
    const complete = await assistant.handle(confirming, { type: "confirm" });
    assertEqual(complete.state.step, "complete", "le parcours manuel se termine sans jamais avoir touché au document");
    assertTrue(complete.completed, "turn.completed");
  });

  // ---------------------------------------------------------------------
  // Tests requis Étape 4 — persistance intermédiaire (1-10).
  // ---------------------------------------------------------------------

  const now = () => new Date().toISOString();

  await test("1. Abandon en INTRO : rien à reprendre", async () => {
    const persisted = toF009PersistedState(createF009IntroState(), now());
    assertEqual(shouldResumeF009(persisted), false, "aucune progression réelle, pas de reprise");
  });

  await test("2. Abandon pendant ANALYZING : reprend l'analyse du même document", async () => {
    const analyzing = (
      await assistant.handle(createF009IntroState(), { type: "upload_document", documentId: "doc-42" })
    ).state;
    const persisted = toF009PersistedState(analyzing, now());
    assertTrue(shouldResumeF009(persisted), "sanity : reprise attendue");

    const resumed = assistant.resume(persisted);
    assertEqual(resumed.state.step, "analyzing", "step");
    assertEqual(resumed.state.analyzingDocumentId, "doc-42", "documentId conservé pour relancer sans ré-upload");
    assertTrue(
      resumed.messages[0]?.content.includes("analyse") ?? false,
      "message de reprise contextualisé sur l'analyse",
    );
  });

  await test("3. Abandon en REVIEW : données et provenance restaurées, message contextualisé", async () => {
    const analyzing = (await assistant.handle(createF009IntroState(), { type: "upload_document" })).state;
    const review = (
      await assistant.handle(analyzing, { type: "analysis_success", projection: projection() })
    ).state;
    const persisted = toF009PersistedState(review, now());

    const resumed = assistant.resume(persisted);
    assertEqual(resumed.state.step, "review_extracted_data", "step");
    assertEqual(resumed.state.siret, "12345678901234", "siret restauré");
    assertEqual(resumed.state.dateDebutActivite, "2024-03-05", "date restaurée");
    assertEqual(resumed.state.review?.siretProvenance.status, "extracted", "provenance restaurée");
    assertTrue(
      resumed.messages[0]?.content.includes("Vous avez déjà fourni") ?? false,
      "message contextualisé, pas un redémarrage générique",
    );
  });

  await test("4. Abandon en MANUAL_PROFILE : SIRET connu/inconnu restauré", async () => {
    const noDoc = (await assistant.handle(createF009IntroState(), { type: "select_no_document" })).state;
    const manual = (await assistant.handle(noDoc, { type: "submit_siret_known", known: false })).state;
    const persisted = toF009PersistedState(manual, now());

    const resumed = assistant.resume(persisted);
    assertEqual(resumed.state.step, "manual_profile", "step");
    assertEqual(resumed.state.manualProfile?.siretKnown, false, "sous-état manuel restauré");
  });

  await test("5. Abandon en ASK_MISSING_DATA : SIRET + date déjà connus ne sont pas redemandés, seule la date de mise en service manque", async () => {
    const analyzing = (await assistant.handle(createF009IntroState(), { type: "upload_document" })).state;
    const review = (
      await assistant.handle(analyzing, { type: "analysis_success", projection: projection() })
    ).state;
    const missing = (await assistant.handle(review, { type: "continue_review" })).state;
    const persisted = toF009PersistedState(missing, now());

    const resumed = assistant.resume(persisted);
    assertEqual(resumed.state.step, "ask_missing_data", "step");
    assertEqual(resumed.state.siret, "12345678901234", "siret toujours là");
    assertEqual(resumed.state.dateDebutActivite, "2024-03-05", "date toujours là");
    const content = resumed.messages[0]?.content ?? "";
    assertTrue(content.includes("votre SIRET (12345678901234)"), "message mentionne le SIRET connu");
    assertTrue(content.includes("votre date de début d'activité"), "message mentionne la date connue");
    assertEqual(
      content.endsWith("Il ne manque que votre date de mise en service."),
      true,
      "seule la date de mise en service manque",
    );
  });

  await test("6. Reprise après refresh : round-trip fidèle (sérialiser puis restaurer)", async () => {
    const noDoc = (await assistant.handle(createF009IntroState(), { type: "select_no_document" })).state;
    const manual = (
      await assistant.handle(noDoc, { type: "submit_siret_known", known: true, siret: "99999999900009" })
    ).state;
    const persisted = toF009PersistedState(manual, now());
    const resumed = assistant.resume(persisted).state;

    assertEqual(resumed.step, manual.step, "step identique après un aller-retour sérialisation");
    assertEqual(resumed.siret, manual.siret, "siret identique");
    assertEqual(resumed.confirmed?.siret, manual.confirmed?.siret, "confirmation identique");
  });

  await test("7. Reprise après nouvelle instance React : aucun état caché dans l'instance", async () => {
    const analyzing = (await assistant.handle(createF009IntroState(), { type: "upload_document" })).state;
    const review = (
      await assistant.handle(analyzing, { type: "analysis_success", projection: projection() })
    ).state;
    const persisted = toF009PersistedState(review, now());

    const freshAssistant = new F009ActiviteAssistant(CTX);
    const resumed = freshAssistant.resume(persisted);
    assertEqual(resumed.state.step, "review_extracted_data", "une nouvelle instance restaure exactement pareil");
    assertEqual(resumed.state.siret, "12345678901234", "siret");
  });

  await test("8. COMPLETE : aucun état de reprise affiché", async () => {
    const completePersisted: F009PersistedState = { step: "complete", updatedAt: now() };
    assertEqual(shouldResumeF009(completePersisted), false, "COMPLETE est géré par le raccourci existant, pas par la reprise");
  });

  await test("9. Information confirmée : jamais redemandée après reprise", async () => {
    const analyzing = (await assistant.handle(createF009IntroState(), { type: "upload_document" })).state;
    const review = (
      await assistant.handle(analyzing, { type: "analysis_success", projection: projection() })
    ).state;
    const siretConfirmed = (await assistant.handle(review, { type: "confirm_field", field: "siret" })).state;
    const dateConfirmed = (
      await assistant.handle(siretConfirmed, { type: "confirm_field", field: "dateDebutActivite" })
    ).state;
    // Le dossier avait déjà été jusqu'à la confirmation de la mise en service, puis l'utilisateur
    // est revenu en arrière consulter la revue (GO_BACK) avant d'abandonner.
    const withMiseEnService: F009State = {
      ...dateConfirmed,
      dateMiseEnService: "2024-04-01",
      confirmed: { ...dateConfirmed.confirmed, dateMiseEnService: true },
    };
    const persisted = toF009PersistedState(withMiseEnService, now());

    const resumed = assistant.resume(persisted).state;
    assertTrue(resumed.confirmed?.siret === true, "sanity");
    assertTrue(resumed.confirmed?.dateDebutActivite === true, "sanity");
    assertTrue(resumed.confirmed?.dateMiseEnService === true, "sanity");

    // Continuer la revue ne redemande ni le SIRET ni la date — et saute directement
    // la question de mise en service puisqu'elle est déjà confirmée aussi.
    const next = await assistant.handle(resumed, { type: "continue_review" });
    assertEqual(next.state.step, "confirmation", "saute ASK_MISSING_DATA — rien à redemander");
  });

  await test("10. Persistance de GO_BACK : la position après retour arrière est ce qui est repris", async () => {
    const analyzing = (await assistant.handle(createF009IntroState(), { type: "upload_document" })).state;
    const review = (
      await assistant.handle(analyzing, { type: "analysis_success", projection: projection() })
    ).state;
    const missing = (await assistant.handle(review, { type: "continue_review" })).state;

    const backToReview = (await assistant.handle(missing, { type: "go_back" })).state;
    assertEqual(backToReview.step, "review_extracted_data", "sanity : retour effectué avant la persistance");

    const persisted = toF009PersistedState(backToReview, now());
    const resumed = assistant.resume(persisted).state;
    assertEqual(resumed.step, "review_extracted_data", "reprend bien la position POST-GO_BACK, pas ANALYZING ni ASK_MISSING_DATA");

    // Et l'historique restauré permet de continuer à reculer normalement ensuite.
    const secondGoBack = await assistant.handle(resumed, { type: "go_back" });
    assertEqual(secondGoBack.state.step, "analyzing", "l'historique persisté reste utilisable après reprise");
  });

  // ---------------------------------------------------------------------
  // Jalon "préremplissage profil" — 6 champs profil réutilisés depuis la
  // projection Tunnel A existante (1-10).
  // ---------------------------------------------------------------------

  await test("1. Extraction complète du profil : les 6 champs sont dans REVIEW_EXTRACTED_DATA", async () => {
    const analyzing = (await assistant.handle(createF009IntroState(), { type: "upload_document" })).state;
    const review = (
      await assistant.handle(analyzing, { type: "analysis_success", projection: projection() })
    ).state;

    assertEqual(review.step, "review_extracted_data", "step");
    assertEqual(review.lastName, "Dupont", "nom");
    assertEqual(review.firstName, "Marie", "prénom");
    assertEqual(review.email, "marie.dupont@example.com", "email");
    assertEqual(review.telephone, "0612345678", "téléphone");
    assertEqual(review.personalAddress, "4 allée Malbec, 33650 Saint-Médard-d'Eyrans", "adresse personnelle");
    assertEqual(review.personalAddressCity, "Saint-Médard-d'Eyrans", "ville personnelle portée pour declarationDraft");
    assertEqual(review.personalAddressPostalCode, "33650", "code postal personnel porté pour declarationDraft");
  });

  await test("2. Extraction partielle du profil : les champs manquants ne bloquent rien", async () => {
    const analyzing = (await assistant.handle(createF009IntroState(), { type: "upload_document" })).state;
    const review = (
      await assistant.handle(analyzing, {
        type: "analysis_success",
        projection: projection({
          telephone: undefined,
          telephoneProvenance: MISSING,
          establishmentAddress: undefined,
          establishmentAddressProvenance: MISSING,
        }),
      })
    ).state;

    assertUndefined(review.telephone, "téléphone absent");
    assertEqual(review.lastName, "Dupont", "le reste du profil est bien là");

    const turn = await assistant.handle(review, { type: "continue_review" });
    assertEqual(turn.state.step, "ask_missing_data", "les champs profil manquants ne bloquent jamais la progression");
  });

  await test("3. Valeur proposée : affichée avec son statut, confirmable", async () => {
    const analyzing = (await assistant.handle(createF009IntroState(), { type: "upload_document" })).state;
    const review = (
      await assistant.handle(analyzing, {
        type: "analysis_success",
        projection: projection({ establishmentAddress: "12 rue du Siège, 75002 Paris", establishmentAddressProvenance: PROPOSED }),
      })
    ).state;

    assertEqual(review.review?.establishmentAddressProvenance.status, "proposed", "statut proposé porté par la revue");
    assertEqual(review.confirmed?.establishmentAddress, false, "pas confirmé tant que l'utilisateur ne l'a pas fait");

    const confirmed = await assistant.handle(review, { type: "confirm_field", field: "establishmentAddress" });
    assertTrue(confirmed.state.confirmed?.establishmentAddress === true, "confirmable comme n'importe quel autre champ");
  });

  await test("4. Valeur manquante : statut missing, jamais bloquante", async () => {
    const analyzing = (await assistant.handle(createF009IntroState(), { type: "upload_document" })).state;
    const review = (
      await assistant.handle(analyzing, {
        type: "analysis_success",
        projection: projection({ email: undefined, emailProvenance: MISSING }),
      })
    ).state;

    assertUndefined(review.email, "email manquant");
    assertEqual(review.review?.emailProvenance.status, "missing", "statut missing porté par la revue");
    assertUndefined(review.conflicts?.email, "une absence n'est jamais un conflit");
  });

  await test("5. Correction manuelle d'un champ profil", async () => {
    const analyzing = (await assistant.handle(createF009IntroState(), { type: "upload_document" })).state;
    const review = (
      await assistant.handle(analyzing, { type: "analysis_success", projection: projection() })
    ).state;

    const corrected = await assistant.handle(review, {
      type: "correct_field",
      field: "email",
      value: "marie.corrigee@example.com",
    });
    assertEqual(corrected.state.email, "marie.corrigee@example.com", "valeur corrigée appliquée");
    assertTrue(corrected.state.confirmed?.email === true, "une correction vaut confirmation");
  });

  await test("6. Confirmation d'un champ profil", async () => {
    const analyzing = (await assistant.handle(createF009IntroState(), { type: "upload_document" })).state;
    const review = (
      await assistant.handle(analyzing, { type: "analysis_success", projection: projection() })
    ).state;

    const confirmed = await assistant.handle(review, { type: "confirm_field", field: "lastName" });
    assertTrue(confirmed.state.confirmed?.lastName === true, "confirmé");
    assertUndefined(confirmed.state.conflicts?.lastName, "aucun conflit à ce stade");
  });

  await test("7. Document → valeur déjà confirmée : conflit explicite, jamais d'écrasement", async () => {
    const analyzing = (await assistant.handle(createF009IntroState(), { type: "upload_document" })).state;
    const review = (
      await assistant.handle(analyzing, { type: "analysis_success", projection: projection() })
    ).state;
    const confirmed = (await assistant.handle(review, { type: "confirm_field", field: "email" })).state;

    const secondUpload = (await assistant.handle(confirmed, { type: "upload_document" })).state;
    const secondAnalysis = await assistant.handle(secondUpload, {
      type: "analysis_success",
      projection: projection({ email: "autre.email@example.com" }),
    });

    assertEqual(secondAnalysis.state.email, "marie.dupont@example.com", "valeur confirmée conservée");
    assertEqual(secondAnalysis.state.conflicts?.email?.confirmedValue, "marie.dupont@example.com", "conflit explicite");
    assertEqual(secondAnalysis.state.conflicts?.email?.newValue, "autre.email@example.com", "nouvelle valeur exposée, pas appliquée");
  });

  await test("8. Document → second document : aucun écrasement silencieux d'un champ profil non confirmé", async () => {
    const analyzing = (await assistant.handle(createF009IntroState(), { type: "upload_document" })).state;
    const review = (
      await assistant.handle(analyzing, { type: "analysis_success", projection: projection() })
    ).state;
    assertEqual(review.confirmed?.telephone, false, "sanity : pas confirmé");

    // Le second document ne mentionne pas le téléphone — l'absence ne doit jamais effacer une valeur déjà établie.
    const secondUpload = (await assistant.handle(review, { type: "upload_document" })).state;
    const secondAnalysis = await assistant.handle(secondUpload, {
      type: "analysis_success",
      projection: projection({ telephone: undefined, telephoneProvenance: MISSING }),
    });

    assertEqual(secondAnalysis.state.telephone, "0612345678", "valeur déjà établie conservée malgré l'absence dans le second document");
  });

  await test("9. Document → declarationDraft : les valeurs confirmées sont prêtes à être écrites", async () => {
    const analyzing = (await assistant.handle(createF009IntroState(), { type: "upload_document" })).state;
    const review = (
      await assistant.handle(analyzing, { type: "analysis_success", projection: projection() })
    ).state;
    const missing = (await assistant.handle(review, { type: "continue_review" })).state;
    const confirming = (
      await assistant.handle(missing, { type: "submit_mise_en_service", dateMiseEnService: "2024-04-01" })
    ).state;
    const complete = (await assistant.handle(confirming, { type: "confirm" })).state;

    // Reproduit exactement le mapping F009State → patch declarationDraft du panel
    // (persistCompletion) — sans dépendre du store React pour rester un test pur.
    const draftPatch = {
      exploitantLastName: complete.lastName,
      exploitantFirstName: complete.firstName,
      exploitantEmail: complete.email,
      exploitantTelephone: complete.telephone,
      personalAddress: complete.personalAddress,
      personalCity: complete.personalAddressCity,
      personalPostalCode: complete.personalAddressPostalCode,
    };
    assertEqual(draftPatch.exploitantLastName, "Dupont", "nom prêt pour declarationDraft");
    assertEqual(draftPatch.exploitantEmail, "marie.dupont@example.com", "email prêt pour declarationDraft");
    assertEqual(draftPatch.personalCity, "Saint-Médard-d'Eyrans", "ville prête pour declarationDraft");
  });

  await test("10. Reprise avec profil déjà connu : restauré, jamais redemandé", async () => {
    const analyzing = (await assistant.handle(createF009IntroState(), { type: "upload_document" })).state;
    const review = (
      await assistant.handle(analyzing, { type: "analysis_success", projection: projection() })
    ).state;
    const persisted = toF009PersistedState(review, now());

    const resumed = assistant.resume(persisted);
    assertEqual(resumed.state.lastName, "Dupont", "nom restauré");
    assertEqual(resumed.state.email, "marie.dupont@example.com", "email restauré");
    assertEqual(resumed.state.personalAddress, "4 allée Malbec, 33650 Saint-Médard-d'Eyrans", "adresse restaurée");
    const content = resumed.messages[0]?.content ?? "";
    assertTrue(content.includes("votre identité") || content.includes("vos coordonnées"), "message de reprise mentionne le profil déjà connu");
  });

  // ---------------------------------------------------------------------
  // Correctif — priorité de reprise après COMPLETE → GO_BACK → modification.
  // ---------------------------------------------------------------------

  await test(
    "COMPLETE → GO_BACK → modification → persist → resume : l'état de modification est restauré, pas COMPLETE",
    async () => {
      const analyzing = (await assistant.handle(createF009IntroState(), { type: "upload_document" })).state;
      const review = (
        await assistant.handle(analyzing, { type: "analysis_success", projection: projection() })
      ).state;
      const missing = (await assistant.handle(review, { type: "continue_review" })).state;
      const confirming = (
        await assistant.handle(missing, { type: "submit_mise_en_service", dateMiseEnService: "2024-04-01" })
      ).state;
      const complete = (await assistant.handle(confirming, { type: "confirm" })).state;
      assertEqual(complete.step, "complete", "sanity : dossier terminé une première fois");

      // L'utilisateur clique "Modifier mes réponses".
      const backToConfirmation = (await assistant.handle(complete, { type: "go_back" })).state;
      assertEqual(backToConfirmation.step, "confirmation", "sanity : réouvert sur la confirmation");

      // Puis revient encore en arrière pour corriger le nom, avant d'abandonner sans reconfirmer.
      const backToReview = (await assistant.handle(backToConfirmation, { type: "go_back" })).state; // → ask_missing_data
      const backToReview2 = (await assistant.handle(backToReview, { type: "go_back" })).state; // → review_extracted_data
      const modified = await assistant.handle(backToReview2, {
        type: "correct_field",
        field: "lastName",
        value: "Durand",
      });

      // Persistance au moment de l'abandon (ce que fait persistSession à chaque tour).
      const persisted = toF009PersistedState(modified.state, now());

      // C'est exactement la condition que le panel doit maintenant tester EN PREMIER,
      // avant le raccourci "déjà enregistré" — sinon declarationDraft.siret/dates
      // (toujours renseignés depuis la première complétion) écraseraient cette reprise.
      assertTrue(
        shouldResumeF009(persisted),
        "la session en cours de modification doit être reconnue comme reprenable, priorité sur le raccourci legacy",
      );

      const resumed = assistant.resume(persisted).state;
      assertEqual(resumed.step, "review_extracted_data", "état de modification restauré, pas COMPLETE");
      assertEqual(resumed.lastName, "Durand", "la correction en cours est bien celle qui est reprise");
      assertTrue(resumed.confirmed?.lastName === true, "la correction reste marquée confirmée après reprise");
    },
  );

  await test(
    "Symétrique : une session COMPLETE jamais rouverte reste couverte par le raccourci legacy (non régression)",
    async () => {
      const analyzing = (await assistant.handle(createF009IntroState(), { type: "upload_document" })).state;
      const review = (
        await assistant.handle(analyzing, { type: "analysis_success", projection: projection() })
      ).state;
      const missing = (await assistant.handle(review, { type: "continue_review" })).state;
      const confirming = (
        await assistant.handle(missing, { type: "submit_mise_en_service", dateMiseEnService: "2024-04-01" })
      ).state;
      const complete = (await assistant.handle(confirming, { type: "confirm" })).state;

      const persisted = toF009PersistedState(complete, now());
      assertEqual(
        shouldResumeF009(persisted),
        false,
        "une session terminée et jamais rouverte doit laisser la main au raccourci legacy, comme avant",
      );
    },
  );

  // ---------------------------------------------------------------------
  // Correctif MANUAL_PROFILE (Option B, deux écrans) — 9 tests requis.
  // ---------------------------------------------------------------------

  const FULL_MANUAL_PROFILE: Record<string, string> = {
    lastName: "Martin",
    firstName: "Julie",
    email: "julie.martin@example.com",
    telephone: "0698765432",
    personalAddress: "10 rue de la Paix",
    personalCity: "Bordeaux",
    personalPostalCode: "33000",
    establishmentAddress: "2 avenue du Siège",
    establishmentCity: "Bordeaux",
    establishmentPostalCode: "33000",
  };

  async function reachManualProfileStage(): Promise<F009State> {
    const noDoc = (await assistant.handle(createF009IntroState(), { type: "select_no_document" })).state;
    return (await assistant.handle(noDoc, { type: "submit_siret_known", known: false })).state;
  }

  /** Reproduit exactement la règle SIREN de `persistCompletion` (panel) — testée ici sans store React. */
  function derivedSiren(state: F009State): string | undefined {
    return state.siret ? state.siret.slice(0, 9) : state.siren;
  }

  await test("1. Profil manuel complet : les 6 champs + adresses sont peuplés et confirmés", async () => {
    const manualProfile = await reachManualProfileStage();
    const submitted = await assistant.handle(manualProfile, {
      type: "submit_manual_profile_fields",
      profile: FULL_MANUAL_PROFILE,
    });

    assertEqual(submitted.state.step, "manual_profile", "reste sur le même step top-level");
    assertEqual(submitted.state.manualProfile?.stage, "date", "bascule vers l'écran date");
    assertEqual(submitted.state.lastName, "Martin", "nom");
    assertEqual(submitted.state.firstName, "Julie", "prénom");
    assertEqual(submitted.state.email, "julie.martin@example.com", "email");
    assertEqual(submitted.state.telephone, "0698765432", "téléphone");
    assertEqual(submitted.state.personalAddress, "10 rue de la Paix, 33000 Bordeaux", "adresse personnelle combinée");
    assertEqual(submitted.state.personalAddressCity, "Bordeaux", "ville personnelle portée");
    assertEqual(submitted.state.personalAddressPostalCode, "33000", "CP personnel porté");
    assertEqual(submitted.state.establishmentAddress, "2 avenue du Siège, 33000 Bordeaux", "adresse établissement combinée");
    assertTrue(submitted.state.confirmed?.lastName === true, "nom confirmé");
    assertTrue(submitted.state.confirmed?.personalAddress === true, "adresse personnelle confirmée");
    assertTrue(submitted.state.confirmed?.establishmentAddress === true, "adresse établissement confirmée");
  });

  await test("2. Profil manuel partiel : seuls les champs fournis sont confirmés, la progression n'est pas bloquée", async () => {
    const manualProfile = await reachManualProfileStage();
    const submitted = await assistant.handle(manualProfile, {
      type: "submit_manual_profile_fields",
      profile: { lastName: "Martin", firstName: "Julie" },
    });

    assertEqual(submitted.state.lastName, "Martin", "nom renseigné");
    assertUndefined(submitted.state.email, "email absent, non bloquant");
    assertUndefined(submitted.state.confirmed?.email, "email non confirmé — jamais forcé");
    assertEqual(submitted.state.manualProfile?.stage, "date", "la progression continue malgré le profil partiel");
  });

  await test("3. SIREN sans SIRET : conservé comme donnée valide", async () => {
    const manualProfile = await reachManualProfileStage();
    assertUndefined(manualProfile.siret, "sanity : pas de SIRET (SIRET connu = non)");

    const submitted = (
      await assistant.handle(manualProfile, {
        type: "submit_manual_profile_fields",
        profile: { ...FULL_MANUAL_PROFILE, siren: "500123456" },
      })
    ).state;

    assertEqual(submitted.siren, "500123456", "SIREN manuel conservé");
    assertEqual(derivedSiren(submitted), "500123456", "règle persistCompletion : pas de SIRET → SIREN manuel retenu");
  });

  await test("4. SIRET connu → SIREN toujours dérivé du SIRET, jamais du SIREN manuel", async () => {
    const noDoc = (await assistant.handle(createF009IntroState(), { type: "select_no_document" })).state;
    const manualProfile = (
      await assistant.handle(noDoc, { type: "submit_siret_known", known: true, siret: "73282932000074" })
    ).state;
    assertTrue(manualProfile.siret !== undefined, "sanity : SIRET connu");

    const submitted = (
      await assistant.handle(manualProfile, {
        type: "submit_manual_profile_fields",
        profile: { ...FULL_MANUAL_PROFILE, siren: "999999999" }, // volontairement incohérent avec le SIRET
      })
    ).state;

    assertEqual(
      derivedSiren(submitted),
      submitted.siret!.slice(0, 9),
      "le SIRET connu l'emporte toujours sur un SIREN manuel, même incohérent",
    );
  });

  await test("5. Modification du profil : une resoumission met à jour la valeur, reste confirmée", async () => {
    const manualProfile = await reachManualProfileStage();
    const first = (
      await assistant.handle(manualProfile, { type: "submit_manual_profile_fields", profile: FULL_MANUAL_PROFILE })
    ).state;

    const backToProfile = (await assistant.handle(first, { type: "go_back" })).state;
    assertEqual(backToProfile.manualProfile?.stage, "profile", "retour sur l'écran profil");
    assertEqual(backToProfile.lastName, "Martin", "les données saisies restent en mémoire pendant le retour");

    const corrected = (
      await assistant.handle(backToProfile, {
        type: "submit_manual_profile_fields",
        profile: { ...FULL_MANUAL_PROFILE, lastName: "Martin-Dupuis" },
      })
    ).state;

    assertEqual(corrected.lastName, "Martin-Dupuis", "valeur modifiée appliquée");
    assertTrue(corrected.confirmed?.lastName === true, "reste confirmé après modification");
  });

  await test("6. Abandon après profil → reprise sur l'écran DATE (pas re-demandé)", async () => {
    const manualProfile = await reachManualProfileStage();
    const submitted = (
      await assistant.handle(manualProfile, { type: "submit_manual_profile_fields", profile: FULL_MANUAL_PROFILE })
    ).state;
    const persisted = toF009PersistedState(submitted, now());

    const resumed = assistant.resume(persisted).state;
    assertEqual(resumed.step, "manual_profile", "step");
    assertEqual(resumed.manualProfile?.stage, "date", "reprend directement sur l'écran date, le profil n'est pas redemandé");
    assertEqual(resumed.lastName, "Martin", "profil restauré");
  });

  await test("7. Abandon après date → reprise au bon écran (ASK_MISSING_DATA)", async () => {
    const manualProfile = await reachManualProfileStage();
    const afterProfile = (
      await assistant.handle(manualProfile, { type: "submit_manual_profile_fields", profile: FULL_MANUAL_PROFILE })
    ).state;
    const afterDate = (
      await assistant.handle(afterProfile, {
        type: "submit_manual_activity_date",
        dateDebutActivite: "2024-02-10",
      })
    ).state;
    const persisted = toF009PersistedState(afterDate, now());

    const resumed = assistant.resume(persisted).state;
    assertEqual(resumed.step, "ask_missing_data", "step");
    assertEqual(resumed.lastName, "Martin", "profil toujours restauré");
    assertEqual(resumed.dateDebutActivite, "2024-02-10", "date restaurée");
  });

  await test("8. Profil manuel confirmé n'est jamais écrasé silencieusement par un document ultérieur", async () => {
    const manualProfile = await reachManualProfileStage();
    const afterProfile = (
      await assistant.handle(manualProfile, { type: "submit_manual_profile_fields", profile: FULL_MANUAL_PROFILE })
    ).state;

    const analyzing = (await assistant.handle(afterProfile, { type: "upload_document" })).state;
    const afterDoc = await assistant.handle(analyzing, {
      type: "analysis_success",
      projection: projection({ lastName: "Autre Nom" }),
    });

    assertEqual(afterDoc.state.lastName, "Martin", "valeur manuelle confirmée conservée");
    assertEqual(afterDoc.state.conflicts?.lastName?.confirmedValue, "Martin", "conflit expose la valeur confirmée");
    assertEqual(afterDoc.state.conflicts?.lastName?.newValue, "Autre Nom", "conflit expose la valeur du document");
  });

  await test("9. Document ultérieur complète les champs manquants du profil manuel", async () => {
    const manualProfile = await reachManualProfileStage();
    const afterProfile = (
      await assistant.handle(manualProfile, {
        type: "submit_manual_profile_fields",
        profile: { lastName: "Martin", firstName: "Julie" }, // profil volontairement partiel
      })
    ).state;
    assertUndefined(afterProfile.email, "sanity : email jamais saisi manuellement");

    const analyzing = (await assistant.handle(afterProfile, { type: "upload_document" })).state;
    const afterDoc = await assistant.handle(analyzing, {
      type: "analysis_success",
      projection: projection(), // fournit email/téléphone/adresses
    });

    assertEqual(afterDoc.state.lastName, "Martin", "champ déjà confirmé manuellement conservé");
    assertEqual(afterDoc.state.email, "marie.dupont@example.com", "champ manquant complété par le document");
    assertEqual(afterDoc.state.telephone, "0612345678", "téléphone complété par le document");
  });

  await test("GO_BACK profil ↔ date : navigation locale, aucune donnée perdue", async () => {
    const manualProfile = await reachManualProfileStage();
    const afterProfile = (
      await assistant.handle(manualProfile, { type: "submit_manual_profile_fields", profile: FULL_MANUAL_PROFILE })
    ).state;
    const back = (await assistant.handle(afterProfile, { type: "go_back" })).state;
    assertEqual(back.step, "manual_profile", "step top-level inchangé");
    assertEqual(back.manualProfile?.stage, "profile", "sous-écran revenu à profil");
    assertEqual(back.lastName, "Martin", "aucune donnée perdue pendant l'aller-retour");
    assertEqual(
      back.history?.length,
      afterProfile.history?.length,
      "la sous-navigation profil↔date ne dépile pas l'historique top-level",
    );
  });

  // ---------------------------------------------------------------------
  // Correctif régression post-upload INPI — hasUsableData doit reconnaître
  // les 8 champs F009 (pas seulement SIRET/date). Reproduit exactement la
  // logique de F009ActiviteAssistantPanel.analyzeDocument, sans React/store.
  // ---------------------------------------------------------------------

  function hasUsableData(p: F009DocumentProjection): boolean {
    return (
      p.siret !== undefined ||
      p.activityStartDate !== undefined ||
      p.lastName !== undefined ||
      p.firstName !== undefined ||
      p.email !== undefined ||
      p.telephone !== undefined ||
      p.personalAddress !== undefined ||
      p.establishmentAddress !== undefined ||
      p.siretAmbiguous ||
      p.datesAmbiguous
    );
  }

  const ALL_FIELDS_EMPTY: Partial<F009DocumentProjection> = {
    siret: undefined,
    siretProvenance: MISSING,
    siretAmbiguous: false,
    siretCandidates: [],
    activityStartDate: undefined,
    activityStartDateProvenance: MISSING,
    activityStartDateRaw: undefined,
    immatriculationDateRaw: undefined,
    datesAmbiguous: false,
    lastName: undefined,
    lastNameProvenance: MISSING,
    firstName: undefined,
    firstNameProvenance: MISSING,
    email: undefined,
    emailProvenance: MISSING,
    telephone: undefined,
    telephoneProvenance: MISSING,
    personalAddress: undefined,
    personalAddressProvenance: MISSING,
    personalAddressCity: undefined,
    personalAddressPostalCode: undefined,
    establishmentAddress: undefined,
    establishmentAddressProvenance: MISSING,
    establishmentAddressCity: undefined,
    establishmentAddressPostalCode: undefined,
  };

  await test(
    "Régression : profil seul (SIRET et date absents) → hasUsableData=true, aboutit à REVIEW, jamais ANALYSIS_FAILED",
    async () => {
      const regression = projection({
        ...ALL_FIELDS_EMPTY,
        lastName: "Dupont",
        firstName: "Marie",
        lastNameProvenance: EXTRACTED,
        firstNameProvenance: EXTRACTED,
        email: "marie.dupont@example.com",
        emailProvenance: EXTRACTED,
        personalAddress: "4 allée Malbec, 33650 Saint-Médard-d'Eyrans",
        personalAddressProvenance: EXTRACTED,
      });
      assertTrue(hasUsableData(regression), "le profil seul doit être considéré exploitable");

      const analyzing = (await assistant.handle(createF009IntroState(), { type: "upload_document" })).state;
      const turn = await assistant.handle(analyzing, { type: "analysis_success", projection: regression });
      assertEqual(turn.state.step, "review_extracted_data", "aboutit à la revue, jamais à un échec");
      assertEqual(turn.state.lastName, "Dupont", "le profil extrait reste exploitable dans la revue");
    },
  );

  await test("1. Aucun des 8 champs disponible → échec (hasUsableData=false)", () => {
    assertEqual(hasUsableData(projection(ALL_FIELDS_EMPTY)), false, "rien d'exploitable");
  });

  await test("2. Uniquement SIRET disponible → succès", () => {
    const p = projection({ ...ALL_FIELDS_EMPTY, siret: "12345678901234", siretProvenance: EXTRACTED });
    assertTrue(hasUsableData(p), "SIRET seul suffit");
  });

  await test("3. Uniquement la date de début d'activité disponible → succès", () => {
    const p = projection({
      ...ALL_FIELDS_EMPTY,
      activityStartDate: "2024-03-05",
      activityStartDateProvenance: EXTRACTED,
      activityStartDateRaw: "2024-03-05",
    });
    assertTrue(hasUsableData(p), "date seule suffit");
  });

  await test("4. Uniquement un champ profil (nom) disponible → succès", () => {
    const p = projection({ ...ALL_FIELDS_EMPTY, lastName: "Dupont", lastNameProvenance: EXTRACTED });
    assertTrue(hasUsableData(p), "un seul champ profil suffit — c'est exactement la régression corrigée");
  });

  await test("5. Uniquement une adresse disponible → succès", () => {
    const p = projection({
      ...ALL_FIELDS_EMPTY,
      establishmentAddress: "2 avenue du Siège, 75002 Paris",
      establishmentAddressProvenance: PROPOSED,
    });
    assertTrue(hasUsableData(p), "adresse seule suffit");
  });

  await test("6. Projection partielle (SIRET + email, reste vide) → succès", () => {
    const p = projection({
      ...ALL_FIELDS_EMPTY,
      siret: "12345678901234",
      siretProvenance: EXTRACTED,
      email: "marie.dupont@example.com",
      emailProvenance: EXTRACTED,
    });
    assertTrue(hasUsableData(p), "partiel reste exploitable — extraction partielle ne doit jamais bloquer");
  });

  await test("7. Ambiguïté seule (aucune valeur résolue) → comportement préexistant conservé", () => {
    const ambiguousSiret = projection({ ...ALL_FIELDS_EMPTY, siretAmbiguous: true });
    assertTrue(hasUsableData(ambiguousSiret), "ambiguïté SIRET seule → toujours exploitable, comme avant le correctif");

    const ambiguousDates = projection({ ...ALL_FIELDS_EMPTY, datesAmbiguous: true });
    assertTrue(hasUsableData(ambiguousDates), "ambiguïté de dates seule → toujours exploitable, comme avant le correctif");
  });

  // ---------------------------------------------------------------------
  // Correctif blocage dateDebutActivite — ASK_MISSING_DATA doit demander
  // explicitement dateDebutActivite quand elle manque, avant dateMiseEnService,
  // au lieu de bloquer indéfiniment sur "Il nous manque la date de début
  // d'activité pour continuer." sans jamais offrir de champ pour la renseigner.
  // ---------------------------------------------------------------------

  const NO_ACTIVITY_START_DATE: Partial<F009DocumentProjection> = {
    activityStartDate: undefined,
    activityStartDateProvenance: MISSING,
    activityStartDateRaw: undefined,
    immatriculationDateRaw: undefined,
    datesAmbiguous: false,
  };

  await test(
    "A. INPI sans date début → REVIEW → ASK_MISSING_DATA → champ dédié → saisie → progression",
    async () => {
      const noDate = projection(NO_ACTIVITY_START_DATE);
      const analyzing = (await assistant.handle(createF009IntroState(), { type: "upload_document" })).state;
      const review = (await assistant.handle(analyzing, { type: "analysis_success", projection: noDate })).state;
      assertUndefined(review.dateDebutActivite, "date de début absente après analyse");

      const askMissing = await assistant.handle(review, { type: "continue_review" });
      assertEqual(askMissing.state.step, "ask_missing_data", "step");
      assertUndefined(askMissing.state.dateDebutActivite, "toujours absente — le champ dédié doit s'afficher");
      assertTrue(
        askMissing.messages.some((m) => m.content.includes("officielle de début")),
        "la question porte sur la date de début, pas sur la mise en service",
      );

      const dateProvided = await assistant.handle(askMissing.state, {
        type: "correct_field",
        field: "dateDebutActivite",
        value: "2024-03-05",
      });
      assertEqual(dateProvided.state.dateDebutActivite, "2024-03-05", "date enregistrée");
      assertEqual(dateProvided.state.step, "ask_missing_data", "reste sur ASK_MISSING_DATA pour la mise en service");
      assertTrue(
        dateProvided.messages.some((m) => m.content.includes("loué ce bien")),
        "enchaîne aussitôt sur la question de mise en service",
      );

      const confirming = await assistant.handle(dateProvided.state, {
        type: "submit_mise_en_service",
        dateMiseEnService: "2024-04-01",
      });
      assertEqual(confirming.state.step, "confirmation", "progression jusqu'à la confirmation");
      assertEqual(confirming.state.dateMiseEnService, "2024-04-01", "mise en service enregistrée");
    },
  );

  await test(
    "B. INPI avec date début → ASK_MISSING_DATA ne la redemande jamais, va direct à la mise en service",
    async () => {
      const analyzing = (await assistant.handle(createF009IntroState(), { type: "upload_document" })).state;
      const review = (await assistant.handle(analyzing, { type: "analysis_success", projection: projection() }))
        .state;
      assertEqual(review.dateDebutActivite, "2024-03-05", "date déjà connue après analyse");

      const turn = await assistant.handle(review, { type: "continue_review" });
      assertEqual(turn.state.step, "ask_missing_data", "step");
      assertEqual(turn.state.dateDebutActivite, "2024-03-05", "jamais effacée");
      assertTrue(
        turn.messages.some((m) => m.content.includes("loué ce bien")),
        "va directement à la question de mise en service",
      );
      assertTrue(
        !turn.messages.some((m) => m.content.includes("officielle de début")),
        "ne redemande jamais une date déjà connue",
      );
    },
  );

  await test(
    "C. INPI avec date ambiguë → ASK_MISSING_DATA demande la date, résolution possible, puis progression",
    async () => {
      const ambiguous = projection({
        ...NO_ACTIVITY_START_DATE,
        activityStartDateRaw: "2024-03-05",
        immatriculationDateRaw: "2024-03-01",
        datesAmbiguous: true,
      });
      const analyzing = (await assistant.handle(createF009IntroState(), { type: "upload_document" })).state;
      const review = (await assistant.handle(analyzing, { type: "analysis_success", projection: ambiguous })).state;
      assertUndefined(review.dateDebutActivite, "non résolue automatiquement tant qu'ambiguë");
      assertEqual(review.review?.datesAmbiguous, true, "l'ambiguïté est portée dans review pour la résolution");

      const askMissing = await assistant.handle(review, { type: "continue_review" });
      assertEqual(askMissing.state.step, "ask_missing_data", "step");
      assertUndefined(askMissing.state.dateDebutActivite, "toujours non résolue");
      assertTrue(
        askMissing.messages.some((m) => m.content.includes("officielle de début")),
        "demande explicitement la date",
      );

      // Résolution via l'un des deux candidats (ce que fait onCorrect(candidate.value) côté UI).
      const resolved = await assistant.handle(askMissing.state, {
        type: "correct_field",
        field: "dateDebutActivite",
        value: "2024-03-05",
      });
      assertEqual(resolved.state.dateDebutActivite, "2024-03-05", "date retenue");
      assertTrue(resolved.messages.some((m) => m.content.includes("loué ce bien")), "enchaîne sur la mise en service");
    },
  );

  await test(
    "D. Date de début saisie manuellement dans ASK_MISSING_DATA → mise en service → calcul → confirmation",
    async () => {
      const noDate = projection(NO_ACTIVITY_START_DATE);
      const analyzing = (await assistant.handle(createF009IntroState(), { type: "upload_document" })).state;
      const review = (await assistant.handle(analyzing, { type: "analysis_success", projection: noDate })).state;
      const askMissing = (await assistant.handle(review, { type: "continue_review" })).state;
      const dateProvided = (
        await assistant.handle(askMissing, { type: "correct_field", field: "dateDebutActivite", value: "2024-03-05" })
      ).state;

      const turn = await assistant.handle(dateProvided, {
        type: "submit_mise_en_service",
        dateMiseEnService: "2024-04-01",
      });
      assertEqual(turn.state.step, "confirmation", "atteint la confirmation");
      assertEqual(turn.state.dateMiseEnService, "2024-04-01", "mise en service enregistrée");
      assertTrue(
        typeof turn.state.explanation === "string" && turn.state.explanation.length > 0,
        "le calcul (explication) est produit",
      );
      assertTrue(typeof turn.state.prorataPercent === "number", "le prorata est calculé");
    },
  );

  await test(
    "E. Date de début modifiée après confirmation (parcours ASK_MISSING_DATA) → dépendances invalidées",
    async () => {
      const noDate = projection(NO_ACTIVITY_START_DATE);
      const analyzing = (await assistant.handle(createF009IntroState(), { type: "upload_document" })).state;
      const review = (await assistant.handle(analyzing, { type: "analysis_success", projection: noDate })).state;
      const askMissing = (await assistant.handle(review, { type: "continue_review" })).state;
      const dateProvided = (
        await assistant.handle(askMissing, { type: "correct_field", field: "dateDebutActivite", value: "2024-03-05" })
      ).state;
      const confirming = (
        await assistant.handle(dateProvided, { type: "submit_mise_en_service", dateMiseEnService: "2024-04-01" })
      ).state;
      assertEqual(confirming.step, "confirmation", "sanity : bien en confirmation");
      assertTrue(Boolean(confirming.explanation), "sanity : explication déjà calculée");

      const modified = await assistant.handle(confirming, {
        type: "correct_field",
        field: "dateDebutActivite",
        value: "2024-05-01",
      });
      assertEqual(modified.state.dateDebutActivite, "2024-05-01", "nouvelle date appliquée");
      assertUndefined(modified.state.dateMiseEnService, "mise en service invalidée");
      assertUndefined(modified.state.explanation, "explication invalidée");
      assertUndefined(modified.state.prorataPercent, "prorata invalidé");
      assertUndefined(modified.state.confirmed?.dateMiseEnService, "confirmation de mise en service levée");
    },
  );

  await test(
    "F. Refresh après saisie de la date de début (avant mise en service) → reprise sur la question suivante",
    async () => {
      const noDate = projection(NO_ACTIVITY_START_DATE);
      const analyzing = (await assistant.handle(createF009IntroState(), { type: "upload_document" })).state;
      const review = (await assistant.handle(analyzing, { type: "analysis_success", projection: noDate })).state;
      const askMissing = (await assistant.handle(review, { type: "continue_review" })).state;
      const dateProvided = (
        await assistant.handle(askMissing, { type: "correct_field", field: "dateDebutActivite", value: "2024-03-05" })
      ).state;

      const persisted = toF009PersistedState(dateProvided, "2026-08-27T10:00:00.000Z");
      const resumed = assistant.resume(persisted);

      assertEqual(resumed.state.step, "ask_missing_data", "reprend sur ASK_MISSING_DATA");
      assertEqual(
        resumed.state.dateDebutActivite,
        "2024-03-05",
        "date de début conservée — le champ dédié ne doit pas réapparaître",
      );
      assertUndefined(resumed.state.dateMiseEnService, "mise en service toujours attendue");
    },
  );

  await test(
    "G. Clic répété sur « Voir l'impact » une fois la date de début connue → jamais de boucle de blocage",
    async () => {
      const noDate = projection(NO_ACTIVITY_START_DATE);
      const analyzing = (await assistant.handle(createF009IntroState(), { type: "upload_document" })).state;
      const review = (await assistant.handle(analyzing, { type: "analysis_success", projection: noDate })).state;
      const askMissing = (await assistant.handle(review, { type: "continue_review" })).state;
      const dateProvided = (
        await assistant.handle(askMissing, { type: "correct_field", field: "dateDebutActivite", value: "2024-03-05" })
      ).state;

      const firstClick = await assistant.handle(dateProvided, {
        type: "submit_mise_en_service",
        dateMiseEnService: "2024-04-01",
      });
      const secondClick = await assistant.handle(dateProvided, {
        type: "submit_mise_en_service",
        dateMiseEnService: "2024-04-01",
      });

      for (const turn of [firstClick, secondClick]) {
        assertTrue(
          !turn.messages.some((m) => m.content.includes("Il nous manque la date de début d'activité pour continuer")),
          "le message de blocage historique ne doit plus jamais apparaître une fois la date connue",
        );
        assertEqual(turn.state.step, "confirmation", "chaque clic aboutit normalement à la confirmation");
      }
    },
  );

  console.log(`\n${passed}/${total} tests passés`);
  if (passed !== total) process.exit(1);
}

void runTests();
