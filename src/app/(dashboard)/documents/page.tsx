import { Suspense } from "react";

import { DocumentsWorkspace } from "@/components/lmnp/documents/DocumentsWorkspace";

export default function DocumentsPage() {
  return (
    <Suspense fallback={<p>Chargement…</p>}>
      <DocumentsWorkspace />
    </Suspense>
  );
}
