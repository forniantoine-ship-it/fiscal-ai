"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLmnp } from "@/lib/lmnp/store";
import type { ValidationItem } from "@/lib/lmnp/types";
import { groupValidationByDocument } from "@/lib/lmnp/validation/grouping";
import { DocumentValidationCard } from "./DocumentValidationCard";
import { ValidationSummaryBar } from "./ValidationSummaryBar";
import { ValidationFieldRowDone } from "./ValidationFieldRow";
import { CorrectionModal } from "./CorrectionModal";
import { RejectFieldDialog } from "./RejectFieldDialog";

export function ValidationInbox() {
  const { workspace, dispatch } = useLmnp();
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

  return (
    <div className="space-y-8">
      <ValidationSummaryBar
        pendingCount={pending.length}
        highConfidenceCount={highConfidence.length}
        analyzedDocumentsCount={analyzedDocs.length}
        validatedCount={done.filter((d) => d.status !== "ignored").length}
        onBulkApproveHighConfidence={() =>
          dispatch({ type: "VALIDATION_BULK_APPROVE_HIGH_CONFIDENCE" })
        }
      />

      {analyzedDocs.length === 0 && pending.length === 0 ? (
        <EmptyState href={`${base}/documents`} />
      ) : pending.length === 0 ? (
        <AllValidatedState href={base} doneCount={done.length} />
      ) : (
        <>
          <p className="text-sm text-zinc-400">
            {pending.length} montant{pending.length !== 1 ? "s" : ""} extrait
            {pending.length !== 1 ? "s" : ""} par l&apos;IA — regroupés par document. Chaque
            approbation ou correction crée une ligne dans votre dossier comptable.
          </p>

          <div className="space-y-6">
            {documentGroups.map((group) => (
              <DocumentValidationCard
                key={group.documentId ?? "orphan"}
                group={group}
                onApprove={(item) =>
                  dispatch({ type: "VALIDATION_APPROVE", validationItemId: item.id })
                }
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

function EmptyState({ href }: { href: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center">
      <p className="text-lg font-semibold text-zinc-200">Aucun document analysé</p>
      <p className="mt-2 text-sm text-zinc-500">
        Importez vos pièces pour que l&apos;IA extraie les montants à valider.
      </p>
      <Link
        href={href}
        className="mt-6 inline-flex rounded-full bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-emerald-400"
      >
        Ajouter des documents
      </Link>
    </div>
  );
}

function AllValidatedState({ href, doneCount }: { href: string; doneCount: number }) {
  return (
    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-10 text-center">
      <p className="text-lg font-semibold text-emerald-400">Tout est confirmé</p>
      <p className="mt-2 text-sm text-zinc-400">
        {doneCount} décision{doneCount !== 1 ? "s" : ""} enregistrée{doneCount !== 1 ? "s" : ""}.
        Passez aux onglets Recettes, Dépenses… pour le récapitulatif.
      </p>
      <Link
        href={`${href}/recettes`}
        className="mt-6 inline-flex rounded-full border border-white/10 px-5 py-2.5 text-sm font-medium text-zinc-300 hover:bg-white/5"
      >
        Voir les recettes
      </Link>
    </div>
  );
}
