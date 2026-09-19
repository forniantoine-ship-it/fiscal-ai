import { handlePriorHistoryRequest } from "@/lib/lmnp/services/payment/prior-history-handler";

export async function POST(request: Request) {
  return handlePriorHistoryRequest(request);
}
