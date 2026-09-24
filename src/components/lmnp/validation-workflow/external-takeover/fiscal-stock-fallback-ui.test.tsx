/**
 * Rendu des questions de stocks : trois réponses, inconnu bloquant.
 * Run: npx tsx --test src/components/lmnp/validation-workflow/external-takeover/fiscal-stock-fallback-ui.test.tsx
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";

import { explicitAnswer } from "@/lib/lmnp/services/takeover/review-answers";
import { EXTERNAL_TAKEOVER_COPY } from "./external-takeover-copy";
import { ExternalTakeoverExceptionForms } from "./ExternalTakeoverResults";

const noop = () => undefined;

function renderStocks(options?: {
  deficitsNotice?: boolean;
  ardNotice?: boolean;
  deficitsValue?: [] | { millesime: number; montant: number }[];
  ardValue?: number;
  questions?: Array<{ code: "DEFICITS_REQUIRED" } | { code: "ARD_REQUIRED" }>;
}) {
  return renderToStaticMarkup(
    <ExternalTakeoverExceptionForms
      questions={options?.questions ?? [{ code: "DEFICITS_REQUIRED" }, { code: "ARD_REQUIRED" }]}
      properties={[]}
      onProperty={noop}
      onPropertyBulkYes={noop}
      onPropertyBulkNo={noop}
      onProrata={noop}
      onClassification={noop}
      onClassificationSuggestionsConfirm={noop}
      onDeficitsNone={noop}
      onDeficitsRows={noop}
      onDeficitsUnknown={noop}
      onArdNone={noop}
      onArdAmount={noop}
      onArdUnknown={noop}
      stockNotices={{
        deficits: Boolean(options?.deficitsNotice),
        ard: Boolean(options?.ardNotice),
      }}
      reviewAnswers={{
        ...(options?.deficitsValue
          ? { deficits: explicitAnswer(options.deficitsValue) }
          : {}),
        ...(options?.ardValue !== undefined
          ? {
              amortissementsReportes: explicitAnswer(options.ardValue),
              amortissementsReportesSource: "manual_entry" as const,
            }
          : {}),
      }}
    />,
  );
}

function visibleText(html: string): string {
  return html.replace(/&#x27;/g, "'").replace(/<[^>]+>/g, " ");
}

describe("UI stocks fiscaux — trois réponses", () => {
  it("propose oui, confirmation de zéro et je ne sais pas", () => {
    const html = visibleText(renderStocks());
    assert.match(html, /Oui, il me restait des déficits à reporter/);
    assert.match(html, /aucun déficit LMNP restant à reporter/);
    assert.match(html, /aucun amortissement non déduit restant à reporter/);
    assert.match(html, /Si vous n'êtes pas sûr/);
    assert.equal((html.match(/Je ne sais pas/g) ?? []).length >= 2, true);
    assert.doesNotMatch(html, /DEFICITS_REQUIRED|ARD_REQUIRED|CandidateValue/);
  });

  it("après je ne sais pas, explique que l'information reste nécessaire", () => {
    const html = renderStocks({ deficitsNotice: true, ardNotice: true });
    assert.equal(
      (html.match(new RegExp(EXTERNAL_TAKEOVER_COPY.stockStillNeeded, "g")) ?? []).length,
      2,
    );
    assert.doesNotMatch(html, /0 restante|Reprise prête|Reprise validée/i);
  });

  it("une absence confirmée se relit comme une déclaration, pas comme un zéro nu", () => {
    const html = renderStocks({
      questions: [],
      deficitsValue: [],
      ardValue: 0,
    });
    assert.match(html, /aucun déficit LMNP restant à reporter/);
    assert.match(html, /aucun amortissement non déduit restant à reporter/);
    assert.match(html, /Modifier ma réponse/);
    assert.doesNotMatch(html, /0\s*€/);
  });
});
