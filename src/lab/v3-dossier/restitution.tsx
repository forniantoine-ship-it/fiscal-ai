"use client";

/**
 * Grammaire commune de restitution — indépendante du domaine.
 *
 * Résultat → tableau → provenance → détail → correction. Financement est le
 * seul domaine simulé ; ces composants ne connaissent aucun champ métier.
 */

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { SourceRef } from "./fixtures";
import styles from "./prototype.module.css";

export const money = (value: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value) + " €";

/** Montant principal du domaine, toujours plus visible que les données qui suivent. */
export function ResultHeadline({ eyebrow = "Ce que ça donne", amount, caption, breakdown }: {
  eyebrow?: string;
  amount: string;
  caption: string;
  breakdown?: Array<{ amount: string; label: string }>;
}) {
  return <section className={styles.headline} aria-label={eyebrow}>
    <p className={styles.eyebrow}>{eyebrow}</p>
    <p className={styles.headlineAmount}>{amount}</p>
    <p className={styles.headlineCaption}>{caption}</p>
    {breakdown?.length ? <ul className={styles.breakdown}>
      {breakdown.map(item => <li key={item.label}><strong>{item.amount}</strong><span>{item.label}</span></li>)}
    </ul> : null}
  </section>;
}

/** Source attachée à une ligne ; le détail de provenance s’ouvre au survol, au focus ou au clic. */
export function SourceLink({ source, prefix = false }: { source: SourceRef; prefix?: boolean }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return <span ref={ref} className={styles.source} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
    <button type="button" className={styles.sourceButton} aria-expanded={open} aria-describedby={open ? id : undefined}
      onClick={() => setOpen(value => !value)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
      onKeyDown={event => { if (event.key === "Escape") setOpen(false); }}>
      {prefix ? <span aria-hidden="true">↳ </span> : null}{source.document}
    </button>
    {open ? <span role="tooltip" id={id} className={styles.sourcePopover}><strong>{source.document}</strong>{source.detail}</span> : null}
  </span>;
}

export function StatusMark({ tone, label }: { tone: "ok" | "attention" | "corrected"; label: string }) {
  const glyph = tone === "ok" ? "✓" : tone === "corrected" ? "✎" : "!";
  return <span className={`${styles.status} ${styles[`status_${tone}`]}`}><span aria-hidden="true">{glyph}</span><span className={tone === "ok" ? styles.srOnly : undefined}>{label}</span></span>;
}

export type Column<Row> = {
  key: string;
  label: string;
  numeric?: boolean;
  render: (row: Row) => ReactNode;
  /** Valeur de la ligne de total, si la colonne en a une. */
  total?: ReactNode;
};

/** Tableau de restitution : lignes légères, source et état en colonnes secondaires, total appuyé. */
export function RestitutionTable<Row>({ caption, columns, rows, rowKey, totalLabel }: {
  caption: string;
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  totalLabel?: string;
}) {
  const hasTotal = columns.some(column => column.total !== undefined);
  return <div className={styles.tableWrap}>
    <table className={styles.table}>
      <caption className={styles.srOnly}>{caption}</caption>
      <thead><tr>{columns.map(column => <th key={column.key} scope="col" className={column.numeric ? styles.numeric : undefined}>{column.label}</th>)}</tr></thead>
      <tbody>{rows.map(row => <tr key={rowKey(row)}>{columns.map((column, index) => index === 0
        ? <th key={column.key} scope="row">{column.render(row)}</th>
        : <td key={column.key} className={column.numeric ? styles.numeric : undefined}>{column.render(row)}</td>)}</tr>)}</tbody>
      {hasTotal ? <tfoot><tr>{columns.map((column, index) => index === 0
        ? <th key={column.key} scope="row">{totalLabel ?? "Total"}</th>
        : <td key={column.key} className={column.numeric ? styles.numeric : undefined}>{column.total ?? null}</td>)}</tr></tfoot> : null}
    </table>
  </div>;
}

/** Grammaire annoncée pour un domaine non encore simulé : les colonnes, sans données inventées. */
export function RestitutionShape({ columns }: { columns: string[] }) {
  return <div className={styles.tableWrap}>
    <table className={styles.table}>
      <caption className={styles.srOnly}>Colonnes prévues</caption>
      <thead><tr>{columns.map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
      <tbody><tr><td colSpan={columns.length} className={styles.shapeEmpty}>Tableau de restitution non simulé dans ce LAB.</td></tr></tbody>
    </table>
  </div>;
}

export type Piece = { name: string; state: "done" | "reading"; note?: string };

export function PiecesList({ pieces, onAdd, addLabel = "Ajouter une pièce" }: { pieces: Piece[]; onAdd?: () => void; addLabel?: string }) {
  return <div className={styles.pieces}>
    <ul>{pieces.map(piece => <li key={piece.name}>
      <span className={styles.fileGlyph} aria-hidden="true">▤</span>
      <span className={styles.pieceName}>{piece.name}{piece.note ? <small>{piece.note}</small> : null}</span>
      <span className={piece.state === "done" ? styles.pieceDone : styles.pieceReading}>{piece.state === "done" ? "✓ Analyse terminée" : "Lecture en cours…"}</span>
    </li>)}</ul>
    {onAdd ? <button type="button" className={styles.secondaryButton} onClick={onAdd}>{addLabel}</button> : null}
  </div>;
}

/**
 * Lecture simulée d’une ou plusieurs pièces : les fichiers sont reconnus un à
 * un, sur place. Aucun fichier n’est lu ; aucun changement de vue.
 */
export function DocumentReading({ files, onComplete, title = "Je lis vos documents…" }: { files: string[]; onComplete: () => void; title?: string }) {
  const [step, setStep] = useState(0);
  const done = useRef(onComplete);
  useEffect(() => { done.current = onComplete; }, [onComplete]);
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const delay = reduced ? 150 : 900;
    if (step > files.length) return;
    const timer = window.setTimeout(() => {
      if (step === files.length) done.current();
      else setStep(value => value + 1);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [step, files.length]);
  return <div className={styles.reading} role="status" aria-live="polite">
    <p className={styles.readingTitle}><span className={styles.liveDot} aria-hidden="true" />{title}</p>
    <ul>{files.map((file, index) => <li key={file} className={index < step ? styles.readingDone : undefined}>
      <span aria-hidden="true">{index < step ? "✓" : "·"}</span>{file} {index < step ? "reconnu" : index === step ? "en cours de lecture" : "en attente"}
    </li>)}</ul>
  </div>;
}

export function Findings({ items }: { items: string[] }) {
  return <ul className={styles.findings}>{items.map((item, index) => <li key={item} style={{ animationDelay: `${index * 90}ms` }}><span aria-hidden="true">✓</span>{item}</li>)}</ul>;
}
