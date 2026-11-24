// The ranking stage under test. Two prompt variants share one interface so the harness can
// score them side by side.
//
//   v1  the production prompt: one block per article, "respond with ONLY the rating number,
//       one per line". Parsed positionally with parseRatings.
//   v2  a numbered list with a stricter answer format "<n>. <rating>", parsed by position
//       with parseNumberedRatings, so a dropped or merged line cannot shift its neighbours.
import { parseNumberedRatings, parseRatings } from "./parse.ts";
import type { ChatClient, ChatRequest } from "./providers/types.ts";
import type { Article, EditorialProfile, Rated, RunUsage } from "./types.ts";

export type PromptVariant = "v1" | "v2";

export type RankOptions = {
  model: string;
  variant: PromptVariant;
  chunkSize: number;
  temperature?: number;
};

export function buildPrompt(variant: PromptVariant, profile: EditorialProfile, batch: Article[]): string {
  if (variant === "v1") {
    let p = "I will provide multiple articles to rate. For each article, respond with ONLY the rating number (1-10), one per line.\n\n";
    batch.forEach((a, i) => {
      p += `\n--- ARTICLE ${i + 1} ---\n`;
      p +=
        `Rate this article's relevance to ${profile.newsletterName}, focused on ${profile.contentFocus}.\n\n` +
        `Article Title: ${a.title}\nArticle Description: ${a.description.slice(0, 500)}\nArticle Link: ${a.link}\n\n` +
        `RATING CRITERIA:\n${profile.rankingCriteria}\n\n` +
        `CRITICAL: Respond with ONLY a single number between 1 and 10. No text, no explanation, just the number.\n\nRating:`;
      p += "\n";
    });
    return p;
  }
  const lines = batch.map((a, i) => `${i + 1}. ${a.title}\n   ${a.description.slice(0, 500).replace(/\s+/g, " ")}\n   source: ${a.source}`);
  return (
    `You rate articles for ${profile.newsletterName}, which covers ${profile.contentFocus}.\n\n` +
    `Rating criteria:\n${profile.rankingCriteria}\n\n` +
    `Rate every article below from 1 to 10. Answer with exactly ${batch.length} lines, in order, in the form "<number>. <rating>" and nothing else.\n\n` +
    lines.join("\n\n")
  );
}

export function buildRequest(opts: RankOptions, profile: EditorialProfile, batch: Article[]): ChatRequest {
  return {
    model: opts.model,
    messages: [{ role: "user", content: buildPrompt(opts.variant, profile, batch) }],
    maxTokens: 16 * batch.length + 64,
    temperature: opts.temperature ?? 0,
  };
}

// Assigns ratings to a batch exactly as production does: positional for v1 (missing tail
// positions get 0), by number for v2 (missing positions get 0).
export function assign(variant: PromptVariant, batch: Article[], text: string, minimum: number): Rated[] {
  if (variant === "v1") {
    const ratings = parseRatings(text);
    return batch.map((a, i) => {
      const r = i < ratings.length ? ratings[i]! : 0;
      return { ...a, rating: r, include: r >= minimum };
    });
  }
  const byPos = parseNumberedRatings(text);
  return batch.map((a, i) => {
    const r = byPos.get(i + 1) ?? 0;
    return { ...a, rating: r, include: r >= minimum };
  });
}

export type RankResult = { rated: Rated[]; usage: RunUsage; rawResponses: string[] };

export async function rankArticles(
  client: ChatClient,
  opts: RankOptions,
  profile: EditorialProfile,
  articles: Article[],
): Promise<RankResult> {
  const rated: Rated[] = [];
  const rawResponses: string[] = [];
  const usage: RunUsage = { calls: 0, inputTokens: 0, outputTokens: 0, latencyMs: 0, errors: 0 };
  for (let start = 0; start < articles.length; start += opts.chunkSize) {
    const batch = articles.slice(start, start + opts.chunkSize);
    usage.calls += 1;
    try {
      const res = await client(buildRequest(opts, profile, batch));
      usage.inputTokens += res.usage.inputTokens;
      usage.outputTokens += res.usage.outputTokens;
      usage.latencyMs += res.latencyMs;
      rawResponses.push(res.text);
      rated.push(...assign(opts.variant, batch, res.text, profile.minimumRating));
    } catch (err) {
      // Production behaviour on a failed call: nothing in this batch is rated or included.
      usage.errors += 1;
      rawResponses.push(`ERROR: ${String(err)}`);
      rated.push(...batch.map((a) => ({ ...a, rating: 0, include: false })));
    }
  }
  return { rated, usage, rawResponses };
}

// Issue selection, ported from pick_issue: top rated first, at most maxPerSource from one
// feed, overflow fills remaining slots.
export function pickIssue(rated: Rated[], limit: number, maxPerSource: number): Rated[] {
  const sorted = [...rated].sort((a, b) => b.rating - a.rating);
  const chosen: Rated[] = [];
  const perSource = new Map<string, number>();
  const overflow: Rated[] = [];
  for (const it of sorted) {
    if (!it.include) continue;
    if (maxPerSource && (perSource.get(it.source) ?? 0) >= maxPerSource) {
      overflow.push(it);
      continue;
    }
    perSource.set(it.source, (perSource.get(it.source) ?? 0) + 1);
    chosen.push(it);
    if (chosen.length >= limit) return chosen;
  }
  return [...chosen, ...overflow].slice(0, limit);
}
