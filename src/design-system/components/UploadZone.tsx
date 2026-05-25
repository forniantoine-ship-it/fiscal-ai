"use client";

import { useRef, useState, type DragEvent } from "react";

import { colors } from "@/design-system/theme/colors";
import { motions } from "@/design-system/theme/motions";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";

export type UploadZoneProps = {
  onFiles: (files: File[]) => void;
  hint?: string;
  title?: string;
  accept?: string;
  multiple?: boolean;
  className?: string;
};

export function UploadZone({
  onFiles,
  hint = "PDF ou images — dépôt multiple accepté",
  title = "Déposer vos documents",
  accept = ".pdf,image/*",
  multiple = true,
  className = "",
}: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);

  const handleFiles = (list: FileList | null) => {
    if (!list?.length) return;
    onFiles(Array.from(list));
  };

  const prevent = (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const surface = dragging
    ? {
        backgroundColor: colors.upload.dragOverBackground,
        borderColor: colors.upload.dragOverBorder,
        boxShadow: shadows.upload.dragOver,
      }
    : hovered
      ? {
          backgroundColor: colors.surface.interactive,
          borderColor: colors.border.strong,
          boxShadow: shadows.card.hover,
        }
      : {
          backgroundColor: colors.upload.idleBackground,
          borderColor: colors.upload.idleBorder,
          boxShadow: shadows.upload.idle,
        };

  return (
    <button
      type="button"
      className={`w-full text-center ${className}`}
      style={{
        borderRadius: radius.xl,
        border: `1px dashed ${surface.borderColor}`,
        backgroundColor: surface.backgroundColor,
        boxShadow: surface.boxShadow,
        padding: `${spacing.scale[12]} ${spacing.scale[8]}`,
        transition: motions.hover.card,
      }}
      onClick={() => inputRef.current?.click()}
      onDragOver={(event) => {
        prevent(event);
        setDragging(true);
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
        multiple={multiple}
        accept={accept}
        className="hidden"
        onChange={(event) => handleFiles(event.target.files)}
      />
      <p style={{ ...typography.body.desktop, color: colors.text.primary, fontWeight: typography.fontWeight.medium }}>
        {title}
      </p>
      <p className="mt-2" style={{ ...typography.caption.desktop, color: colors.text.muted }}>
        {hint}
      </p>
    </button>
  );
}

export default UploadZone;
