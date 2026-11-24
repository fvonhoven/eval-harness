// A deterministic stand-in for a model, used to build the replay fixture when no API key is
// available and in tests. It rates from the golden labels with seeded noise and reproduces the
// formatting habits seen from real models: an occasional preamble, a "7/10", a dropped line.
// Every number this produces is labeled as synthetic wherever it is printed.
import { parseRatings } from "./parse.ts";
import type { ChatClient, ChatRequest, ChatResponse } from "./providers/types.ts";
import type { Labeled } from "./types.ts";

export function seededRandom(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10_000) / 10_000;
  };
}

export type ScriptedOptions = {
  seed: number;
  noise: number; // probability a rating is off by one
  preamble: number; // probability of a leading sentence
  slashForm: number; // probability of "7/10" instead of "7"
  dropLine: number; // probability one line is omitted (v1 only; v2 is numbered)
  modelBias?: number; // added to every rating before clamping, to imitate a lenient model
};

const PRESETS: Record<string, ScriptedOptions> = {
  "gpt-4o-mini": { seed: 11, noise: 0.3, preamble: 0.15, slashForm: 0.1, dropLine: 0.1, modelBias: 0 },
  "claude-haiku-4-5": { seed: 23, noise: 0.25, preamble: 0.05, slashForm: 0.0, dropLine: 0.05, modelBias: 1 },
};

export function presetFor(model: string): ScriptedOptions {
  return PRESETS[model] ?? { seed: 1, noise: 0.3, preamble: 0.1, slashForm: 0.1, dropLine: 0.1 };
}

// Finds which golden articles a prompt contains, in order, by title.
function articlesInPrompt(prompt: string, golden: Labeled[]): Labeled[] {
  const found = golden
    .map((g) => ({ g, at: prompt.indexOf(g.title) }))
    .filter((x) => x.at >= 0)
    .sort((a, b) => a.at - b.at);
  return found.map((x) => x.g);
}

export function scriptedClient(golden: Labeled[], optsByModel: (model: string) => ScriptedOptions = presetFor): ChatClient {
  const rngs = new Map<string, () => number>();
  return async (req: ChatRequest): Promise<ChatResponse> => {
    const opts = optsByModel(req.model);
    const rng = rngs.get(req.model) ?? seededRandom(opts.seed);
    rngs.set(req.model, rng);
    const prompt = req.messages[req.messages.length - 1]!.content;
    const numbered = /"<number>\. <rating>"/.test(prompt);
    const batch = articlesInPrompt(prompt, golden);
    const lines: string[] = [];
    batch.forEach((g, i) => {
      let r = g.rating + (opts.modelBias ?? 0);
      const u = rng();
      if (u < opts.noise / 2) r -= 1;
      else if (u < opts.noise) r += 1;
      r = Math.max(1, Math.min(10, r));
      if (!numbered && rng() < opts.dropLine) return; // the model skipped this one
      const value = !numbered && rng() < opts.slashForm ? `${r}/10` : String(r);
      lines.push(numbered ? `${i + 1}. ${value}` : value);
    });
    let text = lines.join("\n");
    if (rng() < opts.preamble) text = "Here are the ratings:\n\n" + text;
    const inputTokens = Math.round(prompt.length / 4);
    const outputTokens = Math.max(1, Math.round(text.length / 3));
    return { text, toolCalls: [], usage: { inputTokens, outputTokens }, latencyMs: 400 + Math.round(rng() * 900), model: req.model, stopReason: "end_turn" };
  };
}

// Used by tests to confirm the scripted client is parseable by the production parser.
export function countParsable(text: string): number {
  return parseRatings(text).length;
}
