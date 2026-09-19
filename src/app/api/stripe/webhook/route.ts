import { handleStripeWebhook } from "@/lib/lmnp/services/payment/webhook-handler";

// Le corps brut est nécessaire à la vérification de signature (App Router : request.text()).
export async function POST(request: Request) {
  return handleStripeWebhook(request);
}
