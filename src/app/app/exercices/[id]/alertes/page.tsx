"use client";

import { AlertList } from "@/components/lmnp/shared/AlertList";
import { PageHeader } from "@/components/lmnp/shared/PageHeader";
import { useLmnp } from "@/lib/lmnp/store";

export default function AlertesPage() {
  const { workspace } = useLmnp();

  return (
    <div>
      <PageHeader
        title="À clarifier"
        description={
          workspace.openAlertCount === 0
            ? "Rien à signaler — votre assistant a tout ce qu’il lui faut."
            : `${workspace.openAlertCount} rappel${workspace.openAlertCount > 1 ? "s" : ""} pour compléter sereinement votre dossier.`
        }
      />
      <AlertList alerts={workspace.alerts} limit={50} />
    </div>
  );
}
