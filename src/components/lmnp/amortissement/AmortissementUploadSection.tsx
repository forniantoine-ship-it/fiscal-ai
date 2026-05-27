"use client";

import { useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { uploadDocument } from "@/lib/uploadDocument";
import { supabase } from "@/lib/supabase";
import { Button } from "@/design-system/components/Button";
import { colors } from "@/design-system/theme/colors";
import { motions } from "@/design-system/theme/motions";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";

type AmortissementUploadSectionProps = {
  title: string;
  helper?: string;
  uploadPrompt?: string;
  uploadedCount?: number;
  uploadedFileName?: string;
  onFiles: (files: File[]) => void;
  onContinue?: () => void;
  continueLabel?: string;
  canContinue?: boolean;
  onSkip?: () => void;
  skipLabel?: string;
  disabled?: boolean;
  visible?: boolean;
  cardStyle: React.CSSProperties;
  delayMs?: number;
};

export function AmortissementUploadSection({
  title,
  helper,
  uploadPrompt = "Glissez vos documents ici ou cliquez pour importer",
  uploadedCount = 0,
  uploadedFileName,
  onFiles,
  onContinue,
  continueLabel = "Continuer",
  canContinue = false,
  onSkip,
  skipLabel,
  disabled = false,
  visible = true,
  cardStyle,
  delayMs = 0,
}: AmortissementUploadSectionProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);

  if (!visible) return null;

  const isUploaded = uploadedCount > 0;
  const active = !disabled && (dragging || hovered);

  const handleFiles = async (list: FileList | null) => {
    if (!list?.length || disabled) return;
  
    const files = Array.from(list);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      console.error("[AmortissementUploadSection] upload aborted: user not authenticated");
      alert("Utilisateur non connecté");
      return;
    }

    const uploadedFiles: File[] = [];

    for (const file of files) {
      const path = await uploadDocument(file, user.id);
      if (path) {
        uploadedFiles.push(file);
      }
    }

    if (uploadedFiles.length === 0) {
      console.error("[AmortissementUploadSection] upload failed: no files stored in Supabase");
      return;
    }

    onFiles(uploadedFiles);
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
      className="w-full animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both]"
      style={{ ...cardStyle, animationDelay: `${delayMs}ms`, textAlign: "center" }}
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

      <h2
        style={{
          fontFamily: typography.fontFamily.display,
          fontSize: typography.fontSize.xl,
          color: colors.text.primary,
        }}
      >
        {title}
      </h2>
      {helper ? (
        <p className="mx-auto mt-3 max-w-lg" style={{ ...typography.body.desktop, color: colors.text.secondary }}>
          {helper}
        </p>
      ) : null}

      {isUploaded ? (
        <div
          className="mx-auto mt-5 max-w-md"
          style={{
            borderRadius: radius.md,
            border: `1px solid ${colors.success.muted}`,
            backgroundColor: colors.surface.primary,
            boxShadow: shadows.card.default,
            padding: `${spacing.scale[5]} ${spacing.scale[5]}`,
          }}
        >
          <p style={{ ...typography.body.desktop, color: colors.text.primary, fontWeight: typography.fontWeight.medium }}>
            {uploadedCount === 1 ? "1 document importé" : `${uploadedCount} documents importés`}
          </p>
          {uploadedFileName ? (
            <p className="mt-1 truncate" style={{ ...typography.caption.desktop, color: colors.text.muted }}>
              {uploadedFileName}
            </p>
          ) : null}
          <div className="mt-4 flex flex-col items-center gap-3">
            {canContinue && onContinue ? (
              <Button disabled={disabled} onClick={onContinue}>
                {continueLabel}
              </Button>
            ) : null}
            <Button variant="secondary" disabled={disabled} onClick={openFilePicker}>
              Ajouter un autre document
            </Button>
          </div>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-disabled={disabled}
          aria-label={uploadPrompt}
          className="mx-auto mt-5 max-w-md outline-none"
          style={{
            borderRadius: radius.md,
            border: `1.5px dashed ${active ? colors.orange[300] : colors.border.default}`,
            backgroundColor: active ? colors.orange[50] : colors.surface.inset,
            boxShadow: active ? shadows.upload.dragOver : shadows.upload.idle,
            padding: `${spacing.scale[6]} ${spacing.scale[5]}`,
            cursor: disabled ? "default" : "pointer",
            opacity: disabled ? 0.6 : 1,
            transition: motions.hover.card,
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
            {uploadPrompt}
          </p>
          <p className="mt-2" style={{ ...typography.caption.desktop, color: colors.text.muted }}>
            PDF, images, captures d&apos;écran, factures ou devis
          </p>
        </div>
      )}

      {onSkip && skipLabel && !isUploaded ? (
        <div className="mt-4">
          <button
            type="button"
            onClick={onSkip}
            style={{
              ...typography.caption.desktop,
              color: colors.text.muted,
              textDecoration: "underline",
              textUnderlineOffset: "3px",
            }}
          >
            {skipLabel}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function UploadIcon({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden
      className="mx-auto flex h-10 w-10 items-center justify-center"
      style={{
        borderRadius: radius.full,
        backgroundColor: active ? colors.orange[100] : colors.surface.primary,
        color: active ? colors.orange[500] : colors.text.muted,
        boxShadow: active ? `0 0 0 4px ${colors.orange[50]}` : "none",
        transition: motions.hover.card,
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
