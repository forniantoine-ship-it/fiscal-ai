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
        title: `Pièce manquante : ${req.label}`,
        message: `Ajoutez ce document pour pouvoir clôturer sereinement votre dossier.`,
        primaryActionLabel: "Ajouter un document",
        primaryActionHref: `/app/exercices/${base}/documents`,
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
      title: "Attestation d'intérêts manquante",
      message: `Vous avez indiqué des intérêts d'emprunt — joignez l'attestation de votre banque.`,
      fieldKey: "loan.annualInterest",
      primaryActionLabel: "Ajouter le document",
      primaryActionHref: `/app/exercices/${base}/documents`,
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
        primaryActionLabel: "Confirmer le montant",
        primaryActionHref: `/app/exercices/${base}/validation`,
      });
    }
    if (item.isRequired) {
      alerts.push({
        id: alertId("A07_PENDING_REQUIRED_VALIDATION", item.id),
        fiscalYearId: base,
        code: "A07_PENDING_REQUIRED_VALIDATION",
        severity: "warning",
        status: "open",
        title: `Montant à confirmer : ${item.label}`,
        message: `Ce montant est nécessaire pour compléter votre dossier.`,
        validationItemId: item.id,
        fieldKey: item.fieldKey,
        primaryActionLabel: "Ouvrir la validation",
        primaryActionHref: `/app/exercices/${base}/validation`,
      });
    }
  }

  for (const fieldKey of getRequiredFields(ctx)) {
    if (!hasActiveLedgerForField(ctx, fieldKey)) {
      const meta = FIELD_REGISTRY[fieldKey as keyof typeof FIELD_REGISTRY];
      alerts.push({
        id: alertId("A11_REQUIRED_FIELD_EMPTY", fieldKey),
        fiscalYearId: base,
        code: "A11_REQUIRED_FIELD_EMPTY",
        severity: "blocking",
        status: "open",
        title: `Information manquante : ${meta.label}`,
        message: `Complétez ou validez cette donnée dans l'onglet ${meta.tab}.`,
        fieldKey: fieldKey as Alert["fieldKey"],
        primaryActionLabel: `Aller à ${meta.tab}`,
        primaryActionHref: `/app/exercices/${base}/${meta.tab}`,
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
