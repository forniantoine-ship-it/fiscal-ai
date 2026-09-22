/**
 * Adaptateur pur : clôture interne + contexte archivé → FiscalYearOpening.
 *
 * Aucun accès réseau, aucune persistance, aucun appel F006/F010/F011/F012/F014
 * pour reconstruire l'historique. Réutilise resolveOuvertureCompteExploitantNPlusUn
 * / reporterRanNPlusUn / latestClosure / extractFinancementBases.
 */

import {
  extractFinancementBases,
  latestClosure,
} from "@/lib/lmnp/services/dossier/fiscal-year-cycle";
import {
  reporterRanNPlusUn,
  resolveOuvertureCompteExploitantNPlusUn,
} from "@/runtime/capabilities/bilan/resolve-ouverture-n-plus-1";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import type { FiscalYear } from "@/lib/lmnp/types/domain";
import type { FiscalYearClosure, ImmobilisationComptableActif } from "@/lib/lmnp/types/dossier";
import { available, unavailable } from "./opening-fact";
import type { OpeningFact } from "./opening-fact";
import type {
  AdaptInternalOpeningResult,
  FiscalYearOpening,
  OpeningAsset,
  OpeningAssetPlan,
  OpeningDurableIdentity,
  OpeningFieldProvenance,
  OpeningIssue,
  OpeningLoan,
  OpeningPropertyPrefill,
} from "./types";
import type { RanSituation } from "@/runtime/capabilities/bilan/types";

export type AdaptInternalOpeningInput = {
  /** Exercice cible (N+1). */
  targetFiscalYear: number;
  openingId: string;
  revision: number;
  /** Exercice clôturé N. */
  closedFiscalYear: FiscalYear;
  /** Workspace archivé de N (paramètres durables, prêts, biens). */
  archivedWorkspace: PersistedWorkspace;
  /**
   * Contrôles attestés optionnels (ex. CRD d'ouverture) — transport pur,
   * jamais calculés par F011. Absents ⇒ UNAVAILABLE sur le prêt concerné.
   */
  attestedLoanControls?: Array<{ pretId: string; crdOuverture?: number }>;
};

function issue(
  code: string,
  message: string,
  fieldPath?: string,
  severity: OpeningIssue["severity"] = "error",
): OpeningIssue {
  return { code, message, severity, fieldPath };
}

function isIndexBasedAssetId(id: string): boolean {
  return /^f010-\d+$/.test(id);
}

function planForActif(
  actif: ImmobilisationComptableActif,
  archived: PersistedWorkspace,
): {
  plan: OpeningAssetPlan | undefined;
  ambiguous: boolean;
  unavailableReason?: string;
} {
  if (actif.categorie === "terrain") {
    return { plan: { kind: "non_amortizable" }, ambiguous: false };
  }

  // Lot 2B — snapshot complet : date + durée + convention attestées.
  if (actif.dureeAnnees && actif.dateDebut && actif.prorataConvention) {
    return {
      plan: {
        kind: "amortizable",
        startDate: actif.dateDebut,
        durationYears: actif.dureeAnnees,
        prorataConvention: actif.prorataConvention,
      },
      ambiguous: false,
    };
  }

  // Date/durée connues mais convention absente → INCONNU ≠ défaut
  // (ni annuel_plein ni jours_reels inventés).
  if (actif.dureeAnnees && actif.dateDebut && !actif.prorataConvention) {
    return {
      plan: undefined,
      ambiguous: false,
      unavailableReason:
        "convention de prorata absente du snapshot — INCONNU ≠ annuel_plein/jours_reels",
    };
  }

  const base = archived.properties.find((p) => p.id === actif.propertyId)?.amortissementBase
    ?? archived.properties[0]?.amortissementBase;
  const draftPlan = archived.declarationDraft?.logementAmortissement?.plan;

  // Compléter depuis le contexte archivé par ID stable — jamais recalculer le passé.
  const fromBase = base?.composants.find((c) => c.id === actif.id);
  const startDate =
    fromBase?.dateDebut ?? actif.dateDebut ?? base?.dateMiseEnService ?? undefined;
  if (fromBase?.dureeAnnees && startDate) {
    if (actif.prorataConvention) {
      return {
        plan: {
          kind: "amortizable",
          startDate,
          durationYears: fromBase.dureeAnnees,
          prorataConvention: actif.prorataConvention,
        },
        ambiguous: false,
      };
    }
    return {
      plan: undefined,
      ambiguous: false,
      unavailableReason:
        "convention de prorata absente — paramètres partiels non transformés en défaut",
    };
  }

  // Lignes F-010 : IDs index-based `f010-${index}` — compléter par index est ambigu.
  if (isIndexBasedAssetId(actif.id)) {
    const index = Number(actif.id.slice("f010-".length));
    const ligne = draftPlan?.lignes[index];
    if (ligne && draftPlan && actif.prorataConvention) {
      return {
        plan: {
          kind: "amortizable",
          startDate: archived.declarationDraft?.dateMiseEnService ?? "",
          durationYears: ligne.dureeAnnees,
          prorataConvention: actif.prorataConvention,
        },
        ambiguous: true,
      };
    }
    return {
      plan: undefined,
      ambiguous: true,
      unavailableReason: actif.prorataConvention
        ? undefined
        : "convention de prorata absente — ID index-based ambigu",
    };
  }

  return { plan: undefined, ambiguous: false };
}

function mapAssets(
  closure: FiscalYearClosure,
  archived: PersistedWorkspace,
  issues: OpeningIssue[],
): OpeningAsset[] | undefined {
  const snap = closure.immobilisationsComptables;
  if (!snap) return undefined;

  const assets: OpeningAsset[] = [];
  for (const actif of snap.actifs) {
    const { plan, ambiguous, unavailableReason } = planForActif(actif, archived);
    if (ambiguous) {
      issues.push(
        issue(
          "ASSET_IDENTITY_AMBIGUOUS",
          `Identité d'actif ambiguë (ID index-based « ${actif.id} ») — stabilisation Lot 2.`,
          `assets.${actif.id}`,
          "warning",
        ),
      );
    }

    const coutBrut =
      typeof actif.coutBrut === "number" ? available(actif.coutBrut) : unavailable("coût brut inconnu");
    const cumulOuverture =
      typeof actif.amortissementCumule === "number"
        ? available(actif.amortissementCumule)
        : unavailable("cumul d'ouverture inconnu — ne pas recalculer le passé");

    assets.push({
      id: actif.id,
      propertyId: actif.propertyId,
      label: actif.label,
      categorie: actif.categorie,
      origin: actif.origin ?? actif.provenance,
      coutBrut,
      cumulOuverture,
      plan: plan
        ? available(plan)
        : unavailable(
            unavailableReason ?? "paramètres de plan absents du contexte archivé",
          ),
      dateAcquisition: actif.dateDebut,
      vncAttestee: typeof actif.vnc === "number" ? actif.vnc : undefined,
    });
  }
  return assets;
}

function mapLoans(
  archived: PersistedWorkspace,
  attestedLoanControls: AdaptInternalOpeningInput["attestedLoanControls"],
): OpeningLoan[] | undefined {
  const draftLoans = archived.declarationDraft?.financementAssistantState?.loans;
  if (draftLoans === undefined) {
    return undefined;
  }
  const controlsByPretId = new Map(
    (attestedLoanControls ?? []).map((c) => [c.pretId, c] as const),
  );
  const bases = extractFinancementBases(draftLoans);
  const defaultPropertyId =
    archived.properties[0]?.id ?? archived.fiscalYear.propertyIds[0];
  return bases.map((base) => {
    const control = controlsByPretId.get(base.pretId);
    return {
      pretId: base.pretId,
      propertyId: base.propertyId ?? defaultPropertyId,
      terms: available({
        typePret: base.typePret,
        capitalInitial: base.capitalInitial,
        tauxNominal: base.tauxNominal,
        dureeMois: base.dureeMois,
        datePremiereMensualite: base.datePremiereMensualite,
        assuranceAnnuelle: base.assuranceAnnuelle,
        assuranceType: base.assuranceType,
        typeGarantie: base.typeGarantie,
        fraisDossier: base.fraisDossier,
        garantieDeductible: base.garantieDeductible,
        iraDeductible: base.iraDeductible,
        anneeSouscription: base.anneeSouscription,
      }),
      schedule: unavailable("échéancier non transporté depuis la clôture interne (Lot 1)"),
      assuranceAnnuelle:
        base.assuranceAnnuelle !== undefined
          ? available(base.assuranceAnnuelle)
          : unavailable("assurance annuelle non renseignée"),
      crdOuverture:
        control?.crdOuverture !== undefined
          ? available(control.crdOuverture)
          : unavailable("CRD d'ouverture non attesté sur la clôture"),
    };
  });
}

function mapIdentity(archived: PersistedWorkspace): OpeningDurableIdentity | undefined {
  const draft = archived.declarationDraft;
  if (!draft) return undefined;
  const identity: OpeningDurableIdentity = {};
  if (draft.siren) identity.siren = draft.siren;
  if (draft.siret) identity.siret = draft.siret;
  if (draft.exploitantFirstName) identity.exploitantFirstName = draft.exploitantFirstName;
  if (draft.exploitantLastName) identity.exploitantLastName = draft.exploitantLastName;
  if (draft.establishmentAddress) identity.establishmentAddress = draft.establishmentAddress;
  if (draft.establishmentCity) identity.establishmentCity = draft.establishmentCity;
  if (draft.establishmentPostalCode) identity.establishmentPostalCode = draft.establishmentPostalCode;
  if (draft.activityStartDate) identity.activityStartDate = draft.activityStartDate;
  if (draft.dateMiseEnService) identity.dateMiseEnService = draft.dateMiseEnService;
  return Object.keys(identity).length > 0 ? identity : undefined;
}

function mapProperties(archived: PersistedWorkspace): OpeningPropertyPrefill[] {
  return archived.properties.map((p) => ({
    propertyId: p.id,
    label: p.label,
    address: p.address,
    city: p.city,
    postalCode: p.postalCode,
    propertyType: p.propertyType,
    acquisitionDate: p.acquisitionDate,
    dateMiseEnService: p.amortissementBase?.dateMiseEnService ?? archived.declarationDraft?.dateMiseEnService,
  }));
}

/**
 * Construit un `FiscalYearOpening` depuis une clôture interne + workspace archivé.
 */
export function adaptInternalOpening(input: AdaptInternalOpeningInput): AdaptInternalOpeningResult {
  const issues: OpeningIssue[] = [];
  const { closedFiscalYear, archivedWorkspace, targetFiscalYear, openingId, revision } = input;

  // 1. Dossier
  const dossierId = closedFiscalYear.dossierId;
  if (!dossierId) {
    issues.push(issue("MISSING_DOSSIER_ID", "L'exercice clôturé n'a pas de dossierId."));
    return { opening: undefined, issues };
  }
  if (
    archivedWorkspace.fiscalYear.dossierId !== undefined &&
    archivedWorkspace.fiscalYear.dossierId !== dossierId
  ) {
    issues.push(issue("DOSSIER_MISMATCH", "Le workspace archivé n'appartient pas au même dossier."));
    return { opening: undefined, issues };
  }
  if (archivedWorkspace.fiscalYear.id !== closedFiscalYear.id) {
    issues.push(
      issue(
        "ARCHIVED_WORKSPACE_MISMATCH",
        "Le workspace archivé ne correspond pas à l'exercice clôturé fourni.",
      ),
    );
    return { opening: undefined, issues };
  }

  // 2. Année adjacente
  if (closedFiscalYear.year !== targetFiscalYear - 1) {
    issues.push(
      issue(
        "YEAR_NOT_ADJACENT",
        `Adjacence non respectée : closed.year=${closedFiscalYear.year}, target=${targetFiscalYear} (attendu ${targetFiscalYear - 1}).`,
        "targetFiscalYear",
      ),
    );
    return { opening: undefined, issues };
  }

  // 3. Clôture
  if (closedFiscalYear.status !== "closed") {
    issues.push(issue("FISCAL_YEAR_NOT_CLOSED", "L'exercice source n'est pas clôturé."));
    return { opening: undefined, issues };
  }

  // 5. Une seule clôture (latest)
  const closure = latestClosure(closedFiscalYear);
  if (!closure) {
    issues.push(issue("NO_CLOSURE", "Aucune clôture exploitable sur l'exercice source."));
    return { opening: undefined, issues };
  }
  if (closure.fiscalYearId !== closedFiscalYear.id) {
    issues.push(issue("CLOSURE_INCOHERENT", "La clôture ne référence pas l'exercice source."));
    return { opening: undefined, issues };
  }

  // 6–8. Stocks : copie directe sans addition ni fallback UNKNOWN→ZERO
  // (STOCK FINAL uniquement — G10 intact). Champs obligatoires sur la clôture.
  const stocks = {
    deficits: available(
      closure.stocks.deficits.map((d) => ({
        millesime: d.millesime,
        montant: d.montant,
      })),
    ),
    amortissementsReportes: available(closure.stocks.amortissementsReportes),
  };

  // 7. Patrimoine via résolveurs existants — ne pas recopier clotureN comme ouverture,
  // ne pas double-compter le résultat.
  let ouvertureCompteExploitant: OpeningFact<number> = unavailable(
    "données patrimoniales absentes de la clôture",
  );
  let ran: OpeningFact<{ situation: RanSituation; valeur?: number }> = unavailable(
    "RAN absent de la clôture",
  );
  if (closure.patrimoine) {
    ouvertureCompteExploitant = available(
      resolveOuvertureCompteExploitantNPlusUn({
        cloture120N: closure.patrimoine.compteExploitantAvantAffectationResultat,
        resultatComptableN: closure.patrimoine.resultatComptableExercice,
      }),
    );
    const ranReporte = reporterRanNPlusUn({
      situationN: closure.patrimoine.ranSituation,
      valeurN: closure.patrimoine.ranValeur,
    });
    ran = available({
      situation: ranReporte.situationNPlusUn,
      valeur: ranReporte.valeurNPlusUn,
    });
  }

  // 9–10. Immobilisations + paramètres depuis contexte archivé
  const mappedAssets = mapAssets(closure, archivedWorkspace, issues);
  const assets =
    mappedAssets === undefined
      ? unavailable("snapshot immobilisations absent de la clôture (UNKNOWN ≠ ZERO)")
      : available(mappedAssets);

  // 11. Données durables
  const identityValue = mapIdentity(archivedWorkspace);
  const identity = identityValue
    ? available(identityValue)
    : unavailable("identité durable absente du contexte archivé");

  const propertiesList = mapProperties(archivedWorkspace);
  const properties =
    propertiesList.length > 0
      ? available(propertiesList)
      : unavailable("aucun bien dans le contexte archivé");

  const mappedLoans = mapLoans(archivedWorkspace, input.attestedLoanControls);
  const loans =
    mappedLoans === undefined
      ? unavailable("prêts inconnus dans le contexte archivé — absence ≠ []")
      : available(mappedLoans);

  // 12. Provenance déterministe (IDs, jamais index)
  const provenance: OpeningFieldProvenance = {
    source: {
      fieldPath: "source",
      sourceKind: "closure",
      sourceRef: closure.id,
    },
    "stocks.deficits": {
      fieldPath: "stocks.deficits",
      sourceKind: "closure",
      sourceRef: closure.id,
      note: "copie sans addition depuis FiscalYearClosure.stocks.deficits",
    },
    "stocks.amortissementsReportes": {
      fieldPath: "stocks.amortissementsReportes",
      sourceKind: "closure",
      sourceRef: closure.id,
      note: "STOCK FINAL fiscal — jamais case 318 / mouvement annuel",
    },
    "patrimoine.ouvertureCompteExploitant": {
      fieldPath: "patrimoine.ouvertureCompteExploitant",
      sourceKind: "derived",
      sourceRef: closure.id,
      note: "resolveOuvertureCompteExploitantNPlusUn(cloture120N + resultatComptableN)",
    },
    "patrimoine.ran": {
      fieldPath: "patrimoine.ran",
      sourceKind: "derived",
      sourceRef: closure.id,
      note: "reporterRanNPlusUn",
    },
    "patrimoine.tresorerieOuverture": {
      fieldPath: "patrimoine.tresorerieOuverture",
      sourceKind: "closure",
      sourceRef: closure.id,
      note: "non attestée sur le modèle actuel → UNAVAILABLE",
    },
  };

  if (isAvailableAssets(assets)) {
    for (const asset of assets.value) {
      provenance[`assets.${asset.id}`] = {
        fieldPath: `assets.${asset.id}`,
        sourceKind: "closure",
        sourceRef: asset.id,
      };
    }
  }
  if (mappedLoans) {
    for (const loan of mappedLoans) {
      provenance[`loans.${loan.pretId}`] = {
        fieldPath: `loans.${loan.pretId}`,
        sourceKind: "archived_workspace",
        sourceRef: loan.pretId,
      };
    }
  }

  const opening: FiscalYearOpening = {
    openingId,
    revision,
    targetFiscalYear,
    dossierId,
    source: {
      kind: "internal_closure",
      previousFiscalYearId: closedFiscalYear.id,
      sourceClosureId: closure.id,
    },
    stocks,
    assets,
    loans,
    patrimoine: {
      ouvertureCompteExploitant,
      ran,
      tresorerieOuverture: unavailable("trésorerie d'ouverture non portée par la clôture interne actuelle"),
    },
    properties,
    identity,
    provenance,
    validation: { status: "pending" },
  };

  return { opening, issues };
}

function isAvailableAssets(
  assets: FiscalYearOpening["assets"],
): assets is Extract<FiscalYearOpening["assets"], { status: "available" }> {
  return assets.status === "available";
}
