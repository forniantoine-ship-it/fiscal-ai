import { handleAide2042PdfRequest } from "./handler";

export async function POST(request: Request) {
  return handleAide2042PdfRequest(request);
}
