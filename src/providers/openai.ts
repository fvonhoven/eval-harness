// OpenAI chat completions over raw fetch. No SDK.
import type { ChatClient, ChatRequest, ChatResponse } from "./types.ts";

type OpenAIResponse = {
  model: string;
  choices: { finish_reason: string; message: { content: string | null } }[];
  usage: { prompt_tokens: number; completion_tokens: number };
};

export function openaiClient(apiKey: string, fetchFn: typeof fetch = fetch): ChatClient {
  return async (req: ChatRequest): Promise<ChatResponse> => {
    const messages = [...(req.system ? [{ role: "system", content: req.system }] : []), ...req.messages];
    const body = { model: req.model, max_tokens: req.maxTokens ?? 1024, temperature: req.temperature, messages };
    const started = performance.now();
    const res = await fetchFn("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
    const latencyMs = Math.round(performance.now() - started);
    if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as OpenAIResponse;
    const choice = data.choices[0];
    return {
      text: choice?.message.content ?? "",
      toolCalls: [],
      usage: { inputTokens: data.usage.prompt_tokens, outputTokens: data.usage.completion_tokens },
      latencyMs,
      model: data.model,
      stopReason: choice?.finish_reason ?? "unknown",
    };
  };
}
