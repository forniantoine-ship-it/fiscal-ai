"use client";

import { useMemo, useState } from "react";
import { useLmnp } from "@/lib/lmnp/store";
import type { ValidationItem } from "@/lib/lmnp/types";
import { groupValidationByDocument } from "@/lib/lmnp/validation/grouping";
import { getTabLabelForField } from "@/lib/lmnp/validation/ledger-display";
import { useFeedback } from "@/components/lmnp/shared/FeedbackProvider";
import { EmptyState } from "@/components/lmnp/shared/EmptyState";
import { DocumentValidationCard } from "./DocumentValidationCard";
import { ValidationSummaryBar } from "./ValidationSummaryBar";
import { ValidationFieldRowDone } from "./ValidationFieldRow";
import { CorrectionModal } from "./CorrectionModal";
import { RejectFieldDialog } from "./RejectFieldDialog";

export function ValidationInbox() {
  const { workspace, dispatch } = useLmnp();
  const { showSuccess } = useFeedback();
  const [correcting, setCorrecting] = useState<ValidationItem | null>(null);
  const [rejecting, setRejecting] = useState<ValidationItem | null>(null);

  const pending = workspace.validationItems.filter((v) => v.status === "pending");
  const done = workspace.validationItems.filter(
    (v) => v.status === "approved" || v.status === "corrected" || v.status === "ignored",
  );
  const highConfidence = pending.filter((v) => v.confidence >= 95);
  const analyzedDocs = workspace.documents.filter((d) => d.status === "analyzed");

  const documentGroups = useMemo(
    () =>
      groupValidationByDocument(
        workspace.documents,
        workspace.validationItems,
        workspace.extractions,
        (v) => v.status === "pending",
      ),
    [workspace.documents, workspace.validationItems, workspace.extractions],
  );

  const base = `/app/exercices/${workspace.fiscalYear.id}`;

  const handleApprove = (item: ValidationItem) => {
    dispatch({ type: "VALIDATION_APPROVE", validationItemId: item.id });
    showSuccess(
      `${item.label} enregistré`,
      `Ligne ajoutée dans ${getTabLabelForField(item.fieldKey)}`,
      `${base}/${FIELD_TAB[item.fieldKey] ?? "recettes"}`,
    );
  };

  const handleBulkApprove = () => {
    const count = highConfidence.length;
    dispatch({ type: "VALIDATION_BULK_APPROVE_HIGH_CONFIDENCE" });
    showSuccess(
      `${count} montant${count > 1 ? "s" : ""} confirmé${count > 1 ? "s" : ""}`,
      "Synchronisés dans vos onglets métier",
      `${base}/recettes`,
    );
  };

  return (
    <div className="space-y-8">
      <ValidationSummaryBar
        pendingCount={pending.length}
        highConfidenceCount={highConfidence.length}
        analyzedDocumentsCount={analyzedDocs.length}
        validatedCount={done.filter((d) => d.status !== "ignored").length}
        onBulkApproveHighConfidence={handleBulkApprove}
      />

      {analyzedDocs.length === 0 && pending.length === 0 ? (
        <EmptyState
          title="Aucun document analysé"
          description="Importez vos pièces (loyers, charges, meublé…) — l'IA extrait les montants et vous les présente ici pour confirmation."
          primaryAction={{ label: "Ajouter des documents", href: `${base}/documents` }}
        />
      ) : pending.length === 0 ? (
        <EmptyState
          variant="success"
          title="Tout est confirmé"
          description={`${done.length} décision${done.length > 1 ? "s" : ""} enregistrée${done.length > 1 ? "s" : ""}. Vos onglets Recettes, Dépenses… sont à jour.`}
          primaryAction={{ label: "Voir les recettes", href: `${base}/recettes` }}
          secondaryAction={{ label: "Consulter les alertes", href: `${base}/alertes` }}
        />
      ) : (
        <>
          <p className="text-sm text-zinc-400">
            {pending.length} montant{pending.length !== 1 ? "s" : ""} à confirmer — les lectures ≥
            95 % sont déjà dans vos onglets. Un clic suffit pour valider le reste.
          </p>

          <div className="space-y-6">
            {documentGroups.map((group) => (
              <DocumentValidationCard
                key={group.documentId ?? "orphan"}
                group={group}
                onApprove={handleApprove}
                onCorrect={(item) => setCorrecting(item)}
                onReject={(item) => setRejecting(item)}
              />
            ))}
          </div>
        </>
      )}

      {done.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-medium text-zinc-500">
            Historique ({done.length})
          </h3>
          <ul className="space-y-2 rounded-2xl border border-white/5 bg-white/[0.01] p-2">
            {done.map((item) => (
              <ValidationFieldRowDone key={item.id} item={item} />
            ))}
          </ul>
        </section>
      )}

      <CorrectionModal
        item={correcting}
        onClose={() => setCorrecting(null)}
        onSave={(finalValue, note) => {
          if (!correcting) return;
          dispatch({
            type: "VALIDATION_CORRECT",
            validationItemId: correcting.id,
            finalValue,
            note,
          });
          showSuccess(
            `${correcting.label} corrigé`,
            `Montant mis à jour dans ${getTabLabelForField(correcting.fieldKey)}`,
            `${base}/${FIELD_TAB[correcting.fieldKey] ?? "recettes"}`,
          );
        }}
      />

      <RejectFieldDialog
        item={rejecting}
        onClose={() => setRejecting(null)}
        onConfirm={(note) => {
          if (!rejecting) return;
          dispatch({
            type: "VALIDATION_REJECT",
            validationItemId: rejecting.id,
            note,
          });
        }}
      />
    </div>
  );
}

const FIELD_TAB: Record<string, string> = {
  "fiscal.regime": "activite",
  "property.address": "activite",
  "property.label": "activite",
  "income.annualRent": "recettes",
  "income.refactoredCharges": "recettes",
  "expense.propertyTax": "depenses",
  "expense.insurance": "depenses",
  "expense.condo": "depenses",
  "expense.worksDeductible": "depenses",
  "expense.managementFees": "depenses",
  "expense.other": "depenses",
  "amort.buildingAnnual": "immobilisations",
  "amort.furnitureAnnual": "immobilisations",
  "loan.annualInterest": "emprunts",
};
