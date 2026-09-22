"use client";

import { UploadZone } from "@/design-system/components/UploadZone";
import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import { EXTERNAL_TAKEOVER_COPY } from "./external-takeover-copy";

type SlotRole = "prior_tax_package" | "prior_depreciation_register";

type ExternalTakeoverUploadSlotsProps = {
  fiscalYear: number;
  taxPackageFileName?: string;
  registerFileName?: string;
  disabled?: boolean;
  onUploaded: (
    role: SlotRole,
    files: File[],
    meta?: { supabaseDocumentIds: string[]; filePaths: string[] },
  ) => void;
};

export function ExternalTakeoverUploadSlots({
  fiscalYear,
  taxPackageFileName,
  registerFileName,
  disabled,
  onUploaded,
}: ExternalTakeoverUploadSlotsProps) {
  return (
    <div className="space-y-4">
      <UploadSlot
        title={EXTERNAL_TAKEOVER_COPY.taxPackage.label}
        help={EXTERNAL_TAKEOVER_COPY.taxPackage.help}
        fileName={taxPackageFileName}
        fiscalYear={fiscalYear}
        accept=".pdf,application/pdf"
        hint="PDF"
        disabled={disabled}
        onFiles={(files, meta) => onUploaded("prior_tax_package", files, meta)}
      />
      <UploadSlot
        title={EXTERNAL_TAKEOVER_COPY.register.label}
        help={EXTERNAL_TAKEOVER_COPY.register.help}
        fileName={registerFileName}
        fiscalYear={fiscalYear}
        accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
        hint="Excel (.xlsx, .xls)"
        disabled={disabled}
        onFiles={(files, meta) => onUploaded("prior_depreciation_register", files, meta)}
      />
    </div>
  );
}

function UploadSlot(props: {
  title: string;
  help: string;
  fileName?: string;
  fiscalYear: number;
  accept: string;
  hint: string;
  disabled?: boolean;
  onFiles: (
    files: File[],
    meta?: { supabaseDocumentIds: string[]; filePaths: string[] },
  ) => void;
}) {
  return (
    <div
      className="space-y-2"
      style={{
        borderRadius: radius.md,
        border: `1px solid ${colors.border.default}`,
        padding: spacing.scale[3],
        backgroundColor: colors.surface.primary,
      }}
    >
      <p style={{ ...typography.body.desktop, color: colors.text.primary, fontWeight: typography.fontWeight.medium }}>
        {props.title}
      </p>
      <p style={{ ...typography.caption.desktop, color: colors.text.secondary }}>{props.help}</p>
      {props.fileName ? (
        <p style={{ ...typography.body.desktop, color: colors.text.accent }} aria-live="polite">
          ✓ {props.fileName}
        </p>
      ) : null}
      {!props.disabled ? (
        <UploadZone
          fiscalYear={props.fiscalYear}
          documentRole="annual_evidence"
          onFiles={props.onFiles}
          accept={props.accept}
          multiple={false}
          title={props.fileName ? EXTERNAL_TAKEOVER_COPY.replaceFile : "Déposer le fichier"}
          hint={props.hint}
        />
      ) : null}
    </div>
  );
}
