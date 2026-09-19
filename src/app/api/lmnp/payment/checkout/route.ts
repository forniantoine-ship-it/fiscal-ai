import { handleCheckoutRequest } from "@/lib/lmnp/services/payment/checkout-handler";

export async function POST(request: Request) {
  return handleCheckoutRequest(request);
}
