"use client";

import { useRef, useState } from "react";

interface DocumentUploadZoneProps {
  onFiles: (files: File[]) => void;
  hint?: string;
}

export function DocumentUploadZone({
  onFiles,
  hint = "PDF ou images — l’analyse démarre automatiquement",
}: DocumentUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = (list: FileList | null) => {
    if (!list?.length) return;
    onFiles(Array.from(list));
  };

  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
      className={`w-full rounded-[var(--radius-xl)] border border-dashed px-8 py-14 text-center transition-all duration-200 ${
        dragging
          ? "border-primary/50 bg-primary-muted"
          : "border-stone-200 bg-card hover:border-stone-300 hover:bg-subtle/50"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".pdf,image/*"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <p className="text-sm font-medium text-stone-700">Déposer vos documents</p>
      <p className="mt-2 text-[12px] text-stone-500">{hint}</p>
    </button>
  );
}
