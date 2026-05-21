"use client";

import { useCallback, useRef, useState } from "react";
import type { DocumentCategory, UploadedDocument } from "./types";
import { DOCUMENT_CATEGORIES } from "./types";

interface DocumentDropZoneProps {
  documents: UploadedDocument[];
  onDocumentsAdd: (docs: UploadedDocument[]) => void;
  onDocumentRemove: (id: string) => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function categoryLabel(category: DocumentCategory): string {
  return DOCUMENT_CATEGORIES.find((c) => c.id === category)?.label ?? category;
}

export function DocumentDropZone({
  documents,
  onDocumentsAdd,
  onDocumentRemove,
}: DocumentDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<DocumentCategory>("bail");

  const processFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList?.length) return;

      const accepted = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
      const newDocs: UploadedDocument[] = [];

      Array.from(fileList).forEach((file) => {
        if (!accepted.includes(file.type) && !file.name.match(/\.(pdf|jpe?g|png|webp)$/i)) {
          return;
        }
        newDocs.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          name: file.name,
          size: file.size,
          type: file.type || "application/octet-stream",
          category: selectedCategory,
        });
      });

      if (newDocs.length > 0) {
        onDocumentsAdd(newDocs);
      }
    },
    [onDocumentsAdd, selectedCategory],
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    processFiles(e.dataTransfer.files);
  };

  return (
    <div className="space-y-6">
      <div>
        <label className="mb-2 block text-sm font-medium text-stone-700">
          Catégorie du document
        </label>
        <div className="flex flex-wrap gap-2">
          {DOCUMENT_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                selectedCategory === cat.id
                  ? "bg-accent-muted text-accent ring-1 ring-accent/30"
                  : "bg-stone-100 text-stone-600 ring-1 ring-stone-200 hover:bg-stone-200/40 hover:text-stone-800"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`group relative cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed p-10 text-center transition-all duration-300 ${
          isDragging
            ? "border-accent bg-accent/10 scale-[1.01]"
            : "border-stone-200 bg-stone-100/80 hover:border-emerald-500/40 hover:bg-accent/5"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.webp,image/*,application/pdf"
          className="hidden"
          onChange={(e) => {
            processFiles(e.target.files);
            e.target.value = "";
          }}
        />

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-emerald-500/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

        <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10 ring-1 ring-accent/20">
          <svg
            className={`h-8 w-8 transition-colors ${isDragging ? "text-accent" : "text-accent/70"}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
        </div>

        <p className="relative mt-4 text-base font-semibold text-stone-800">
          {isDragging ? "Déposez vos fichiers ici" : "Glissez-déposez vos documents"}
        </p>
        <p className="relative mt-2 text-sm text-stone-500">
          ou <span className="text-accent">parcourir</span> — PDF, JPG, PNG (max 10 Mo)
        </p>
        <p className="relative mt-3 text-xs text-stone-500">
          {DOCUMENT_CATEGORIES.find((c) => c.id === selectedCategory)?.hint}
        </p>
      </div>

      {documents.length > 0 && (
        <ul className="space-y-2">
          {documents.map((doc) => (
            <li
              key={doc.id}
              className="glass flex items-center gap-3 rounded-xl px-4 py-3 transition-colors hover:bg-stone-100"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-stone-800">{doc.name}</p>
                <p className="text-xs text-stone-500">
                  {categoryLabel(doc.category)} · {formatSize(doc.size)}
                </p>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDocumentRemove(doc.id);
                }}
                className="rounded-lg p-2 text-stone-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
                aria-label={`Supprimer ${doc.name}`}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
