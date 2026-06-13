import { createAnthropic } from "@ai-sdk/anthropic";

// Anthropic provider. Use SUMMARY_MODEL for passive/background analysis
// (document summaries, insights, filename suggestions, weekly re-analysis),
// and CHAT_MODEL for user-facing chat and document generation.
export function createAnthropicProvider(apiKey: string) {
  return createAnthropic({ apiKey });
}

// Back-compat alias so existing imports keep working.
export const createLovableAiGatewayProvider = createAnthropicProvider;

export const CHAT_MODEL = "claude-sonnet-4-6";
export const SUMMARY_MODEL = "claude-haiku-4-5-20251001";
