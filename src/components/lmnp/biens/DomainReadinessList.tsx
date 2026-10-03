import type { MultiPropertyReasonView } from "@/lib/lmnp/dossier/multi-property-domain-messages";

/** MB-MULTI-UX-1 — blocages du domaine, tels que décrits par la garde (messages traduits, aucune règle ici). */
export function DomainReadinessList({ reasons, supported }: { reasons: readonly MultiPropertyReasonView[]; supported: boolean }) {
  if (supported) {
    return <p role="status" className="rounded-lg border p-3 text-sm">Votre dossier est dans le périmètre pris en charge pour plusieurs biens.</p>;
  }
  return (
    <section aria-label="Points à traiter" className="rounded-lg border p-4">
      <h2 className="mb-2 text-base font-medium">Points à traiter</h2>
      <ul role="list" className="flex flex-col gap-2 text-sm">
        {reasons.map((reason) => (
          <li key={`${reason.code}|${reason.propertyId ?? ""}`} data-reason={reason.code}>
            {reason.propertyLabel ? <strong>{reason.propertyLabel} — </strong> : null}
            {reason.message}
          </li>
        ))}
      </ul>
    </section>
  );
}
