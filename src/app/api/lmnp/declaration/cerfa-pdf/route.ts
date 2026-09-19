import { handleCerfaPdfRequest } from "./handler";

export async function POST(request: Request) {
  return handleCerfaPdfRequest(request);
}
