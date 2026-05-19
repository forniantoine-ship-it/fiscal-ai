"use client";

import { AlertList } from "@/components/lmnp/shared/AlertList";
import { PageHeader } from "@/components/lmnp/shared/PageHeader";
import { useLmnp } from "@/lib/lmnp/store";

export default function AlertesPage() {
  const { workspace } = useLmnp();

  return (
    <div>
      <PageHeader
        title="Alertes"
        description="Points à traiter pour avancer sereinement. Les blocages empêchent la clôture future."
      />
      <AlertList alerts={workspace.alerts} limit={50} />
    </div>
  );
}
