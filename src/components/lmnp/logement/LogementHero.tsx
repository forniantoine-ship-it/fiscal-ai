"use client";

import { useRef, useState, type DragEvent, type KeyboardEvent } from "react";

import { Button } from "@/design-system/components/Button";
import { colors } from "@/design-system/theme/colors";
import { gradients } from "@/design-system/theme/gradients";
import { motions } from "@/design-system/theme/motions";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import {
  LOGEMENT_FADE_IN,
  logementMotionStyle,
} from "@/components/lmnp/logement/logement-visual-isolation";

export type LogementHeroUploadState = "idle" | "uploaded";

type LogementHeroProps = {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  uploadState?: LogementHeroUploadState;
  uploadedFileName?: string;
  uploadedCount?: number;
};

const HERO_BADGE = "Bien immobilier";
const HERO_TITLE = "Ajoutez votre acte notarié";
const HERO_EXPLANATION =
  "Déposez votre acte d'acquisition.\nL'IA détecte automatiquement les informations du logement et prépare les étapes suivantes.\nVous pourrez corriger ou compléter les informations ensuite.";
const HERO_HELPER =
  "Ces informations seront automatiquement réutilisées pour préparer les étapes suivantes.";
const UPLOAD_PROMPT = "Glissez votre document ici ou cliquez pour importer";

export function LogementHero({
  onFiles,
  disabled = false,
  uploadState = "idle",
  uploadedFileName,
  uploadedCount = 1,
}: LogementHeroProps) {
  console.count("[LogementHero render]");

  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);

  const isUploaded = uploadState === "uploaded";
  const active = !disabled && !isUploaded && (dragging || hovered);

  const handleFiles = (list: FileList | null) => {
    if (!list?.length || disabled) return;
    onFiles(Array.from(list));
  };

  const prevent = (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const openFilePicker = () => {
    if (!disabled) inputRef.current?.click();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if ((event.key === "Enter" || event.key === " ") && !disabled) {
      event.preventDefault();
      openFilePicker();
    }
  };

  return (
    <section
      className="relative mx-auto max-w-3xl overflow-hidden text-center"
      style={{
        borderRadius: radius.lg,
        border: `1px solid ${colors.border.subtle}`,
        boxShadow: shadows.card.default,
        padding: `${spacing.card.sm} ${spacing.card.md}`,
        backgroundImage: [
          `radial-gradient(ellipse 88% 52% at 50% -8%, ${colors.orange[100]} 0%, transparent 62%)`,
          gradients.card.elevated,
        ].join(", "),
      }}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".pdf,image/*"
        className="hidden"
        disabled={disabled}
        onChange={(event) => handleFiles(event.target.files)}
      />

      <div className="relative flex flex-wrap items-center justify-center gap-2">
        <span
          style={{
            ...typography.caption.desktop,
            color: colors.text.accent,
            letterSpacing: typography.letterSpacing.label,
            padding: `${spacing.scale[1]} ${spacing.scale[2]}`,
            borderRadius: radius.full,
            border: `1px solid ${colors.border.subtle}`,
            backgroundColor: colors.surface.selected,
          }}
        >
          {HERO_BADGE}
        </span>
        {isUploaded ? <SuccessPill /> : null}
      </div>

      <h1
        className="relative mx-auto mt-4 max-w-xl text-[1.375rem] sm:text-[1.625rem]"
        style={{
          fontFamily: typography.fontFamily.display,
          fontWeight: typography.fontWeight.regular,
          lineHeight: typography.lineHeight.heading,
          letterSpacing: typography.letterSpacing.heading,
          color: colors.text.primary,
        }}
      >
        {HERO_TITLE}
      </h1>
      <p
        className="relative mx-auto mt-2.5 max-w-lg whitespace-pre-line"
        style={{
          ...typography.body.desktop,
          fontSize: typography.fontSize.sm,
          color: colors.text.secondary,
          lineHeight: typography.lineHeight.ui,
        }}
      >
        {HERO_EXPLANATION}
      </p>
      <p
        className="relative mx-auto mt-2 max-w-md"
        style={{
          ...typography.caption.desktop,
          color: colors.text.muted,
          lineHeight: typography.lineHeight.ui,
        }}
      >
        {HERO_HELPER}
      </p>

      {isUploaded ? (
        <UploadedSummary
          fileName={uploadedFileName}
          count={uploadedCount}
          onAddAnother={openFilePicker}
          disabled={disabled}
        />
      ) : (
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-disabled={disabled}
          aria-label={UPLOAD_PROMPT}
          className="relative mx-auto mt-5 max-w-md outline-none"
          style={{
            borderRadius: radius.md,
            border: `1.5px dashed ${active ? colors.orange[300] : colors.border.default}`,
            backgroundColor: active ? colors.orange[50] : colors.surface.inset,
            boxShadow: active ? shadows.upload.dragOver : shadows.upload.idle,
            padding: `${spacing.scale[6]} ${spacing.scale[5]}`,
            cursor: disabled ? "default" : "pointer",
            opacity: disabled ? 0.6 : 1,
            ...logementMotionStyle(motions.hover.card),
          }}
          onClick={openFilePicker}
          onKeyDown={handleKeyDown}
          onDragOver={(event) => {
            prevent(event);
            if (!disabled) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            prevent(event);
            setDragging(false);
            handleFiles(event.dataTransfer.files);
          }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          <UploadIcon active={active} />
          <p
            className="mx-auto mt-3 max-w-xs"
            style={{
              ...typography.caption.desktop,
              color: active ? colors.text.secondary : colors.text.muted,
              lineHeight: typography.lineHeight.ui,
            }}
          >
            {UPLOAD_PROMPT}
          </p>
        </div>
      )}
    </section>
  );
}

function UploadedSummary({
  fileName,
  count,
  onAddAnother,
  disabled,
}: {
  fileName?: string;
  count: number;
  onAddAnother: () => void;
  disabled?: boolean;
}) {
  console.count("[LogementHero.UploadedSummary render]");

  const label = count === 1 ? "1 document importé" : `${count} documents importés`;

  return (
    <div
      className={`relative mx-auto mt-5 max-w-md ${LOGEMENT_FADE_IN}`}
      style={{
        borderRadius: radius.md,
        border: `1px solid ${colors.success.muted}`,
        backgroundColor: colors.surface.primary,
        boxShadow: shadows.card.default,
        padding: `${spacing.scale[5]} ${spacing.scale[5]}`,
      }}
    >
      <p style={{ ...typography.body.desktop, color: colors.text.primary, fontWeight: typography.fontWeight.medium }}>
        {label}
      </p>
      {fileName ? (
        <p className="mt-1 truncate" style={{ ...typography.caption.desktop, color: colors.text.secondary }}>
          {fileName}
        </p>
      ) : null}
      <div className="mt-4 flex justify-center">
        <Button variant="secondary" disabled={disabled} onClick={onAddAnother}>
          Ajouter un autre document
        </Button>
      </div>
    </div>
  );
}

function SuccessPill() {
  return (
    <span
      className="inline-flex items-center gap-2"
      style={{
        ...typography.caption.desktop,
        color: colors.success.DEFAULT,
        padding: `${spacing.scale[1]} ${spacing.scale[2]}`,
        borderRadius: radius.full,
        border: `1px solid ${colors.success.muted}`,
        backgroundColor: colors.surface.primary,
      }}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: colors.success.DEFAULT }} />
      Import réussi
    </span>
  );
}

function UploadIcon({ active }: { active: boolean }) {
  console.count("[LogementHero.UploadIcon render]");

  return (
    <span
      aria-hidden
      className="mx-auto flex h-10 w-10 items-center justify-center"
      style={{
        borderRadius: radius.full,
        backgroundColor: active ? colors.orange[100] : colors.surface.primary,
        color: active ? colors.orange[500] : colors.text.muted,
        boxShadow: active ? `0 0 0 4px ${colors.orange[50]}` : "none",
        ...logementMotionStyle(motions.hover.card),
      }}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 16V4" />
        <path d="m7 9 5-5 5 5" />
        <path d="M4 20h16" />
      </svg>
    </span>
  );
}
