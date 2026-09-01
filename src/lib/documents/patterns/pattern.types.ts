import type { DocumentTunnel } from "../types/document-tunnel";
import type { DocumentType } from "../types/document-type";

/**
 * Declarative signals used by rule-based scoring before / alongside ML classifiers.
 */
export type DocumentPatternSignal = {
  id: string;
  weight: number;
  /** Case-insensitive substring match on normalized OCR text */
  keywords?: string[];
  /** Case-insensitive regex tested on normalized OCR text */
  regex?: RegExp[];
  /** Filename hints (applied before OCR when available) */
  fileNameKeywords?: string[];
};

export type DocumentPattern = {
  id: string;
  documentType: DocumentType;
  label: string;
  version: string;
  /** Tunnels where this pattern is a strong prior */
  tunnels: DocumentTunnel[];
  signals: DocumentPatternSignal[];
  /** Minimum aggregate score to consider a match (0–1) */
  matchThreshold: number;
};

export type PatternMatchDetail = {
  patternId: string;
  signalId: string;
  matched: boolean;
  contribution: number;
};
