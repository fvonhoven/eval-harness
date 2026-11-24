// List prices in USD per million tokens, as of 2026-09. Prices change; edit here only.

export type Price = { input: number; output: number };

export const PRICES: Record<string, Price> = {
  "claude-opus-4-1": { input: 15.0, output: 75.0 },
  "claude-sonnet-4-5": { input: 3.0, output: 15.0 },
  "claude-haiku-4-5": { input: 1.0, output: 5.0 },
  "gpt-4o": { input: 2.5, output: 10.0 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
};

export function costUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICES[model];
  if (!p) throw new Error(`no price on file for model "${model}"; add it to src/pricing.ts`);
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}
