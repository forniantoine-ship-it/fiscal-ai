"use client";

import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import {
  NATURES_A_PAYER,
  NATURES_A_RECEVOIR,
  ajouterPoste,
  modifierPoste,
  retirerPoste,
  type NatureOption,
  type PosteIntakeRow,
  type VentilationTiersIntakeState,
} from "@/lib/lmnp/services/declaration/ventilation-tiers-intake";
import type { NatureEconomique } from "@/runtime/capabilities/bilan/types";

/**
 * B-FAMILY-3 — collecte des 5 natures famille B (068/072/164/166/172).
 *
 * Composant CONTRÔLÉ (`value`/`onChange`) depuis B-FAMILY-3 — même pattern
 * que `PatrimonialIntakeCard` lui-même vis-à-vis de son propre parent.
 * Ne construit toujours aucun `BilanInputs`/`VentilationTiersInputs` ici :
 * la traduction (`buildVentilationTiersInputs`) vit dans
 * `ventilation-tiers-intake.ts`, appelée par `buildBilanPatrimonial()`.
 */
export function VentilationTiersIntakeCard({
  value,
  onChange,
}: {
  value: VentilationTiersIntakeState;
  onChange: (value: VentilationTiersIntakeState) => void;
}) {
  return (
    <section className="w-full space-y-6">
      <div>
        <p style={{ ...typography.body.desktop, color: colors.text.primary, fontWeight: 500 }}>
          Sommes dues entre vous et des tiers au titre de cette activité
        </p>
        <p className="mt-1" style={{ ...typography.caption.desktop, color: colors.text.secondary }}>
          Si vous ne savez pas, laissez cette section sans réponse — elle restera simplement non renseignée.
        </p>
      </div>

      <PosteListe
        titre="Sommes qui vous sont dues au 31/12"
        confirmationLabel="Je confirme n'avoir aucune somme à recevoir"
        natures={NATURES_A_RECEVOIR}
        postes={value.postesRecevoir}
        confirmationVide={value.confirmationRecevoirVide}
        onAdd={(nature) => onChange({ ...value, postesRecevoir: ajouterPoste(value.postesRecevoir, nature) })}
        onRemove={(id) => onChange({ ...value, postesRecevoir: retirerPoste(value.postesRecevoir, id) })}
        onChangeRow={(id, patch) => onChange({ ...value, postesRecevoir: modifierPoste(value.postesRecevoir, id, patch) })}
        onToggleConfirmation={() => onChange({ ...value, confirmationRecevoirVide: !value.confirmationRecevoirVide })}
      />

      <PosteListe
        titre="Sommes que vous devez au 31/12"
        confirmationLabel="Je confirme n'avoir aucune somme à payer"
        natures={NATURES_A_PAYER}
        postes={value.postesPayer}
        confirmationVide={value.confirmationPayerVide}
        onAdd={(nature) => onChange({ ...value, postesPayer: ajouterPoste(value.postesPayer, nature) })}
        onRemove={(id) => onChange({ ...value, postesPayer: retirerPoste(value.postesPayer, id) })}
        onChangeRow={(id, patch) => onChange({ ...value, postesPayer: modifierPoste(value.postesPayer, id, patch) })}
        onToggleConfirmation={() => onChange({ ...value, confirmationPayerVide: !value.confirmationPayerVide })}
      />
    </section>
  );
}

function PosteListe({
  titre,
  confirmationLabel,
  natures,
  postes,
  confirmationVide,
  onAdd,
  onRemove,
  onChangeRow,
  onToggleConfirmation,
}: {
  titre: string;
  confirmationLabel: string;
  natures: readonly NatureOption[];
  postes: readonly PosteIntakeRow[];
  confirmationVide: boolean;
  onAdd: (nature: NatureEconomique) => void;
  onRemove: (id: string) => void;
  onChangeRow: (id: string, patch: Partial<Pick<PosteIntakeRow, "nature" | "montantRaw" | "libelle">>) => void;
  onToggleConfirmation: () => void;
}) {
  return (
    <div
      style={{
        borderRadius: radius.md,
        border: `1px solid ${colors.border.subtle}`,
        padding: spacing.scale[4],
      }}
      className="space-y-3"
    >
      <p style={{ ...typography.body.desktop, color: colors.text.primary, fontWeight: 500 }}>{titre}</p>

      {postes.map((poste) => (
        <PosteRow key={poste.id} poste={poste} natures={natures} onChange={(patch) => onChangeRow(poste.id, patch)} onRemove={() => onRemove(poste.id)} />
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => onAdd(natures[0].nature)}
          className="min-h-[40px]"
          style={{
            borderRadius: radius.md,
            border: `1px solid ${colors.border.default}`,
            backgroundColor: colors.surface.primary,
            color: colors.text.secondary,
            padding: `${spacing.scale[2]} ${spacing.scale[3]}`,
            ...typography.body.desktop,
          }}
        >
          Ajouter
        </button>

        <label className="flex items-center gap-2" style={{ ...typography.caption.desktop, color: colors.text.secondary }}>
          <input type="checkbox" checked={confirmationVide} onChange={onToggleConfirmation} />
          {confirmationLabel}
        </label>
      </div>
    </div>
  );
}

function PosteRow({
  poste,
  natures,
  onChange,
  onRemove,
}: {
  poste: PosteIntakeRow;
  natures: readonly NatureOption[];
  onChange: (patch: Partial<Pick<PosteIntakeRow, "nature" | "montantRaw" | "libelle">>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="block space-y-1">
        <span style={{ ...typography.caption.desktop, color: colors.text.secondary }}>Catégorie</span>
        <select
          value={poste.nature}
          onChange={(event) => onChange({ nature: event.target.value as NatureEconomique })}
          className="block"
          style={{
            borderRadius: radius.md,
            border: `1px solid ${colors.border.default}`,
            backgroundColor: colors.surface.inset,
            color: colors.text.primary,
            padding: `${spacing.scale[2]} ${spacing.scale[3]}`,
            ...typography.body.desktop,
          }}
        >
          {natures.map((option) => (
            <option key={option.nature} value={option.nature}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block space-y-1">
        <span style={{ ...typography.caption.desktop, color: colors.text.secondary }}>Libellé (optionnel)</span>
        <input
          type="text"
          value={poste.libelle}
          onChange={(event) => onChange({ libelle: event.target.value })}
          placeholder="Ex. Loyer de décembre"
          className="block w-48"
          style={{
            borderRadius: radius.md,
            border: `1px solid ${colors.border.default}`,
            backgroundColor: colors.surface.inset,
            color: colors.text.primary,
            padding: `${spacing.scale[2]} ${spacing.scale[3]}`,
            ...typography.body.desktop,
          }}
        />
      </label>

      <label className="block space-y-1">
        <span style={{ ...typography.caption.desktop, color: colors.text.secondary }}>Montant</span>
        <input
          type="text"
          inputMode="decimal"
          value={poste.montantRaw}
          // Volontairement : on ne stocke que la chaîne saisie, jamais un
          // Number(raw) ici — même convention que `AmountField` dans
          // `PatrimonialIntakeCard.tsx` (parseMontantSaisi au moment de la
          // construction, jamais avant).
          onChange={(event) => onChange({ montantRaw: event.target.value })}
          placeholder="Non renseigné"
          className="block w-32"
          style={{
            borderRadius: radius.md,
            border: `1px solid ${colors.border.default}`,
            backgroundColor: colors.surface.inset,
            color: colors.text.primary,
            padding: `${spacing.scale[2]} ${spacing.scale[3]}`,
            ...typography.body.desktop,
          }}
        />
      </label>

      <button
        type="button"
        onClick={onRemove}
        style={{ ...typography.caption.desktop, color: colors.text.muted }}
      >
        Supprimer
      </button>
    </div>
  );
}
