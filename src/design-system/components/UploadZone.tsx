"use client";
import { uploadFilesForUser } from "@/lib/uploadDocument";
import { supabase } from "@/lib/supabase";
import { useRef, useState, type DragEvent } from "react";

import { colors } from "@/design-system/theme/colors";
import { motions } from "@/design-system/theme/motions";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";

export type UploadZoneProps = {
  onFiles: (files: File[], meta?: { supabaseDocumentIds: string[] }) => void;
  hint?: string;
  title?: string;
  accept?: string;
  multiple?: boolean;
  className?: string;
};

export function UploadZone({
  onFiles,
  hint = "PDF ou images — dépôt multiple accepté",
  title = "TEST SUPABASE UPLOAD",
  accept = ".pdf,image/*",
  multiple = true,
  className = "",
}: UploadZoneProps) {

  console.log("REAL UPLOADZONE");

  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);

  const handleFiles = async (list: FileList | null) => {
    if (!list?.length) return;
  
    const files = Array.from(list);
    console.log("UPLOAD START", files);
  
    try {
      const response = await supabase.auth.getUser();
    
      console.log("USER RESPONSE", response);
    
      const user = response.data.user;
    
      if (!user) {
        alert("Utilisateur non connecté");
        return;
      }
    
      const { files: uploadedFiles, documentIds: supabaseDocumentIds } =
        await uploadFilesForUser(files, user.id);

      if (uploadedFiles.length === 0) {
        console.error("[UploadZone] upload failed: no files stored in Supabase");
        return;
      }

      onFiles(uploadedFiles, { supabaseDocumentIds });
    
    } catch (e) {
      console.error("AUTH ERROR", e);
      alert("AUTH ERROR");
    }

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


