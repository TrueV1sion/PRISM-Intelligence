/**
 * Anthropic SDK Client Wrapper
 *
 * Provides a singleton Anthropic client, model routing per pipeline phase,
 * extended thinking configuration, and prompt caching helpers.
 */

import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;
let clientApiKey: string | undefined;

export function getAnthropicClient(): Anthropic {
  const currentKey = process.env.ANTHROPIC_API_KEY;
  // Recreate client if the API key has changed (e.g., user saved a new key via Platform Settings)
  if (!client || (currentKey && currentKey !== clientApiKey)) {
    clientApiKey = currentKey;
    client = new Anthropic({ apiKey: currentKey });
  }
  return client;
}

/** Reset the cached client — forces re-creation on next getAnthropicClient() call */
export function resetAnthropicClient(): void {
  client = null;
  clientApiKey = undefined;
}

// ─── Model Routing ──────────────────────────────────────────

/** Model assignments per pipeline phase */
export const MODELS = {
  THINK: "claude-opus-4-6",
  CONSTRUCT: "claude-sonnet-4-6",
  DEPLOY: "claude-sonnet-4-6",
  CRITIC: "claude-opus-4-6",
  SYNTHESIZE: "claude-opus-4-6",
  PRESENT: "claude-opus-4-6",
} as const;

export type PipelinePhase = keyof typeof MODELS;

// ─── Extended Thinking ──────────────────────────────────────

/** Default extended thinking config for phases that need deep reasoning */
export const EXTENDED_THINKING: Anthropic.Messages.ThinkingConfigEnabled = {
  type: "enabled",
  budget_tokens: 10_000,
};

// ─── Prompt Caching ─────────────────────────────────────────

/**
 * Wraps a system prompt string in a TextBlockParam with ephemeral cache control.
 * Use this in the `system` array of a messages.create() call to enable
 * Anthropic prompt caching for frequently-reused system prompts.
 */
export function cachedSystemPrompt(
  text: string,
): Anthropic.Messages.TextBlockParam {
  return {
    type: "text",
    text,
    cache_control: { type: "ephemeral" },
  };
}

// ─── Web Search Tool ────────────────────────────────────────

/** Anthropic's native web search server tool definition */
export const WEB_SEARCH_TOOL: Anthropic.Messages.WebSearchTool20250305 = {
  type: "web_search_20250305",
  name: "web_search",
};
