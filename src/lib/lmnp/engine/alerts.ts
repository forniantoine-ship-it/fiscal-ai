import { TAB_COPY } from "../constants/copilot-copy";
import { LMNP_ROUTES, lmnpTabRoute } from "../routes";
import type { Alert, AlertCode } from "../types";
import { FIELD_REGISTRY } from "../types/field-keys";
import type { EngineContext } from "./context";
import { getApplicableRequirements, getRequiredFields, hasActiveLedgerForField } from "./context";

function alertId(code: AlertCode, suffix: string): string {
  return `${code}-${suffix}`;
}

export function recomputeAlerts(ctx: EngineContext): Alert[] {
  const alerts: Alert[] = [];
  const base = ctx.fiscalYear.id;

  for (const req of getApplicableRequirements(ctx)) {
    if (req.level !== "required" && req.level !== "conditional") continue;
    const satisfied = ctx.documents.some(
      (d) => d.documentType === req.documentType && d.status === "analyzed",
    );
    if (!satisfied && (req.level === "required" || (req.condition === "has_loan" && ctx.flags.hasLoan))) {
      alerts.push({
        id: alertId("A04_REQUIRED_DOCUMENT_MISSING", req.documentType),
        fiscalYearId: base,
        code: "A04_REQUIRED_DOCUMENT_MISSING",
        severity: "blocking",
        status: "open",
        title: `Il manque : ${req.label}`,
        message: `Ajoutez ce document — l’IA le lira et remplira votre dossier automatiquement.`,
        primaryActionLabel: "Ajouter mes documents",
        primaryActionHref: LMNP_ROUTES.documents,
      });
    }
  }

  if (
    ctx.flags.annualInterestCents > 0 &&
    !ctx.documents.some(
      (d) =>
        (d.documentType === "loan_interest_certificate" || d.documentType === "loan_schedule") &&
        d.status === "analyzed",
    )
  ) {
    alerts.push({
      id: alertId("A05_LOAN_INTEREST_WITHOUT_CERTIFICATE", "loan"),
      fiscalYearId: base,
      code: "A05_LOAN_INTEREST_WITHOUT_CERTIFICATE",
      severity: "blocking",
      status: "open",
      title: "Il manque votre attestation de crédit",
      message: `Vous avez des intérêts d’emprunt — ajoutez le document de votre banque.`,
      fieldKey: "loan.annualInterest",
      primaryActionLabel: "Ajouter le document",
      primaryActionHref: LMNP_ROUTES.documents,
    });
  }

  for (const item of ctx.validationItems) {
    if (item.status !== "pending") continue;
    if (item.confidence < 85) {
      alerts.push({
        id: alertId("A01_LOW_CONFIDENCE", item.id),
        fiscalYearId: base,
        code: "A01_LOW_CONFIDENCE",
        severity: "warning",
        status: "open",
        title: `À vérifier : ${item.label}`,
        message: `Confiance de lecture ${item.confidence} % — un rapide contrôle suffit.`,
        validationItemId: item.id,
        fieldKey: item.fieldKey,
        primaryActionLabel: "Vérifier ce montant",
        primaryActionHref: lmnpTabRoute(FIELD_REGISTRY[item.fieldKey].tab),
      });
    }
    if (item.isRequired) {
      alerts.push({
        id: alertId("A07_PENDING_REQUIRED_VALIDATION", item.id),
        fiscalYearId: base,
        code: "A07_PENDING_REQUIRED_VALIDATION",
        severity: "warning",
        status: "open",
        title: `À confirmer : ${item.label}`,
        message: `L’IA a détecté ce montant — un clic pour valider.`,
        validationItemId: item.id,
        fieldKey: item.fieldKey,
        primaryActionLabel: "Confirmer",
        primaryActionHref: lmnpTabRoute(FIELD_REGISTRY[item.fieldKey].tab),
      });
    }
  }

  for (const fieldKey of getRequiredFields(ctx)) {
    if (!hasActiveLedgerForField(ctx, fieldKey)) {
      const meta = FIELD_REGISTRY[fieldKey as keyof typeof FIELD_REGISTRY];
      const tabLabel = TAB_COPY[meta.tab].sidebar;
      alerts.push({
        id: alertId("A11_REQUIRED_FIELD_EMPTY", fieldKey),
        fiscalYearId: base,
        code: "A11_REQUIRED_FIELD_EMPTY",
        severity: "blocking",
        status: "open",
        title: `Il manque : ${meta.label}`,
        message: `Ajoutez un document ou confirmez le montant dans « ${tabLabel} ».`,
        fieldKey: fieldKey as Alert["fieldKey"],
        primaryActionLabel: `Ouvrir ${tabLabel}`,
        primaryActionHref: lmnpTabRoute(meta.tab),
      });
    }
  }

  return dedupeAlerts(alerts);
}

function dedupeAlerts(alerts: Alert[]): Alert[] {
  const seen = new Set<string>();
  return alerts.filter((a) => {
    const key = `${a.code}-${a.validationItemId ?? a.fieldKey ?? a.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
