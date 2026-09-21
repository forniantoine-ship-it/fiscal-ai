import { handleFiscalYearTransitionRequest } from "@/lib/lmnp/services/fiscal-year-transition/transition-handler";

export async function POST(request: Request) {
  return handleFiscalYearTransitionRequest(request);
}
