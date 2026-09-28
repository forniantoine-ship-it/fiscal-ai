import type { V3DocumentsReadModel, V3DocumentProcessingStatus } from "./document-read-model";

const STATUS_LABEL: Record<V3DocumentProcessingStatus, string> = {
  uploaded: "Reçu",
  processing: "Analyse en cours",
  analyzed: "Analysé",
  failed: "Analyse à reprendre",
  unknown: "État non déterminé",
};

function uploadedDate(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(date);
}

export function RealDocumentsList({ model, onOpen, busyId, openError, classes }: {
  model: V3DocumentsReadModel;
  onOpen?: (documentId: string) => void;
  busyId?: string | null;
  openError?: string | null;
  classes: Record<string, string>;
}) {
  if (model.state === "unknown") {
    return <div className={classes.emptyCard} role="alert"><h2>Documents indisponibles</h2><p>Nous ne pouvons pas charger vos documents pour le moment.</p></div>;
  }
  if (model.documents.length === 0) {
    return <div className={classes.emptyCard}><h2>Aucun document enregistré</h2><p>Aucun document enregistré pour ce dossier et cet exercice.</p></div>;
  }
  return <section aria-label="Documents du dossier" className={classes.realDocumentList}>
    {openError ? <p role="alert" className={classes.realDocumentError}>{openError}</p> : null}
    {model.documents.map(document => {
      const date = uploadedDate(document.uploadedAt);
      return <article key={document.id} className={classes.realDocumentRow}>
        <div className={classes.realDocumentBody}>
          <h2>{document.label}</h2>
          {document.label !== document.fileName ? <p className={classes.realDocumentFileName}>{document.fileName}</p> : null}
          <p className={classes.realDocumentMeta}>
            <span>{STATUS_LABEL[document.processingStatus]}</span>
            <span>{document.fiscalYear === undefined ? "Exercice non déterminé" : `Exercice ${document.fiscalYear}`}</span>
            {date ? <span>Reçu le {date}</span> : null}
          </p>
        </div>
        {onOpen ? <button type="button" className={classes.secondaryButton} disabled={busyId !== null && busyId !== undefined} onClick={() => onOpen(document.id)}>{busyId === document.id ? "Ouverture…" : "Ouvrir"}</button> : null}
      </article>;
    })}
  </section>;
}
