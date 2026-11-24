// Anthropic Messages API over raw fetch. No SDK.
import type { ChatClient, ChatRequest, ChatResponse } from "./types.ts";

type AnthropicResponse = {
  content: { type: "text"; text: string }[];
  model: string;
  stop_reason: string;
  usage: { input_tokens: number; output_tokens: number };
};

export function anthropicClient(apiKey: string, fetchFn: typeof fetch = fetch): ChatClient {
  return async (req: ChatRequest): Promise<ChatResponse> => {
    const body = {
      model: req.model,
      max_tokens: req.maxTokens ?? 1024,
      temperature: req.temperature,
      system: req.system,
      messages: req.messages,
    };
    const started = performance.now();
    const res = await fetchFn("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(body),
    });
    const latencyMs = Math.round(performance.now() - started);
    if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as AnthropicResponse;
    return {
      text: data.content.filter((c) => c.type === "text").map((c) => c.text).join(""),
      toolCalls: [],
      usage: { inputTokens: data.usage.input_tokens, outputTokens: data.usage.output_tokens },
      latencyMs,
      model: data.model,
      stopReason: data.stop_reason,
    };
  };
}
