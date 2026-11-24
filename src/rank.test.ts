import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assign, buildPrompt, buildRequest, pickIssue, rankArticles } from "./rank.ts";
import { VIBECODER } from "./profile.ts";
import type { Article, Rated } from "./types.ts";
import type { ChatClient } from "./providers/types.ts";

const arts: Article[] = [1, 2, 3, 4].map((n) => ({ id: `x${n}`, title: `Title ${n}`, description: `Desc ${n}`, link: `https://e/${n}`, source: n % 2 ? "A" : "B" }));

const canned = (texts: string[]): ChatClient => {
  let i = 0;
  return async (req) => ({ text: texts[i++] ?? "", toolCalls: [], usage: { inputTokens: req.messages[0]!.content.length / 4, outputTokens: 8 }, latencyMs: 10, model: req.model, stopReason: "end_turn" });
};

describe("prompts", () => {
  it("v1 reproduces the production block per article", () => {
    const p = buildPrompt("v1", VIBECODER, arts.slice(0, 2));
    assert.match(p, /--- ARTICLE 1 ---/);
    assert.match(p, /--- ARTICLE 2 ---/);
    assert.match(p, /CRITICAL: Respond with ONLY a single number/);
  });
  it("v2 numbers the list and asks for the numbered form", () => {
    const p = buildPrompt("v2", VIBECODER, arts);
    assert.match(p, /Answer with exactly 4 lines/);
    assert.match(p, /\n4\. Title 4/);
  });
  it("request is deterministic (temperature 0) and sized to the batch", () => {
    const r = buildRequest({ model: "m", variant: "v1", chunkSize: 25 }, VIBECODER, arts);
    assert.equal(r.temperature, 0);
    assert.equal(r.maxTokens, 16 * 4 + 64);
  });
});

describe("assign", () => {
  it("v1: a dropped line shifts every later rating (the production failure mode)", () => {
    const rated = assign("v1", arts, "8\n9\n2", 7); // model skipped one of four
    assert.deepEqual(rated.map((r) => r.rating), [8, 9, 2, 0]);
    assert.equal(rated[3]!.include, false);
  });
  it("v2: a dropped line leaves a gap and keeps the rest aligned", () => {
    const rated = assign("v2", arts, "1. 8\n2. 9\n4. 2", 7);
    assert.deepEqual(rated.map((r) => r.rating), [8, 9, 0, 2]);
  });
  it("v2 tolerates shuffled order", () => {
    const rated = assign("v2", arts, "4. 2\n1. 8\n3. 7\n2. 9", 7);
    assert.deepEqual(rated.map((r) => r.rating), [8, 9, 7, 2]);
  });
});

describe("rankArticles", () => {
  it("chunks the input and merges results in order", async () => {
    const res = await rankArticles(canned(["8\n3", "10\n1"]), { model: "m", variant: "v1", chunkSize: 2 }, VIBECODER, arts);
    assert.deepEqual(res.rated.map((r) => r.rating), [8, 3, 10, 1]);
    assert.equal(res.usage.calls, 2);
  });
  it("a failed call zeroes that batch and the run continues", async () => {
    let n = 0;
    const flaky: ChatClient = async (req) => {
      if (n++ === 0) throw new Error("503 from provider");
      return { text: "9\n9", toolCalls: [], usage: { inputTokens: 1, outputTokens: 1 }, latencyMs: 1, model: req.model, stopReason: "end_turn" };
    };
    const res = await rankArticles(flaky, { model: "m", variant: "v1", chunkSize: 2 }, VIBECODER, arts);
    assert.deepEqual(res.rated.map((r) => r.rating), [0, 0, 9, 9]);
    assert.equal(res.usage.errors, 1);
    assert.match(res.rawResponses[0]!, /ERROR: Error: 503/);
  });
});

describe("pickIssue", () => {
  const rated: Rated[] = [
    { ...arts[0]!, rating: 10, include: true },
    { ...arts[1]!, rating: 9, include: true },
    { ...arts[2]!, rating: 9, include: true },
    { ...arts[3]!, rating: 8, include: true },
  ];
  it("caps per source and backfills from overflow", () => {
    const issue = pickIssue(rated, 3, 1);
    assert.deepEqual(issue.map((r) => r.id), ["x1", "x2", "x3"]);
  });
  it("respects the limit", () => {
    assert.equal(pickIssue(rated, 2, 0).length, 2);
  });
});
