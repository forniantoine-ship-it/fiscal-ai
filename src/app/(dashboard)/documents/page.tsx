import { Suspense } from "react";

import { DocumentsPageClient } from "@/components/lmnp/documents/DocumentsPageClient";

export default function DocumentsPage() {
  return (
    <Suspense fallback={<p>Chargement…</p>}>
      <DocumentsPageClient />
    </Suspense>
  );
}
