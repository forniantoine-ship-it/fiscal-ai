"use client";

import { useState } from "react";
import { useLmnp } from "@/lib/lmnp/store";
import type { ValidationItem } from "@/lib/lmnp/types";
import { formatMoney } from "@/lib/lmnp/types/values";
import { ConfidencePill } from "../shared/ConfidencePill";
import { CorrectionModal } from "./CorrectionModal";

export function ValidationInbox() {
  const { workspace, dispatch } = useLmnp();
  const [correcting, setCorrecting] = useState<ValidationItem | null>(null);

  const pending = workspace.validationItems.filter((v) => v.status === "pending");
  const done = workspace.validationItems.filter(
    (v) => v.status === "approved" || v.status === "corrected",
  );
  const highConfidence = pending.filter((v) => v.confidence >= 95);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-zinc-400">
          {pending.length} montant{pending.length !== 1 ? "s" : ""} à confirmer ·{" "}
          <span className="text-zinc-500">L&apos;IA propose — vous validez.</span>
        </p>
        {highConfidence.length > 0 && (
          <button
            type="button"
            onClick={() => dispatch({ type: "VALIDATION_BULK_APPROVE_HIGH_CONFIDENCE" })}
            className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-400 hover:bg-emerald-500/20"
          >
            Tout valider ≥ 95 % ({highConfidence.length})
          </button>
        )}
      </div>

      {pending.length === 0 ? (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-10 text-center">
          <p className="text-lg font-semibold text-emerald-400">Tout est confirmé</p>
          <p className="mt-2 text-sm text-zinc-400">
            Passez aux onglets Recettes, Dépenses… pour vérifier le récapitulatif.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {pending.map((item) => (
            <li key={item.id} className="glass rounded-xl p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-zinc-100">{item.label}</p>
                  <p className="mt-1 text-lg font-semibold text-zinc-50">
                    {item.proposedValue.type === "money"
                      ? formatMoney(item.proposedValue)
                      : item.proposedValue.type === "text"
                        ? item.proposedValue.text
                        : "—"}
                  </p>
                  {item.documentFileName && (
                    <p className="mt-1 text-xs text-zinc-500">Source : {item.documentFileName}</p>
                  )}
                </div>
                <ConfidencePill score={item.confidence} />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    dispatch({ type: "VALIDATION_APPROVE", validationItemId: item.id })
                  }
                  className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400"
                >
                  C&apos;est correct
                </button>
                <button
                  type="button"
                  onClick={() => setCorrecting(item)}
                  className="rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-white/5"
                >
                  Corriger
                </button>
                <button
                  type="button"
                  onClick={() =>
                    dispatch({ type: "VALIDATION_IGNORE", validationItemId: item.id })
                  }
                  className="rounded-full px-4 py-2 text-sm text-zinc-500 hover:text-zinc-300"
                >
                  Ignorer
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {done.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-medium text-zinc-500">
            Déjà confirmés ({done.length})
          </h3>
          <ul className="space-y-2">
            {done.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between rounded-lg bg-white/[0.02] px-4 py-3 text-sm"
              >
                <span className="text-zinc-400">{item.label}</span>
                <span className="font-medium text-emerald-400/90">
                  {item.finalValue?.type === "money"
                    ? formatMoney(item.finalValue)
                    : item.finalValue?.type === "text"
                      ? item.finalValue.text
                      : formatMoney(item.proposedValue)}
                  {" · "}✓
                </span>
              </li>
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
    </div>
  );
}
