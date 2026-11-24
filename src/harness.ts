// One eval run: rank the golden set with a client and options, score it, keep the evidence.
import { score, type Metrics } from "./metrics.ts";
import { rankArticles, type RankOptions } from "./rank.ts";
import { costUsd } from "./pricing.ts";
import type { ChatClient } from "./providers/types.ts";
import type { EditorialProfile, GoldenSet, Rated, RunUsage } from "./types.ts";

export type RunRecord = {
  id: string;
  options: RankOptions;
  metrics: Metrics;
  usage: RunUsage;
  costUsd: number;
  rated: Rated[];
  rawResponses: string[];
  // The specific articles the model got wrong by more than one point, for the reader.
  misses: { id: string; title: string; label: number; got: number }[];
};

export function runId(o: RankOptions): string {
  return `${o.variant}/${o.model}/chunk${o.chunkSize}`;
}

export async function evaluate(client: ChatClient, opts: RankOptions, profile: EditorialProfile, golden: GoldenSet): Promise<RunRecord> {
  const articles = golden.articles.map(({ rating: _r, include: _i, note: _n, ...a }) => a);
  const { rated, usage, rawResponses } = await rankArticles(client, opts, profile, articles);
  const metrics = score(rated, golden.articles, profile.maxItems);
  const labels = new Map(golden.articles.map((g) => [g.id, g]));
  const misses = rated
    .filter((r) => r.rating > 0 && Math.abs(r.rating - labels.get(r.id)!.rating) > 1)
    .map((r) => ({ id: r.id, title: r.title, label: labels.get(r.id)!.rating, got: r.rating }));
  return { id: runId(opts), options: opts, metrics, usage, costUsd: costUsd(opts.model, usage.inputTokens, usage.outputTokens), rated, rawResponses, misses };
}
