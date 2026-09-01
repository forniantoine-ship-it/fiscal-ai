/**
 * Component-by-component visual tree comparison: Activité vs Logement.
 * Used for isolation debugging — not imported at runtime.
 */
export const ACTIVITE_VS_LOGEMENT_VISUAL_TREE = {
  shared: [
    "WorkflowPageBackLink",
    "ActiviteAiProcessing (spinner / step list)",
    "ConfiguredDossierCard (fiscal-fade-in on section)",
    "WorkflowProgressionActions",
    "Failed-state card (fiscal-fade-in)",
    "visibleSections progressive DOM mount",
    "LightField fiscal-fade-in + delayMs stagger",
    "Extraction card wrapper section (fiscal-fade-in)",
  ],
  activiteOnly: [
    "ActiviteHero + YearBadge + SavePill (autosave pulse)",
    "ActiviteNoInpiGuide",
    "ActiviteProfileFields: RegimeBadge, 4 sections",
    "EXTRACTED_CARD_STYLE card wrapper",
    "showReanalyzeAction link",
    "showUnrecognizedMessage banner",
    "manualMode / showNoInpiGuide branches",
  ],
  logementOnly: [
    "LogementHero + Bien immobilier badge + HERO_HELPER copy",
    "LogementHero UploadedSummary (fiscal-fade-in)",
    "LogementProfileFields: LightSelect, copropriété toggle",
    "LogementProfileFields: address autocomplete hint icon",
    "DOCUMENT_WORKFLOW_CARD_STYLE card wrapper",
    "multiPropertyDetected devis card (fiscal-fade-in)",
    "2-section reveal (vs 4 in Activité)",
    "uploadedCount Math.max(count, 1)",
    "ActiviteAiProcessing finalStepLabel=Préparation du logement",
  ],
} as const;
