import { NextResponse } from "next/server";
import { ZodError } from "zod";

import {
  generateInpiCompanionLlmText,
  INPI_COMPANION_LLM_PAYLOAD_MAX_BYTES,
  isInpiCompanionLlmAllowedForRequest,
  isInpiCompanionLlmConfigured,
  parseInpiCompanionLlmRequest,
} from "@/lib/lmnp/services/inpi/inpi-companion-llm";
import { getServerSupabaseForUser, UnauthorizedError } from "@/lib/supabase-server";

export const maxDuration = 30;

const GENERIC_UNAVAILABLE = { error: "unavailable" } as const;
const GENERIC_INVALID = { error: "invalid" } as const;
const GENERIC_UNAUTHORIZED = { error: "unauthorized" } as const;

/**
 * Point de substitution des tests d'auth uniquement. En production, ce sont
 * les fonctions réelles ; aucun bypass HTTP.
 */
export const inpiCompanionChatRouteDeps = {
  getServerSupabaseForUser,
  generateInpiCompanionLlmText,
};

function readAuthToken(parsed: unknown): string | undefined {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
  const token = (parsed as { authToken?: unknown }).authToken;
  return typeof token === "string" && token.trim() ? token : undefined;
}

function payloadWithoutAuthToken(parsed: unknown): unknown {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return parsed;
  const record = { ...(parsed as Record<string, unknown>) };
  delete record.authToken;
  return record;
}

export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (raw.length > INPI_COMPANION_LLM_PAYLOAD_MAX_BYTES) {
      return NextResponse.json(GENERIC_INVALID, { status: 400 });
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch {
      return NextResponse.json(GENERIC_INVALID, { status: 400 });
    }

    // Identity first — never call OpenAI without a verified session.
    await inpiCompanionChatRouteDeps.getServerSupabaseForUser(readAuthToken(parsedJson));

    const payload = parseInpiCompanionLlmRequest(payloadWithoutAuthToken(parsedJson));
    if (!isInpiCompanionLlmAllowedForRequest(payload)) {
      return NextResponse.json(GENERIC_INVALID, { status: 400 });
    }

    if (!isInpiCompanionLlmConfigured()) {
      return NextResponse.json(GENERIC_UNAVAILABLE, { status: 503 });
    }

    const reply = await inpiCompanionChatRouteDeps.generateInpiCompanionLlmText(payload);
    return NextResponse.json({ text: reply.text });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json(GENERIC_UNAUTHORIZED, { status: 401 });
    }
    if (err instanceof ZodError) {
      return NextResponse.json(GENERIC_INVALID, { status: 400 });
    }
    return NextResponse.json(GENERIC_UNAVAILABLE, { status: 503 });
  }
}
