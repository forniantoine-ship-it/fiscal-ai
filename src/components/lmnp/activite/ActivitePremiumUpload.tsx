"use client";

import { useRef, useState, type DragEvent } from "react";

import { Button } from "@/design-system/components/Button";
import { colors } from "@/design-system/theme/colors";
import { motions } from "@/design-system/theme/motions";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";

type ActivitePremiumUploadProps = {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
};

export function ActivitePremiumUpload({ onFiles, disabled }: ActivitePremiumUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);

  const handleFiles = (list: FileList | null) => {
    if (!list?.length || disabled) return;
    onFiles(Array.from(list));
  };

  const prevent = (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const active = dragging || hovered;

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      className="w-full text-center outline-none"
      style={{
        borderRadius: radius.lg,
        border: `1.5px dashed ${active ? colors.orange[300] : colors.border.default}`,
        backgroundColor: active ? colors.orange[50] : colors.surface.inset,
        boxShadow: active ? shadows.upload.dragOver : shadows.upload.idle,
        padding: `${spacing.scale[8]} ${spacing.scale[6]}`,
        transition: motions.hover.card,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
      }}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(event) => {
        if ((event.key === "Enter" || event.key === " ") && !disabled) {
          event.preventDefault();
          inputRef.current?.click();
        }
      }}
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
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".pdf,image/*"
        className="hidden"
        disabled={disabled}
        onChange={(event) => handleFiles(event.target.files)}
      />

      <p
        style={{
          fontFamily: typography.fontFamily.display,
          fontSize: typography.fontSize.lg,
          fontWeight: typography.fontWeight.regular,
          lineHeight: typography.lineHeight.title,
          color: colors.text.primary,
        }}
      >
        Déposez votre document ici
      </p>
      <p className="mt-1.5" style={{ ...typography.caption.desktop, color: colors.text.muted }}>
        PDF, image ou capture écran
      </p>

      <div className="mt-5 flex justify-center">
        <Button
          variant="primary"
          disabled={disabled}
          onClick={(event) => {
            event.stopPropagation();
            if (!disabled) inputRef.current?.click();
          }}
        >
          Choisir un fichier
        </Button>
      </div>
    </div>
  );
}
